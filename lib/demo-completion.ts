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

/**
 * 화면에 보여줄 채점 결과가 실제로 있는가.
 *
 * `grades` 행만 보면 안 된다. 데모 템플릿은 전부 CASE 1문항이고, CASE 의 AI
 * 채점 결과는 `grades` 가 아니라 `sessions.ai_summary` 에 들어 있다. `grades` 행은
 * 교수자가 점수를 확정해야 생긴다. 그래서 열람 시점에는 항상 비어 있었고, 완주가
 * "AI 채점 결과를 봤다" 가 아니라 "점수를 저장했다" 로 밀렸다 (이슈 #335).
 * 데모를 둘러보는 교수자가 굳이 점수를 저장할 이유가 없으므로 즉시 지표가
 * 실제 활성화 순간을 놓친다.
 *
 * `ai_summary` 는 존재만으로는 부족하다. 채점 실패 폴백도 같은 컬럼에 들어가고
 * (`{ grading_status: "failed", ... }`), 그건 보여줄 결과가 아니다. 실제 summary
 * 문자열이 차 있는지를 본다 — grading-sweep 이 "진짜 요약이 있는가" 를
 * 판정하는 기준과 같다.
 */
export function hasViewableGradingResult(params: {
  grades: unknown;
  aiSummary: unknown;
}): boolean {
  if (Array.isArray(params.grades) && params.grades.length > 0) return true;

  const summary = (params.aiSummary as { summary?: unknown } | null | undefined)
    ?.summary;
  return typeof summary === "string" && summary.trim().length > 0;
}

type RecordDemoGradedViewedParams = {
  userId: string;
  examId: string;
  /** 화면에 보일 채점 결과가 있는가. `hasViewableGradingResult` 로 구한다. */
  hasGradedResult: boolean;
};

/** 채점 결과가 실제로 열린 데모만 완주 마일스톤으로 남긴다. */
export async function recordDemoGradedViewed({
  userId,
  examId,
  hasGradedResult,
}: RecordDemoGradedViewedParams): Promise<void> {
  if (!hasGradedResult || !(await isDemoExam(examId))) {
    return;
  }

  await recordOnboardingEvent({
    userId,
    role: "instructor",
    event: ONBOARDING_EVENTS.DEMO_GRADED_VIEWED,
    examId,
  });
}

/**
 * 데모 완주 여부는 채점 결과 열람 마일스톤 하나로 판정한다.
 *
 * 완주는 계측과 데모 상세의 CTA 라벨에만 쓴다. 여기에 "기능 개방" 의미를
 * 다시 얹으려면 개방될 기능을 먼저 만들어라 — 이슈 #83 참고.
 */
export async function isDemoCompleted(userId: string): Promise<boolean> {
  return hasOnboardingEvent(userId, ONBOARDING_EVENTS.DEMO_GRADED_VIEWED);
}
