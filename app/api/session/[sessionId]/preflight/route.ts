import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import {
  buildGateStatePayload,
  isExamStarted,
  isExamUnavailable,
  promoteSessionToInProgress,
} from "@/app/api/supa/handlers/session-handlers";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  ONBOARDING_EVENTS,
  hasOnboardingEvent,
  recordOnboardingEvent,
} from "@/lib/onboarding-events";
import { isDemoPreview } from "@/lib/demo-completion";

/**
 * POST /api/session/[sessionId]/preflight
 *
 * Preflight Modal 수락 처리
 * - preflight_accepted_at 설정
 * - 시험 상태에 따라 waiting 또는 in_progress로 조정
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(`session-preflight:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const supabase = getSupabaseServer();
    const resolvedParams = await params;
    const sessionId = resolvedParams.sessionId;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    // 세션 확인 및 권한 검증
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(
        "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
      )
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Unauthorized", 403);
    }

    const now = new Date().toISOString();
    const nowTime = Date.now();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, status, started_at, duration, type, questions, is_demo, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    if (isExamUnavailable(exam.status)) {
      return errorJson(
        "EXAM_NOT_AVAILABLE",
        "Exam not available for joining",
        403,
        {
          currentStatus: exam.status,
          message: "This exam is closed or archived",
        }
      );
    }

    let reconciledSession = session;

    // 지각 학생: 강사 승인 대기 — preflight만 기록하고 상태 유지
    if (session.status === "late_pending") {
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({ preflight_accepted_at: now })
        .eq("id", sessionId)
        .eq("status", "late_pending")
        .select(
          "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
        )
        .single();

      if (updateError || !updatedSession) {
        logError("Failed to update preflight for late_pending", updateError, {
          path: "/api/session/[sessionId]/preflight",
          additionalData: { sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
      }
      reconciledSession = updatedSession;
    } else if (
      isExamStarted(exam.status, exam.started_at, nowTime) ||
      (exam.type && exam.type !== "exam") ||
      // 교수자가 자기 데모를 학생 시점으로 겪는 경우도 바로 시작한다.
      //
      // 이게 없으면 initExamSession 이 in_progress 로 만든 세션을 여기서
      // waiting 으로 덮어써, 교수자가 자기 데모 대기실에 갇힌다. 나가려면 다른
      // 탭에서 교수자용 "시험 시작"을 눌러야 하는데 아무도 그걸 안내하지
      // 않는다 — 에픽의 핵심 동선이 여기서 끊긴다.
      //
      // 판정은 세션 생성 때와 같은 순수 함수를 쓴다. 정의가 갈라지면 한쪽만
      // 고쳐졌을 때 이 증상이 그대로 재발한다.
      isDemoPreview({
        isDemo: (exam as { is_demo?: unknown }).is_demo,
        instructorId: (exam as { instructor_id?: unknown }).instructor_id,
        userId: user.id,
      }) === true
    ) {
      reconciledSession = await promoteSessionToInProgress(session, now, {
        preflightAcceptedAt: now,
      });
    } else {
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          preflight_accepted_at: now,
          status: "waiting",
        })
        .eq("id", sessionId)
        .select(
          "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
        )
        .single();

      if (updateError || !updatedSession) {
        logError("Failed to update preflight status", updateError, {
          path: "/api/session/preflight",
          user_id: user.id,
          additionalData: { sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
      }

      reconciledSession = updatedSession;
    }

    // AI 사용 고지 확인 기록 (AC-15).
    //
    // `preflight_accepted_at` 은 세션 단위라 "이 응시에서 수락했다"까지만 말한다.
    // 학생이 처음으로 고지를 확인한 시점은 세션이 아니라 사람 단위이므로
    // 마일스톤으로 남긴다.
    //
    // 교수자가 자기 데모를 학생 시점으로 겪는 경우는 기록하지 않는다(#167).
    //
    // #166 이 그 경로를 열면서, 데모 템플릿이 전부 서술형이라 위 판정이 참이
    // 되고 **교수자 id 가 role:"student" 로 학생 퍼널에 박혔다.** 에픽 DoD 의
    // `COUNT(DISTINCT user_id)` 학생 지표가 온보딩을 마친 교수자 전원만큼
    // 부풀었다. 고지 자체는 그대로 보여준다 — 안 보여주는 게 아니라 안 세는 것이다.
    //
    // 판정 불능(null)이면 기록하지 않는다. 018 미적용 등으로 컬럼을 못 읽었을 때
    // "일반 학생"으로 단정하면 그 순간 오염이 다시 시작된다.
    const preview = isDemoPreview({
      isDemo: (exam as { is_demo?: unknown }).is_demo,
      instructorId: (exam as { instructor_id?: unknown }).instructor_id,
      userId: user.id,
    });

    if (preview === false) {
      const recorded = await recordOnboardingEvent({
        userId: user.id,
        role: "student",
        event: ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK,
        examId: session.exam_id,
      });

      // 재노출 방지의 근거가 이 기록이다. 영속되지 않은 채 수락을 성공으로
      // 돌려주면 확인 시각 없는 응시가 생긴다.
      //
      // recordOnboardingEvent 가 true 면 새 행이 실제로 들어간 것이라 그 자체가
      // 영속 증거다. false 는 "이미 도달"과 "저장 실패"를 구분하지 않으므로,
      // 그때만 한 번 읽어 가른다. 정상 경로에 왕복을 더 붙이지 않는다.
      if (
        !recorded &&
        !(await hasOnboardingEvent(user.id, ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK))
      ) {
        return errorJson("INTERNAL_ERROR", "Failed to record disclosure acknowledgement", 500);
      }
    }

    const gateState = buildGateStatePayload(reconciledSession, exam, nowTime);

    return successJson({
      sessionId,
      preflightAcceptedAt: now,
      status: gateState.status,
      gateStarted: gateState.gateStarted,
      sessionStartTime: gateState.sessionStartTime,
      timeRemaining: gateState.timeRemaining,
    });
  } catch (error) {
    logError("Preflight acceptance failed", error, { path: "/api/session/preflight" });
    return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
  }
}
