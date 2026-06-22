import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { getSupabaseServer } from "@/lib/supabase-server";
import { batchGetUserInfo, type UserInfo } from "@/lib/app-users";
import {
  buildBulkGradeStudentIdentities,
  studentIdsNeedingAppUserFallback,
  type BulkGradeStudentProfile,
  type BulkGradeSubmittedSession,
} from "@/lib/bulk-grade-identities";

/**
 * Parse the stored `grading_criteria` JSON and recover the instructor-facing
 * criteria text. `/start` stores `criteria_summary` as
 * `${criteriaText}\n\n${approvalHint}`, so we drop the trailing approval-hint
 * paragraph by keeping only the first "\n\n"-separated block. Returns null when
 * unparseable or empty, so the panel can fall back to its local echo.
 */
function parseCriteriaSummary(rawCriteria: unknown): string | null {
  if (typeof rawCriteria !== "string" || !rawCriteria.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCriteria);
  } catch {
    return null;
  }
  const summary =
    parsed && typeof parsed === "object" && typeof (parsed as { criteria_summary?: unknown }).criteria_summary === "string"
      ? (parsed as { criteria_summary: string }).criteria_summary
      : "";
  const firstParagraph = summary.split("\n\n")[0]?.trim() ?? "";
  return firstParagraph || null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    const rl = await checkRateLimitAsync(
      `bulk-grade-load:${user?.id ?? "anon"}`,
      RATE_LIMITS.sessionRead,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    const [sessionResult, gradingSessionResult] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, student_id, submitted_at")
        .eq("exam_id", examId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("exam_grading_sessions")
        .select("id, proposed_grades, processed_session_ids, status, committed_at, updated_at, grading_total, grading_completed, grading_failed_count, grading_scope, grading_criteria")
        .eq("exam_id", examId)
        .eq("instructor_id", access.ctx.user.id)
        .maybeSingle(),
    ]);

    if (sessionResult.error) {
      logError("bulk-grade GET: sessions query failed", sessionResult.error, {
        path: `/api/exam/${examId}/bulk-grade`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load submitted students", 500);
    }

    if (gradingSessionResult.error) {
      logError("bulk-grade GET: grading session query failed", gradingSessionResult.error, {
        path: `/api/exam/${examId}/bulk-grade`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load grading session", 500);
    }

    const submittedSessions = (sessionResult.data ?? []) as BulkGradeSubmittedSession[];
    const studentCount = submittedSessions.length;
    const studentIds = [...new Set(submittedSessions.map((s) => s.student_id))];
    const profilesResult = studentIds.length > 0
      ? await supabase
          .from("student_profiles")
          .select("student_id, name, student_number, school")
          .in("student_id", studentIds)
      : { data: [] as BulkGradeStudentProfile[], error: null };

    if (profilesResult.error) {
      logError("bulk-grade GET: student profiles query failed", profilesResult.error, {
        path: `/api/exam/${examId}/bulk-grade`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load student profiles", 500);
    }

    const profiles = (profilesResult.data ?? []) as BulkGradeStudentProfile[];
    const appUserFallbackIds = studentIdsNeedingAppUserFallback(studentIds, profiles);
    const userInfoMap = appUserFallbackIds.length > 0
      ? await batchGetUserInfo(appUserFallbackIds)
      : new Map<string, UserInfo>();

    const session = gradingSessionResult.data;
    const students = buildBulkGradeStudentIdentities(
      submittedSessions,
      profiles,
      userInfoMap,
    );

    return successJson({
      session: session
        ? {
            id: session.id as string,
            proposed_grades: session.proposed_grades as Record<string, unknown>,
            // Which submitted sessions the worker has already attempted (success OR
            // failure). Lets the panel mark processed-but-ungraded students as
            // "채점 실패" instead of silently dropping them.
            processed_session_ids:
              (session.processed_session_ids as Record<string, boolean>) ?? {},
            grading_scope: session.grading_scope as string,
            status: session.status as string,
            committed_at: session.committed_at as string | null,
            updated_at: session.updated_at as string,
            // Instructor's submitted criteria (approval-hint paragraph stripped),
            // so the panel can echo it as a thread bubble that survives reload.
            criteriaSummary: parseCriteriaSummary(session.grading_criteria),
            progress: {
              total: (session.grading_total as number) ?? 0,
              completed: (session.grading_completed as number) ?? 0,
              failed: (session.grading_failed_count as number) ?? 0,
            },
          }
        : null,
      students,
      studentCount,
      warning:
        studentCount > 40
          ? `학생 수가 ${studentCount}명으로 많아 처리 시간이 길 수 있습니다.`
          : null,
    });
  } catch (error) {
    logError("bulk-grade GET handler error", error, {
      path: "/api/exam/bulk-grade",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
