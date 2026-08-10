import { getSupabaseServer } from "@/lib/supabase-server";
import { logError } from "@/lib/logger";

/**
 * 온보딩 액티베이션 퍼널 마일스톤 (Epic #79 / 이슈 #80 / ADR-006).
 *
 * 이 테이블은 원시 로그가 아니라 "최초 도달" 마일스톤이다.
 * 그래서 `UNIQUE (user_id, event)` 가 걸려 있고 퍼널은
 * `COUNT(DISTINCT user_id)` 로 끝난다. 중복 호출·재시도는 무해하다.
 *
 * ai_events 를 확장하지 않은 이유: 그 테이블은 provider/model/pricing_version 이
 * NOT NULL 인 AI 호출 전용 스키마다. 더미값을 채우는 순간 비용 집계가 오염된다.
 */

export const ONBOARDING_EVENTS = {
  /** 교수자가 JTBD 2문항을 제출했다 */
  INTAKE_SUBMITTED: "intake_submitted",
  /** 과목 맞춤 데모가 생성됐다 */
  DEMO_CREATED: "demo_created",
  /** 데모에서 학생 시점 답변을 제출했다 */
  DEMO_ANSWERED: "demo_answered",
  /** 데모의 AI 채점 결과를 열람했다 — 즉시 지표(데모 완주) */
  DEMO_GRADED_VIEWED: "demo_graded_viewed",
  /** 실제 시험에 첫 학생이 들어왔다 */
  FIRST_PUBLISH: "first_publish",
  /** 첫 학생 제출이 들어왔다 — 진짜 지표 */
  FIRST_STUDENT_SUBMISSION: "first_student_submission",
  /** 학생이 AI 사용 고지를 확인했다 */
  STUDENT_DISCLOSURE_ACK: "student_disclosure_ack",
} as const;

export type OnboardingEventName =
  (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

export type RecordOnboardingEventParams = {
  userId: string;
  role: string;
  event: OnboardingEventName;
  examId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * 마일스톤을 멱등하게 기록한다.
 *
 * 같은 `(user_id, event)` 를 여러 번 호출해도 최초 1건만 남고 오류가 나지 않는다
 * (`ON CONFLICT DO NOTHING`). 계측 실패가 제품 동작을 막아서는 안 되므로
 * 이 함수는 절대 throw 하지 않고 성공 여부만 boolean 으로 돌려준다.
 *
 * @returns 새 행이 기록됐으면 true, 이미 있었거나 실패했으면 false
 */
export async function recordOnboardingEvent({
  userId,
  role,
  event,
  examId = null,
  metadata = {},
}: RecordOnboardingEventParams): Promise<boolean> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("onboarding_events")
      .upsert(
        {
          user_id: userId,
          role,
          event,
          exam_id: examId,
          metadata,
        },
        { onConflict: "user_id,event", ignoreDuplicates: true }
      )
      .select("id");

    if (error) {
      logError("[onboarding-events] Failed to record milestone", error, {
        path: "lib/onboarding-events",
      });
      return false;
    }

    // ignoreDuplicates 로 중복이면 빈 배열이 온다 — 오류가 아니라 "이미 도달함"이다.
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    logError("[onboarding-events] Unhandled error", err, {
      path: "lib/onboarding-events",
    });
    return false;
  }
}

/**
 * 마일스톤에 이미 도달했는지 본다 (AC-15).
 *
 * 계측용 테이블을 **게이팅 근거로도** 쓴다. 학생 AI 고지는 "최초 1회만 보여준다"가
 * 인수 조건이고 그 최초 1회의 정의가 곧 이 마일스톤이라, 별도 컬럼을 두면 같은
 * 사실이 두 곳에 생기고 언젠가 어긋난다.
 *
 * 실패하면 `false` 다. 즉 조회 장애 시 고지를 **다시 보여주는** 쪽으로 실패한다.
 * 반대로 실패하면 고지를 못 받은 학생이 응시하게 된다.
 */
export async function hasOnboardingEvent(
  userId: string,
  event: OnboardingEventName
): Promise<boolean> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("onboarding_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event", event)
      .maybeSingle();

    if (error) {
      logError("[onboarding-events] Failed to read milestone", error, {
        path: "lib/onboarding-events",
      });
      return false;
    }

    return !!data;
  } catch (err) {
    logError("[onboarding-events] Unhandled error", err, {
      path: "lib/onboarding-events",
    });
    return false;
  }
}
