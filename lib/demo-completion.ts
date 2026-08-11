import { logError } from "@/lib/logger";
import {
  hasOnboardingEvent,
  ONBOARDING_EVENTS,
  recordOnboardingEvent,
} from "@/lib/onboarding-events";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 데모 시험인지 확인한다.
 *
 * 018 전 DB는 is_demo 컬럼이 없어도 기존 채점 흐름이 계속돼야 한다. 그래서 조회
 * 실패는 데모가 아닌 것으로 처리해 계측만 건너뛴다.
 */
export async function isDemoExam(examId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseServer()
      .from("exams")
      .select("is_demo")
      .eq("id", examId)
      .maybeSingle();

    if (error) {
      logError("[demo-completion] Failed to check demo exam", error, {
        path: "lib/demo-completion",
        additionalData: { examId },
      });
      return false;
    }

    return data?.is_demo === true;
  } catch (error) {
    logError("[demo-completion] Failed to check demo exam", error, {
      path: "lib/demo-completion",
      additionalData: { examId },
    });
    return false;
  }
}

/**
 * 이 응시가 **교수자가 자기 데모를 학생 시점으로 겪는 것**인가 (#167).
 *
 * 순수 함수다. DB 를 치지 않는다 — 호출부는 이미 exam 을 읽고 있고, 여기서 또
 * 조회하면 학생 전원이 때리는 경로(preflight·제출)에 왕복이 하나씩 붙는다.
 * 더 나쁜 건 그 조회의 실패를 false 로 떨어뜨리면 "일반 학생"과 "판정 불능"이
 * 같은 값이 되어, 장애 시 오염이 조용히 재발한다는 것이다.
 *
 * 판정이 불가능하면 `null` 이다. 호출부는 그때 **계측만 건너뛰고** 제품 동작은
 * 계속한다 — 응시를 막는 것보다 세지 않는 쪽이 낫다.
 *
 * `session-handlers.ts` 의 데모 미리보기 판정도 이 함수를 쓴다. 정의가 두 곳에
 * 있으면 한쪽만 고쳐졌을 때 지표가 조용히 갈라진다.
 */
export function isDemoPreview(params: {
  isDemo: unknown;
  instructorId: unknown;
  userId: string;
}): boolean | null {
  if (typeof params.isDemo !== "boolean") return null;
  if (typeof params.instructorId !== "string") return null;
  return params.isDemo && params.instructorId === params.userId;
}

type RecordDemoGradedViewedParams = {
  userId: string;
  examId: string;
  hasGrades: boolean;
};

/** 채점 결과가 실제로 열린 데모만 완주 마일스톤으로 남긴다. */
export async function recordDemoGradedViewed({
  userId,
  examId,
  hasGrades,
}: RecordDemoGradedViewedParams): Promise<void> {
  if (!hasGrades || !(await isDemoExam(examId))) {
    return;
  }

  await recordOnboardingEvent({
    userId,
    role: "instructor",
    event: ONBOARDING_EVENTS.DEMO_GRADED_VIEWED,
    examId,
  });
}

/** 데모 완주 여부는 채점 결과 열람 마일스톤 하나로 판정한다. */
export async function isDemoCompleted(userId: string): Promise<boolean> {
  return hasOnboardingEvent(userId, ONBOARDING_EVENTS.DEMO_GRADED_VIEWED);
}

/**
 * 호출부를 바꾸지 않고 이후 개방 기준을 확장할 수 있도록 완주 판정과 분리한다.
 */
export async function isAiDemoRegenerationUnlocked(userId: string): Promise<boolean> {
  return isDemoCompleted(userId);
}
