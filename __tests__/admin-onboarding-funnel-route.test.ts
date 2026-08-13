import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, checkRateLimitAsync, from } = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => null as unknown),
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  from: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync,
  RATE_LIMITS: { general: { limit: 60, windowSec: 60 } },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ from }) }));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(async () => {}),
  logWarn: vi.fn(async () => {}),
  logInfo: vi.fn(async () => {}),
}));

import { GET } from "@/app/api/admin/onboarding-funnel/route";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";

function mockRows(rows: Array<{ user_id: string; event: string; occurred_at: string }>) {
  from.mockImplementation(() => ({
    select: () => ({
      in: () => ({
        order: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  }));
}

const at = (m: number) => new Date(Date.parse("2026-08-01T00:00:00Z") + m * 60_000).toISOString();

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue(null);
  checkRateLimitAsync.mockReset().mockResolvedValue({ allowed: true });
  from.mockReset();
});

describe("GET /api/admin/onboarding-funnel", () => {
  it("비관리자는 DB 를 치기 전에 막는다", async () => {
    const denial = new Response("nope", { status: 401 });
    requireAdmin.mockResolvedValue(denial);

    const res = await GET();

    expect(res).toBe(denial);
    expect(from).not.toHaveBeenCalled();
  });

  it("레이트리밋에 걸리면 조회하지 않는다", async () => {
    checkRateLimitAsync.mockResolvedValue({ allowed: false });
    const res = await GET();
    expect(res.status).toBe(429);
    expect(from).not.toHaveBeenCalled();
  });

  it("퍼널 단계와 가장 큰 이탈을 돌려준다", async () => {
    mockRows([
      { user_id: "a", event: ONBOARDING_EVENTS.DEMO_CREATED, occurred_at: at(0) },
      { user_id: "b", event: ONBOARDING_EVENTS.DEMO_CREATED, occurred_at: at(0) },
      { user_id: "c", event: ONBOARDING_EVENTS.DEMO_CREATED, occurred_at: at(0) },
      { user_id: "a", event: ONBOARDING_EVENTS.DEMO_ANSWERED, occurred_at: at(3) },
      { user_id: "a", event: ONBOARDING_EVENTS.DEMO_GRADED_VIEWED, occurred_at: at(8) },
    ]);

    const body = await (await GET()).json();

    expect(body.steps[0].users).toBe(3);
    expect(body.steps[1].users).toBe(1);
    expect(body.biggestDrop).toMatchObject({ dropped: 2 });
    expect(body.medianMinutesToProxyValue).toBe(8);
    expect(body.sampledUsers).toBe(3);
  });

  it("표본이 없어도 단계 모양을 유지한다", async () => {
    mockRows([]);
    const body = await (await GET()).json();

    // 화면이 단계 수를 신뢰한다. 빈 배열을 내리면 표가 사라진다.
    expect(body.steps).toHaveLength(5);
    expect(body.sampledUsers).toBe(0);
    expect(body.truncated).toBe(false);
  });

  it("조회 실패는 500 으로 감싼다", async () => {
    from.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: async () => ({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    }));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
