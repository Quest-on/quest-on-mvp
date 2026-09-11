import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// P1-4: Supabase client created inside handler to avoid stale connections in serverless
function getSupabase() {
  return getSupabaseServer();
}

/**
 * POST /api/exam/[examId]/start
 *
 * Gate Start 신호: 교수가 "Start Exam" 버튼을 클릭하면
 * - exams.started_at 설정
 * - exams.status를 "running"으로 변경
 * - 모든 Waiting 세션을 InProgress로 전환
 * - 각 세션의 started_at, attempt_timer_started_at 설정
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

    const supabase = getSupabase();

    const rl = await checkRateLimitAsync(`exam-start:${user.id}`, RATE_LIMITS.examControl);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const resolvedParams = await params;
    const examId = resolvedParams.examId;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    // 요청 본문에서 close_at 가져오기
    const body = await request.json().catch(() => ({}));
    const closeAt = body.close_at || null;

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, status, started_at, updated_at, close_at")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 2. 상태 검증: 화이트리스트 기반 — draft 또는 scheduled 상태에서만 Start 가능 (P1-6)
    const allowedStatuses = ["draft", "scheduled", "joinable"];
    if (!allowedStatuses.includes(exam.status || "")) {
      return errorJson(
        "BAD_REQUEST",
        exam.status === "running"
          ? "Exam is already running"
          : exam.status === "closed"
            ? "Exam is already closed"
            : `Exam cannot be started from '${exam.status}' status`,
        400,
        { currentStatus: exam.status }
      );
    }

    // 3. 이미 시작된 경우 체크
    if (exam.started_at) {
      return errorJson("BAD_REQUEST", "Exam already started", 400, {
        startedAt: exam.started_at,
      });
    }

    const now = new Date().toISOString();

    // 4. 시험 상태 업데이트: started_at 설정, status를 "running"으로 변경, close_at 설정
    const updateData: {
      started_at: string;
      status: string;
      updated_at: string;
      close_at?: string | null;
    } = {
      started_at: now,
      status: "running",
      updated_at: now,
    };

    // close_at이 제공된 경우에만 업데이트
    if (closeAt) {
      const closeAtDate = new Date(closeAt);
      if (isNaN(closeAtDate.getTime())) {
        return errorJson("BAD_REQUEST", "Invalid close_at date format", 400);
      }
      // close_at must be in the future
      if (closeAtDate.getTime() <= Date.now()) {
        return errorJson(
          "BAD_REQUEST",
          "close_at must be a future date",
          400
        );
      }
      updateData.close_at = closeAtDate.toISOString();
    }

    // 4-5. 시험 상태 + 세션 전환을 원자적으로 처리
    // Try RPC-based atomic transaction first, fall back to sequential queries
    let updatedSessionsCount = 0;

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc("start_exam_atomic", {
        p_exam_id: examId,
        p_expected_status: exam.status || "draft",
        p_started_at: now,
        p_close_at: closeAt ? new Date(closeAt).toISOString() : null,
      });

      if (!rpcError && rpcResult !== null) {
        updatedSessionsCount = typeof rpcResult === "number" ? rpcResult : 0;
      } else {
        throw new Error(rpcError?.message || "RPC not available");
      }
    } catch {
      // Fallback: sequential queries with optimistic locking + manual rollback
      const { data: updatedExam, error: updateExamError } = await supabase
        .from("exams")
        .update(updateData)
        .eq("id", examId)
        .eq("status", exam.status) // 낙관적 잠금: 상태가 변하지 않았을 때만 업데이트
        .select("id")
        .single();

      if (updateExamError || !updatedExam) {
        return errorJson(
          "CONFLICT",
          "Exam state changed concurrently, please retry",
          409
        );
      }

      // 모든 Waiting 세션을 InProgress로 전환
      const { data: updatedSessions, error: sessionsError } = await supabase
        .from("sessions")
        .update({
          status: "in_progress",
          started_at: now,
          attempt_timer_started_at: now,
        })
        .eq("exam_id", examId)
        .eq("status", "waiting")
        .select("id");

      if (sessionsError) {
        // 세션 전환 실패 시 시험 상태를 원본 필드 값으로 정확히 롤백
        const { error: rollbackError } = await supabase
          .from("exams")
          .update({
            started_at: exam.started_at,
            status: exam.status || "draft",
            updated_at: exam.updated_at,
            close_at: exam.close_at,
          })
          .eq("id", examId);

        if (rollbackError) {
          // P1-5: Rollback also failed — exam is in inconsistent state
          logError("CRITICAL: Failed to rollback exam state after session update failure", rollbackError, {
            path: "/api/exam/start",
            additionalData: {
              examId,
              originalStatus: exam.status,
              originalStartedAt: exam.started_at,
              originalCloseAt: exam.close_at,
            },
          });
          return errorJson(
            "INCONSISTENT_STATE",
            "시험 상태가 불일치합니다. 시험 상태를 확인하고 필요 시 관리자에게 문의하세요.",
            500,
            {
              examId,
              examStatus: "running",
              sessionsUpdated: false,
              requiresManualCheck: true,
            }
          );
        }

        return errorJson("INTERNAL_ERROR", "Failed to update sessions, exam state rolled back", 500);
      }

      updatedSessionsCount = updatedSessions?.length || 0;
    }

    return successJson({
      examId,
      startedAt: now,
      status: "running",
      sessionsUpdated: updatedSessionsCount,
    });
  } catch (error) {
    logError("Failed to start exam", error, { path: "/api/exam/start" });
    return errorJson("INTERNAL_ERROR", "Failed to start exam", 500);
  }
}
