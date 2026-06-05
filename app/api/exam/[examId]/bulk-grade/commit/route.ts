import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { bulkGradeCommitSchema, validateRequest } from "@/lib/validations";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { isCaseQuestion, normalizeQuestions } from "@/lib/grading-helpers";

const COMMITTING_STALE_MS = 2 * 60 * 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json();
    const validation = validateRequest(bulkGradeCommitSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const { grades } = validation.data;

    const rl = await checkRateLimitAsync(
      `bulk-grade-commit:${user?.id ?? "anon"}:${examId}`,
      RATE_LIMITS.general,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireClosed: true,
    });
    if (!access.ok) return access.response;

    const supabase = access.ctx.supabase;

    // [QA CRITICAL] 2-step ownership check:
    // Step 1 — exam.instructor_id === user.id (done by requireBulkGradeAccess)
    // Step 2 — all session_ids in grades belong to this exam
    const uniqueSessionIds = [...new Set(grades.map((g) => g.session_id))];
    const { data: validSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .in("id", uniqueSessionIds)
      .eq("exam_id", examId);

    if (sessionsError) {
      logError("bulk-grade commit: session ownership check failed", sessionsError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to verify sessions", 500);
    }

    if ((validSessions?.length ?? 0) !== uniqueSessionIds.length) {
      return errorJson(
        "FORBIDDEN",
        "One or more session IDs do not belong to this exam",
        403,
      );
    }

    const caseQIdxes = new Set(
      normalizeQuestions(access.ctx.exam.questions)
        .filter((q) => isCaseQuestion(q.type))
        .map((q) => q.idx),
    );
    if (grades.some((g) => !caseQIdxes.has(g.q_idx))) {
      return errorJson("VALIDATION_ERROR", "CASE 문제 점수만 확정할 수 있습니다.", 400);
    }

    // [HIGH-1] Block commit while grading is in progress
    const { data: currentSession } = await supabase
      .from("exam_grading_sessions")
      .select("status, calibration_status, grading_scope")
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    if (currentSession?.status === "grading") {
      return errorJson("CONFLICT", "채점이 진행 중입니다. 완료 후 확정하세요.", 409);
    }
    if (currentSession?.calibration_status === "sample_grading") {
      return errorJson("CONFLICT", "샘플 가채점이 진행 중입니다. 전체 가채점 완료 후 확정하세요.", 409);
    }
    if (currentSession?.status !== "grading_done" || currentSession?.grading_scope !== "full") {
      return errorJson("VALIDATION_ERROR", "전체 가채점 완료 후 확정할 수 있습니다.", 400);
    }

    // Claim the commit before writing grades.
    const nowIso = new Date().toISOString();
    const { data: claimedSession, error: statusError } = await supabase
      .from("exam_grading_sessions")
      .update({ status: "committing", updated_at: nowIso })
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .in("status", ["draft", "grading_done"])
      .select("id, status")
      .maybeSingle();

    if (statusError) {
      logError("bulk-grade commit: status update failed", statusError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to update grading session", 500);
    }

    if (!claimedSession) {
      const { data: existingSession, error: existingError } = await supabase
        .from("exam_grading_sessions")
        .select("id, status, updated_at")
        .eq("exam_id", examId)
        .eq("instructor_id", access.ctx.user.id)
        .maybeSingle();

      if (existingError) {
        logError("bulk-grade commit: status read failed", existingError, {
          path: `/api/exam/${examId}/bulk-grade/commit`,
        });
        return errorJson("INTERNAL_ERROR", "Failed to read grading session", 500);
      }

      if (!existingSession || existingSession.status === "committed") {
        return successJson({ ok: true, gradedCount: grades.length, alreadyCommitted: true });
      }

      if (existingSession.status === "committing") {
        const updatedAt = existingSession.updated_at
          ? new Date(existingSession.updated_at as string).getTime()
          : 0;
        const isStale = !Number.isFinite(updatedAt) ||
          Date.now() - updatedAt > COMMITTING_STALE_MS;

        if (!isStale) {
          return errorJson("COMMIT_IN_PROGRESS", "Bulk grade commit is already in progress", 409);
        }

        const { data: reclaimedSession, error: reclaimError } = await supabase
          .from("exam_grading_sessions")
          .update({ updated_at: nowIso })
          .eq("id", existingSession.id)
          .eq("status", "committing")
          .select("id, status")
          .maybeSingle();

        if (reclaimError || !reclaimedSession) {
          logError("bulk-grade commit: stale committing reclaim failed", reclaimError, {
            path: `/api/exam/${examId}/bulk-grade/commit`,
          });
          return errorJson("COMMIT_IN_PROGRESS", "Bulk grade commit is already in progress", 409);
        }
      }
    }

    // Upsert grades
    const gradeRows = grades.map((g) => ({
      session_id: g.session_id,
      q_idx: g.q_idx,
      score: Math.min(100, Math.max(0, g.score)),
      comment: g.comment ?? "",
      stage_grading: {
        answer: {
          score: g.score,
          comment: g.comment ?? "",
        },
      },
      grade_type: "manual",
    }));

    try {
      await upsertGradesBySessionQuestion(
        supabase as never,
        gradeRows,
        "bulk_grade_commit",
      );
    } catch (upsertError) {
      await supabase
        .from("exam_grading_sessions")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("exam_id", examId)
        .eq("instructor_id", access.ctx.user.id)
        .eq("status", "committing");
      throw upsertError;
    }

    const { error: commitError } = await supabase
      .from("exam_grading_sessions")
      .update({
        status: "committed",
        committed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .eq("status", "committing");

    if (commitError) {
      logError("bulk-grade commit: final status update failed", commitError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to finalize grading session", 500);
    }

    try {
      await auditLog({
        action: "grade_bulk_commit",
        userId: access.ctx.user.id,
        targetId: examId,
        details: {
          gradedCount: grades.length,
          sessionIds: uniqueSessionIds.slice(0, 10),
          source: "bulk_grade_commit",
        },
      });
    } catch (auditError) {
      logError("[bulk-grade commit] Audit log failed", auditError, {
        path: `/api/exam/${examId}/bulk-grade/commit`,
      });
    }

    return successJson({ ok: true, gradedCount: grades.length });
  } catch (error) {
    logError("bulk-grade commit POST handler error", error, {
      path: "/api/exam/bulk-grade/commit",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
