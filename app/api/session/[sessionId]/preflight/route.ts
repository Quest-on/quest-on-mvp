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
  recordOnboardingEvent,
} from "@/lib/onboarding-events";
import { hasAiChatQuestions } from "@/lib/grading-helpers";
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
    } else if (isExamStarted(exam.status, exam.started_at, nowTime) || (exam.type && exam.type !== "exam")) {
      // 시험이 이미 시작되었거나, 비시험 유형인 경우 바로 in_progress로 전환
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
    // ⚠️ 조건이 핵심이다. 3줄 고지는 AI 채팅이 실제로 뜨는 시험에서만 노출된다
    // (`PreflightModal` 의 `examHasEssay` 게이트). 그런데 수락을 무조건 ACK 로
    // 승격하면, **객관식 전용 시험만 본 학생이 고지를 한 번도 안 보고 확인 완료가
    // 된다.** 그 학생의 다음 서술형 시험에서는 고지가 숨겨진다 — 고지를 못 받은
    // 채로 AI 시험에 들어가는 것이다(#149).
    //
    // 그래서 노출 판정과 기록 판정은 같은 함수여야 하고, 그 판정을 서버가
    // 소유한다. 클라이언트가 무엇을 렌더했는지는 신뢰 근거가 못 된다.
    const disclosureWasShown = hasAiChatQuestions(
      exam.questions as ReadonlyArray<{ type?: string }> | null
    );

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

    if (disclosureWasShown && preview === false) {
      // await 하되 실패해도 무시한다 — 이 함수는 throw 하지 않고 boolean 만
      // 돌려준다. 계측 때문에 응시 시작이 막히면 그게 더 큰 사고다.
      await recordOnboardingEvent({
        userId: user.id,
        role: "student",
        event: ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK,
        examId: session.exam_id,
      });
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
