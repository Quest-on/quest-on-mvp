import { describe, expect, it, beforeEach, vi } from "vitest";

// getSupabaseServer 를 훅으로 잡아 DB 없이 조회 경로를 검증한다.
// (DB 접촉 금지 규칙 — AGENTS.md)
const maybeSingle = vi.fn();
const supabaseMock = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle })),
    })),
  })),
};

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import {
  canAdmitStudent,
  canPublish,
  clearPlanLimitsCache,
  getPlanLimits,
  rowToPlanLimits,
  FALLBACK_LIMITS,
  type PlanLimits,
} from "@/lib/plan-limits";

const free: PlanLimits = {
  plan: "free",
  maxPublishes: 3,
  maxStudents: 5,
  aiDemoGeneration: false,
};
const verified: PlanLimits = {
  plan: "verified",
  maxPublishes: null,
  maxStudents: null,
  aiDemoGeneration: true,
};

beforeEach(() => {
  clearPlanLimitsCache();
  maybeSingle.mockReset();
  supabaseMock.from.mockClear();
});

describe("canPublish (AC-9, AC-11)", () => {
  it("free 등급은 한도 미만이면 허용한다", () => {
    expect(canPublish(free, 0)).toBe(true);
    expect(canPublish(free, 2)).toBe(true);
  });

  it("free 등급은 한도에 도달하면 차단한다 — 4번째 발행이 막힌다", () => {
    expect(canPublish(free, 3)).toBe(false);
    expect(canPublish(free, 4)).toBe(false);
  });

  it("maxPublishes 가 null 이면 무제한이다", () => {
    expect(canPublish(verified, 0)).toBe(true);
    expect(canPublish(verified, 9999)).toBe(true);
  });
});

describe("canAdmitStudent (AC-10, AC-10a)", () => {
  it("정원 미만의 신규 학생은 입장한다", () => {
    expect(canAdmitStudent(free, 0, false)).toBe(true);
    expect(canAdmitStudent(free, 4, false)).toBe(true);
  });

  it("정원이 차면 6번째 신규 학생을 차단한다", () => {
    expect(canAdmitStudent(free, 5, false)).toBe(false);
    expect(canAdmitStudent(free, 6, false)).toBe(false);
  });

  // 이 케이스가 없으면 정원이 찬 뒤 기존 학생이 재접속할 때 튕긴다 = 시험 도중 사고.
  it("기존 학생은 정원이 찼어도 항상 재입장한다 (AC-10a)", () => {
    expect(canAdmitStudent(free, 5, true)).toBe(true);
    expect(canAdmitStudent(free, 999, true)).toBe(true);
  });

  it("maxStudents 가 null 이면 무제한이다", () => {
    expect(canAdmitStudent(verified, 9999, false)).toBe(true);
  });
});

describe("rowToPlanLimits", () => {
  it("DB 행을 도메인 타입으로 옮기고 null 무제한을 보존한다", () => {
    expect(
      rowToPlanLimits({
        plan: "verified",
        max_publishes: null,
        max_students: null,
        ai_demo_generation: true,
      })
    ).toEqual(verified);
  });

  it("ai_demo_generation 이 null 이면 false 로 좁힌다", () => {
    expect(
      rowToPlanLimits({
        plan: "free",
        max_publishes: 3,
        max_students: 5,
        ai_demo_generation: null,
      }).aiDemoGeneration
    ).toBe(false);
  });
});

describe("getPlanLimits", () => {
  it("plan_limits 테이블에서 한도를 읽는다 (코드 상수가 아니다)", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        plan: "free",
        max_publishes: 3,
        max_students: 5,
        ai_demo_generation: false,
      },
      error: null,
    });

    await expect(getPlanLimits("free")).resolves.toEqual(free);
    expect(supabaseMock.from).toHaveBeenCalledWith("plan_limits");
  });

  it("같은 등급을 다시 물으면 캐시로 답하고 DB를 다시 치지 않는다", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        plan: "free",
        max_publishes: 3,
        max_students: 5,
        ai_demo_generation: false,
      },
      error: null,
    });

    await getPlanLimits("free");
    await getPlanLimits("free");

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  // 한도 조회 장애로 교수자가 시험을 못 여는 것보다 잠시 한도가 풀리는 쪽이 낫다.
  it("조회가 실패하면 무제한 폴백으로 여는 쪽으로 실패한다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const limits = await getPlanLimits("free");
    expect(limits.maxPublishes).toBeNull();
    expect(limits.maxStudents).toBeNull();
    expect(canPublish(limits, 9999)).toBe(true);
  });

  it("없는 등급도 폴백으로 처리하고 plan 이름은 보존한다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const limits = await getPlanLimits("does-not-exist");
    expect(limits).toEqual({ ...FALLBACK_LIMITS, plan: "does-not-exist" });
  });
});
