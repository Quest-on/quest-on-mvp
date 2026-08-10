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
