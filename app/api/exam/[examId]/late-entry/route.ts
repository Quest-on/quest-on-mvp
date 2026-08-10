import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

function getSupabase() {
  return getSupabaseServer();
}

/**
 * POST /api/exam/[examId]/late-entry
 *
 * 지각 학생 입장 허가/거부
 * Body: { sessionId: string, action: "approve" | "deny" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(`late-entry:${user.id}`, RATE_LIMITS.examControl);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const body = await request.json().catch(() => ({}));
    const { sessionId, action } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return errorJson("BAD_REQUEST", "sessionId is required", 400);
    }

    const invalidSessionId = validateUUID(sessionId, "sessionId");
    if (invalidSessionId) return invalidSessionId;

    if (action !== "approve" && action !== "deny") {
      return errorJson("BAD_REQUEST", "action must be 'approve' or 'deny'", 400);
    }

    const supabase = getSupabase();

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, status, started_at")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    if (exam.status !== "running") {
      return errorJson("BAD_REQUEST", "Exam must be running to approve/deny late entry", 400);
    }

    // 2. 세션 확인
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, status, exam_id")
      .eq("id", sessionId)
      .eq("exam_id", examId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    if (session.status !== "late_pending") {
      return errorJson("BAD_REQUEST", "Session is not in late_pending status", 400);
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      // 승인: 원래 시험 시작 시간으로 타이머 설정 (지각 시간만큼 감산)
      if (!exam.started_at) {
        return errorJson("INTERNAL_ERROR", "Exam has no started_at timestamp", 500);
      }

      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          status: "in_progress",
          started_at: exam.started_at,
          attempt_timer_started_at: exam.started_at, // 핵심: 원래 시험 시작 시간
          is_active: true,
          last_heartbeat_at: now,
          late_entry_approved_at: now,
        })
        .eq("id", sessionId)
        .eq("status", "late_pending");

      if (updateError) {
        logError("Failed to approve late entry", updateError, {
          path: "/api/exam/[examId]/late-entry",
          additionalData: { examId, sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to approve late entry", 500);
      }

      return successJson({ sessionId, action: "approved", approvedAt: now });
    } else {
      // 거부
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          status: "denied",
          is_active: false,
          late_entry_denied_at: now,
        })
        .eq("id", sessionId)
        .eq("status", "late_pending");

      if (updateError) {
        logError("Failed to deny late entry", updateError, {
          path: "/api/exam/[examId]/late-entry",
          additionalData: { examId, sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to deny late entry", 500);
      }

      return successJson({ sessionId, action: "denied", deniedAt: now });
    }
  } catch (error) {
    logError("Late entry handler error", error, { path: "/api/exam/[examId]/late-entry" });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
