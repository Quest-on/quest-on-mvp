import { ONBOARDING_EVENTS, type OnboardingEventName } from "@/lib/onboarding-events";

/**
 * 온보딩 퍼널 집계 (순수 함수)
 *
 * 이벤트는 예전부터 쌓이고 있었지만 읽는 곳이 `demo-completion.ts` 하나뿐이었다
 * (AI 재생성 잠금 해제용). 즉 어디서 얼마나 빠지는지 아무도 보지 못했다.
 * 온보딩을 고치기 전에 먼저 재려고 만든다.
 *
 * DB 를 치지 않는다. 행을 받아 모양만 만든다 — 그래야 테스트가 DB 없이 돌고,
 * 조회 방식(집계 쿼리든 전량 조회든)을 나중에 바꿔도 이 규칙이 안 흔들린다.
 */

/** 교수자 퍼널. 선언 순서가 곧 화면 표시 순서이자 이탈 계산 순서다. */
export const INSTRUCTOR_FUNNEL: readonly OnboardingEventName[] = [
  ONBOARDING_EVENTS.DEMO_CREATED,
  ONBOARDING_EVENTS.DEMO_ANSWERED,
  ONBOARDING_EVENTS.DEMO_GRADED_VIEWED,
  ONBOARDING_EVENTS.FIRST_PUBLISH,
  ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION,
] as const;

/**
 * 각 단계의 의미. 화면에서 숫자만 보면 판단할 수 없어서 함께 내려보낸다.
 *
 * `즉시 지표`/`진짜 지표` 구분은 `lib/onboarding-events.ts` 의 기존 주석을 따른다.
 * 데모 완주는 대리 지표이고, 실제 학생 제출이 진짜 성공이다.
 */
export const FUNNEL_STEP_META: Record<
  string,
  { label: string; kind: "proxy" | "true_north" | "step" }
> = {
  [ONBOARDING_EVENTS.DEMO_CREATED]: { label: "데모 생성", kind: "step" },
  [ONBOARDING_EVENTS.DEMO_ANSWERED]: { label: "학생 시점 답변", kind: "step" },
  [ONBOARDING_EVENTS.DEMO_GRADED_VIEWED]: { label: "AI 채점 열람", kind: "proxy" },
  [ONBOARDING_EVENTS.FIRST_PUBLISH]: { label: "첫 학생 입장", kind: "step" },
  [ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION]: {
    label: "첫 학생 제출",
    kind: "true_north",
  },
};

export type OnboardingEventRow = {
  user_id: string;
  event: string;
  occurred_at: string;
};

export type FunnelStep = {
  event: string;
  label: string;
  kind: "proxy" | "true_north" | "step";
  /** 이 단계에 도달한 순 사용자 수 */
  users: number;
  /** 첫 단계 대비 비율 (0~1). 첫 단계는 1 */
  overallRate: number;
  /** 직전 단계 대비 비율 (0~1). 첫 단계는 null */
  stepRate: number | null;
  /** 직전 단계에서 여기로 못 온 사용자 수. 첫 단계는 null */
  droppedFromPrev: number | null;
};

export type OnboardingFunnel = {
  steps: FunnelStep[];
  /** 이탈이 가장 큰 구간. 어디를 먼저 고칠지 정하는 값이다 */
  biggestDrop: { fromEvent: string; toEvent: string; dropped: number } | null;
  /** 데모 생성 → AI 채점 열람까지 걸린 시간의 중앙값(분). 표본이 없으면 null */
  medianMinutesToProxyValue: number | null;
  sampledUsers: number;
};

/**
 * 사용자별로 어떤 이벤트를 언제 처음 겪었는지 접는다.
 *
 * `(user_id, event)` 에 unique 가 걸려 있어 원래 중복이 없지만, 조회가 바뀌어
 * 중복이 들어와도 가장 이른 시각을 남기도록 방어한다.
 */
function foldByUser(rows: OnboardingEventRow[]): Map<string, Map<string, number>> {
  const byUser = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row?.user_id || !row?.event) continue;
    const at = Date.parse(row.occurred_at);
    if (Number.isNaN(at)) continue;

    let events = byUser.get(row.user_id);
    if (!events) {
      events = new Map();
      byUser.set(row.user_id, events);
    }
    const prev = events.get(row.event);
    if (prev === undefined || at < prev) events.set(row.event, at);
  }

  return byUser;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 퍼널을 만든다.
 *
 * 단계별 카운트는 **누적 통과가 아니라 도달 여부**로 센다. 실제로 3단계를 건너뛰고
 * 4단계에 도달한 사용자가 있을 수 있는데(예: 데모를 건너뛰고 바로 실제 시험 개설),
 * 그걸 0으로 접으면 진짜 지표가 실제보다 작게 보인다.
 */
export function buildOnboardingFunnel(
  rows: OnboardingEventRow[],
  funnel: readonly OnboardingEventName[] = INSTRUCTOR_FUNNEL
): OnboardingFunnel {
  const byUser = foldByUser(rows);
  const reached = funnel.map(
    (event) => [...byUser.values()].filter((events) => events.has(event)).length
  );

  const first = reached[0] ?? 0;
  const steps: FunnelStep[] = funnel.map((event, i) => {
    const users = reached[i] ?? 0;
    const prev = i === 0 ? null : (reached[i - 1] ?? 0);
    const meta = FUNNEL_STEP_META[event] ?? { label: event, kind: "step" as const };

    return {
      event,
      label: meta.label,
      kind: meta.kind,
      users,
      overallRate: first === 0 ? 0 : users / first,
      stepRate: prev === null ? null : prev === 0 ? 0 : users / prev,
      droppedFromPrev: prev === null ? null : Math.max(0, prev - users),
    };
  });

  let biggestDrop: OnboardingFunnel["biggestDrop"] = null;
  for (let i = 1; i < steps.length; i++) {
    const dropped = steps[i].droppedFromPrev ?? 0;
    if (dropped > (biggestDrop?.dropped ?? 0)) {
      biggestDrop = {
        fromEvent: steps[i - 1].event,
        toEvent: steps[i].event,
        dropped,
      };
    }
  }

  // 데모 생성 → AI 채점 열람. 평균이 아니라 중앙값을 쓴다 — 며칠 뒤 돌아온
  // 사용자 한 명이 평균을 통째로 왜곡한다.
  const durations: number[] = [];
  for (const events of byUser.values()) {
    const start = events.get(ONBOARDING_EVENTS.DEMO_CREATED);
    const end = events.get(ONBOARDING_EVENTS.DEMO_GRADED_VIEWED);
    if (start !== undefined && end !== undefined && end >= start) {
      durations.push((end - start) / 60_000);
    }
  }

  const med = median(durations);

  return {
    steps,
    biggestDrop,
    medianMinutesToProxyValue: med === null ? null : Math.round(med * 10) / 10,
    sampledUsers: byUser.size,
  };
}
