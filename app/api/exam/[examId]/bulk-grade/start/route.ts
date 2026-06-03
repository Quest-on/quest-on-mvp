export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  isQStashEnabled,
  enqueueBulkGradeJobs,
  type BulkGradeJobPayload,
} from "@/lib/qstash";
import {
  type BulkGradingScope,
  loadExamMetaOnly,
} from "@/lib/bulk-grading";
import type { ExtractedCriteria } from "@/lib/prompts";
import { isUniqueViolation } from "@/lib/chat-idempotency";

const BULK_GRADE_START_RATE_LIMIT = { limit: 3, windowSec: 60 };
const STALE_GRADING_MS = 10 * 60 * 1000;
const GRADING_SESSION_SELECT =
  "id, status, updated_at, calibration_status, calibration_sample_session_ids, calibration_sample_grades, calibration_attempt";

function parseScope(body: unknown): BulkGradingScope {
  void body;
  return "full";
}

function parseCriteria(body: unknown): ExtractedCriteria {
  const criteriaText =
    body && typeof body === "object" && typeof (body as { criteriaText?: unknown }).criteriaText === "string"
      ? (body as { criteriaText: string }).criteriaText.trim()
      : "";
  const criteriaMode =
    body && typeof body === "object" && (body as { criteriaMode?: unknown }).criteriaMode === "ai_default"
      ? "ai_default"
      : "custom";
  const approvalMode =
    body && typeof body === "object" && (body as { approvalMode?: unknown }).approvalMode === "no_precheck"
      ? "no_precheck"
      : "review_before_commit";
  const approvalHint =
    approvalMode === "no_precheck"
      ? "추가 기준 확인 질문 없이 이 기준으로 바로 전체 CASE 가채점을 진행합니다."
      : "가채점 결과는 강사가 검토한 뒤 확정하기 전까지 최종 점수로 저장하지 않습니다.";

  if (criteriaText) {
    return { criteria_summary: `${criteriaText}\n\n${approvalHint}`, per_question: [] };
  }

  return {
    criteria_summary: `${
      criteriaMode === "ai_default"
        ? "AI 기본 기준: CASE 답안의 정확성, 논리적 완성도, 근거의 구체성, 문제 요구사항 충족도, 학생-AI 채팅에서 드러난 이해 과정을 종합해 평가합니다."
        : "전반적인 논리적 완성도와 개념 이해를 기준으로 채점"
    }\n\n${approvalHint}`,
    per_question: [],
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    const scope = parseScope(body);

    const rl = await checkRateLimitAsync(
      `bulk-grade-start:${user?.id ?? "anon"}:${examId}`,
      BULK_GRADE_START_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireClosed: true,
    });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // Check for existing grading session
    const { data: existingSession } = await supabase
      .from("exam_grading_sessions")
      .select(GRADING_SESSION_SELECT)
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    // Load exam meta + submitted sessions
    const [examMeta, sessionsResult] = await Promise.all([
      loadExamMetaOnly(supabase, examId),
      supabase
        .from("sessions")
        .select("id")
        .eq("exam_id", examId)
        .not("submitted_at", "is", null),
    ]);

    if (examMeta.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 케이스 문제가 없습니다.", 400);
    }

    if (sessionsResult.error || !sessionsResult.data?.length) {
      return errorJson("VALIDATION_ERROR", "제출한 학생이 없습니다.", 400);
    }

    const studentSessionIds = (sessionsResult.data ?? []).map((s) => s.id as string);
    const targetSessionIds = studentSessionIds;

    if (!isQStashEnabled() && process.env.VERCEL) {
      return errorJson(
        "INTERNAL_ERROR",
        "QStash가 설정되지 않았습니다. 환경 변수를 확인해주세요.",
        500,
      );
    }

    let startSession = existingSession;
    if (!startSession) {
      const insertResult = await supabase
        .from("exam_grading_sessions")
        .insert({
          exam_id: examId,
          instructor_id: access.ctx.user.id,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .select(GRADING_SESSION_SELECT)
        .single();

      if (insertResult.error) {
        if (!isUniqueViolation(insertResult.error)) {
          return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
        }

        const { data: racedSession, error: racedSessionError } = await supabase
          .from("exam_grading_sessions")
          .select(GRADING_SESSION_SELECT)
          .eq("exam_id", examId)
          .eq("instructor_id", access.ctx.user.id)
          .maybeSingle();

        if (racedSessionError || !racedSession) {
          return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
        }
        startSession = racedSession;
      } else {
        startSession = insertResult.data;
      }
    }

    if (!startSession) {
      return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
    }

    const hasActiveFullGrading = startSession.status === "grading";
    const hasActiveSampleGrading = startSession.calibration_status === "sample_grading";
    if (startSession.status === "committed" || startSession.status === "committing") {
      return errorJson("CONFLICT", "이미 확정 중이거나 확정된 채점입니다.", 409);
    }
    const activeUpdatedAt = startSession.updated_at
      ? new Date(startSession.updated_at as string).getTime()
      : 0;
    const canReplaceActive =
      (hasActiveFullGrading || hasActiveSampleGrading) &&
      Date.now() - activeUpdatedAt > STALE_GRADING_MS;
    if ((hasActiveFullGrading || hasActiveSampleGrading) && !canReplaceActive) {
      return errorJson("CONFLICT", "채점이 이미 진행 중입니다. 잠시 후 확인해주세요.", 409);
    }

    const gradingSessionId = startSession.id as string;
    const criteria = parseCriteria(body);

    const attemptId = globalThis.crypto.randomUUID();
    const updatePayload: Record<string, unknown> = {
      grading_criteria: JSON.stringify(criteria),
      grading_total: targetSessionIds.length,
      grading_completed: 0,
      grading_failed_count: 0,
      expected_session_ids: targetSessionIds,
      processed_session_ids: {},
      current_attempt_id: attemptId,
      grading_scope: scope,
      calibration_status: "approved",
      status: "grading",
      updated_at: new Date().toISOString(),
    };

    updatePayload.proposed_grades = {};

    // Update session: criteria + progress tracking. The filters make concurrent
    // start requests converge on a single attempt.
    let updateQuery = supabase
      .from("exam_grading_sessions")
      .update(updatePayload)
      .eq("id", gradingSessionId);

    if (canReplaceActive) {
      updateQuery = updateQuery.lt(
        "updated_at",
        new Date(Date.now() - STALE_GRADING_MS).toISOString(),
      );
    } else {
      updateQuery = updateQuery
        .in("status", ["draft", "grading_done", "grading_failed"])
        .neq("calibration_status", "sample_grading");
    }

    const { data: startedSession, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      logError("bulk-grade start: session update failed", updateError, {
        path: `/api/exam/${examId}/bulk-grade/start`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to start grading session", 500);
    }
    if (!startedSession) {
      return errorJson("CONFLICT", "채점이 이미 진행 중입니다. 잠시 후 확인해주세요.", 409);
    }

    // Dev fallback: no QStash → inline sequential (non-Vercel only)
    if (!isQStashEnabled()) {
      // Dev: run inline (import lazily to avoid bundling in prod)
      await runBulkGradeInline(gradingSessionId, targetSessionIds, examId, scope, attemptId);
      return successJson({ ok: true, total: targetSessionIds.length, mode: "inline", scope });
    }

    // Enqueue QStash jobs
    const jobs: BulkGradeJobPayload[] = targetSessionIds.map((sid) => ({
      gradingSessionId,
      studentSessionId: sid,
      examId,
      scope,
      attemptId,
    }));

    const { published, failed: publishFailed } = await enqueueBulkGradeJobs(jobs);

    // Compensate for publish failures: pre-increment failed counter
    if (publishFailed > 0) {
      await supabase.rpc("merge_bulk_grading_result", {
        p_session_id: gradingSessionId,
        p_student_sid: `__publish_failed_${Date.now()}`,
        p_grades_json: {},
        p_success: false,
        p_scope: scope,
        p_attempt_id: attemptId,
      });
      // For multiple failures, call RPC multiple times
      for (let i = 1; i < publishFailed; i++) {
        await supabase.rpc("merge_bulk_grading_result", {
          p_session_id: gradingSessionId,
          p_student_sid: `__publish_failed_${Date.now()}_${i}`,
          p_grades_json: {},
          p_success: false,
          p_scope: scope,
          p_attempt_id: attemptId,
        });
      }
    }

    return successJson({ ok: true, total: targetSessionIds.length, published, scope });
  } catch (error) {
    logError("bulk-grade start POST handler error", error, {
      path: "/api/exam/bulk-grade/start",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

async function runBulkGradeInline(
  gradingSessionId: string,
  studentSessionIds: string[],
  examId: string,
  scope: BulkGradingScope,
  attemptId: string,
): Promise<void> {
  // Dev-only: simulate worker calls sequentially
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  for (const sid of studentSessionIds) {
    try {
      await fetch(`${baseUrl}/api/internal/bulk-grade-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradingSessionId, studentSessionId: sid, examId, scope, attemptId }),
      });
    } catch (err) {
      logError("bulk-grade inline: worker call failed", err, {
        path: "bulk-grade/start inline",
        additionalData: { sid },
      });
    }
  }
}
