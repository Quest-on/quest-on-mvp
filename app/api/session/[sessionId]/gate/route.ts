import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { buildGateStatePayload } from "@/app/api/supa/handlers/session-handlers";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/session/[sessionId]/gate — 대기 화면용 게이트 상태 조회 (이슈 #344).
 *
 * 지각 입장 대기 화면은 Realtime 구독으로 승인을 받는다. 이 라우트는 그게
 * 끊겼을 때를 위한 폴백 폴링의 대상이다.
 *
 * 예전에는 `POST /api/supa {action:"check_gate_status"}` 를 불렀는데 그 액션은
 * 서버에 등록된 적이 없어 항상 400 이었다. 즉 폴백이 필요한 바로 그 순간
 * (Realtime 이 끊긴 순간)에 존재하지 않았고, 학생은 승인을 받아도 화면이
 * 넘어가지 않았다. 호출부가 조용히 삼키고 있어서 드러나지도 않았다.
 *
 * `/api/supa` 액션을 새로 추가하지 않는다 — 신규 API 는 리소스형 라우트로만
 * 만든다(ADR-002).
 *
 * 기존 `GET /api/session/[sessionId]` 를 쓰지 않는 이유: 그 라우트는 답안·메시지를
 * 압축 해제하고 압축 통계까지 만든다. 15초마다 부를 것이 아니다. 여기서는 게이트
 * 판정에 필요한 컬럼만 읽는다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `session-gate:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { sessionId } = await params;
    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const supabase = getSupabaseServer();

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // 남의 세션 게이트 상태를 들여다볼 이유가 없다.
    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Unauthorized", 403);
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, status, started_at, duration")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    const gateState = buildGateStatePayload(session, exam);

    return successJson({
      sessionId,
      status: gateState.status,
      gateStarted: gateState.gateStarted,
      sessionStartTime: gateState.sessionStartTime,
      timeRemaining: gateState.timeRemaining,
    });
  } catch (error) {
    logError("Session gate status error", error, {
      path: "/api/session/[sessionId]/gate",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
