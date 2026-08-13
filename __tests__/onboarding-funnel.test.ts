import { describe, expect, it } from "vitest";
import {
  INSTRUCTOR_FUNNEL,
  buildOnboardingFunnel,
  type OnboardingEventRow,
} from "@/lib/onboarding-funnel";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";

/**
 * 온보딩 퍼널 집계
 *
 * 이 숫자로 "어디를 먼저 고칠지"를 정하게 된다. 규칙이 틀리면 엉뚱한 데를 고친다.
 */

const T0 = Date.parse("2026-08-01T00:00:00Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function row(user: string, event: string, minutes: number): OnboardingEventRow {
  return { user_id: user, event, occurred_at: at(minutes) };
}

describe("buildOnboardingFunnel — 단계별 도달", () => {
  it("빈 입력에서도 모든 단계를 0 으로 돌려준다", () => {
    const funnel = buildOnboardingFunnel([]);

    // 화면이 단계 수를 신뢰하므로 표본이 없어도 모양이 유지돼야 한다.
    expect(funnel.steps).toHaveLength(INSTRUCTOR_FUNNEL.length);
    expect(funnel.steps.every((s) => s.users === 0)).toBe(true);
    expect(funnel.sampledUsers).toBe(0);
    expect(funnel.biggestDrop).toBeNull();
    expect(funnel.medianMinutesToProxyValue).toBeNull();
  });

  it("단계별 순 사용자 수와 비율을 센다", () => {
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("a", ONBOARDING_EVENTS.DEMO_ANSWERED, 5),
      row("b", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("c", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("d", ONBOARDING_EVENTS.DEMO_CREATED, 0),
    ];

    const funnel = buildOnboardingFunnel(rows);

    expect(funnel.steps[0].users).toBe(4);
    expect(funnel.steps[0].overallRate).toBe(1);
    expect(funnel.steps[0].stepRate).toBeNull();

    expect(funnel.steps[1].users).toBe(1);
    expect(funnel.steps[1].stepRate).toBe(0.25);
    expect(funnel.steps[1].droppedFromPrev).toBe(3);
    expect(funnel.sampledUsers).toBe(4);
  });

  it("단계를 건너뛴 사용자도 도달로 센다", () => {
    // 데모를 안 거치고 바로 실제 시험을 연 교수자가 있다. 누적 통과로 접으면
    // 진짜 지표가 실제보다 작게 보인다.
    const rows = [
      row("skipper", ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION, 10),
      row("normal", ONBOARDING_EVENTS.DEMO_CREATED, 0),
    ];

    const funnel = buildOnboardingFunnel(rows);
    const last = funnel.steps[funnel.steps.length - 1];

    expect(last.event).toBe(ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION);
    expect(last.users).toBe(1);
  });
});

describe("buildOnboardingFunnel — 가장 큰 이탈", () => {
  it("이탈이 가장 큰 구간을 집어낸다", () => {
    const rows: OnboardingEventRow[] = [];
    // 10명 생성 → 2명만 답변 → 그 2명은 끝까지
    for (let i = 0; i < 10; i++) rows.push(row(`u${i}`, ONBOARDING_EVENTS.DEMO_CREATED, 0));
    for (let i = 0; i < 2; i++) {
      rows.push(row(`u${i}`, ONBOARDING_EVENTS.DEMO_ANSWERED, 5));
      rows.push(row(`u${i}`, ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 9));
    }

    const funnel = buildOnboardingFunnel(rows);

    expect(funnel.biggestDrop).toEqual({
      fromEvent: ONBOARDING_EVENTS.DEMO_CREATED,
      toEvent: ONBOARDING_EVENTS.DEMO_ANSWERED,
      dropped: 8,
    });
  });

  it("이탈이 없으면 null 이다", () => {
    const rows = INSTRUCTOR_FUNNEL.map((e, i) => row("solo", e, i));
    expect(buildOnboardingFunnel(rows).biggestDrop).toBeNull();
  });
});

describe("buildOnboardingFunnel — 가치까지 걸린 시간", () => {
  it("생성에서 채점 열람까지의 중앙값을 분으로 낸다", () => {
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("a", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 10),
      row("b", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("b", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 20),
      row("c", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("c", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 30),
    ];

    expect(buildOnboardingFunnel(rows).medianMinutesToProxyValue).toBe(20);
  });

  it("평균이 아니라 중앙값이라 이상치에 흔들리지 않는다", () => {
    // 사흘 뒤 돌아온 한 명이 평균을 통째로 왜곡한다.
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("a", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 5),
      row("b", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("b", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 6),
      row("late", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("late", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 60 * 24 * 3),
    ];

    // 평균이면 1440분대가 된다.
    expect(buildOnboardingFunnel(rows).medianMinutesToProxyValue).toBe(6);
  });

  it("채점을 못 본 사용자는 표본에서 뺀다", () => {
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("b", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("b", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 12),
    ];

    expect(buildOnboardingFunnel(rows).medianMinutesToProxyValue).toBe(12);
  });
});

describe("buildOnboardingFunnel — 입력 방어", () => {
  it("중복 행이 들어와도 가장 이른 시각을 쓴다", () => {
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      row("a", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 30),
      row("a", ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, 5),
    ];

    // (user_id, event) unique 가 있지만 조회가 바뀌어도 규칙이 안 흔들려야 한다.
    expect(buildOnboardingFunnel(rows).medianMinutesToProxyValue).toBe(5);
    expect(buildOnboardingFunnel(rows).sampledUsers).toBe(1);
  });

  it("깨진 행은 건너뛰고 나머지를 센다", () => {
    const rows = [
      row("a", ONBOARDING_EVENTS.DEMO_CREATED, 0),
      { user_id: "", event: ONBOARDING_EVENTS.DEMO_CREATED, occurred_at: at(0) },
      { user_id: "b", event: "", occurred_at: at(0) },
      { user_id: "c", event: ONBOARDING_EVENTS.DEMO_CREATED, occurred_at: "not-a-date" },
    ];

    const funnel = buildOnboardingFunnel(rows);
    expect(funnel.sampledUsers).toBe(1);
    expect(funnel.steps[0].users).toBe(1);
  });
});

describe("퍼널 정의", () => {
  it("진짜 지표는 첫 학생 제출이다", () => {
    // 데모 완주는 대리 지표다. 이 구분이 흐려지면 데모만 잘 되는 제품이 된다.
    const last = INSTRUCTOR_FUNNEL[INSTRUCTOR_FUNNEL.length - 1];
    expect(last).toBe(ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION);

    const funnel = buildOnboardingFunnel([]);
    expect(funnel.steps.find((s) => s.kind === "true_north")?.event).toBe(last);
    expect(funnel.steps.find((s) => s.kind === "proxy")?.event).toBe(
      ONBOARDING_EVENTS.DEMO_GRADED_VIEWED
    );
  });
});
