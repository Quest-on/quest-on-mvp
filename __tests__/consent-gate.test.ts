import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AC-U5 — 게이트 판정 진리표.
 *
 * 통과 조건은 하나뿐이다: 현재 릴리스 기준으로 필수 2개가 모두 granted=true.
 * 나머지는 전부 미완료다. 특히 조회 실패는 fail-closed 여야 한다 —
 * 알 수 없을 때 통과시키면 게이트가 있으나 마나가 된다.
 */

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");
const RELEASE = {
  release_id: "consent-20260810-r1",
  content_hash: "a".repeat(64),
  effective_at: "2026-08-10T00:00:00.000Z",
  requires_reconsent: true,
};

interface Scenario {
  release?: Record<string, unknown> | null;
  floor?: Record<string, unknown> | null;
  decisions?: Record<string, unknown>[];
  releaseError?: boolean;
  decisionError?: boolean;
}

function makeSupabase(scenario: Scenario) {
  return {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.lte = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);

      builder.limit = vi.fn(async () => {
        if (table === "consent_policy_releases") {
          if (scenario.releaseError) return { data: null, error: { message: "boom" } };
          // requires_reconsent 필터가 걸린 호출이 floor 조회다.
          const isFloorQuery = (builder.eq as ReturnType<typeof vi.fn>).mock.calls.some(
            (c) => c[0] === "requires_reconsent",
          );
          const row = isFloorQuery ? scenario.floor : scenario.release;
          return { data: row ? [row] : [], error: null };
        }
        return { data: [], error: null };
      });

      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "consent_records") {
          if (scenario.decisionError) {
            return resolve({ data: null, error: { message: "boom" } });
          }
          return resolve({ data: scenario.decisions ?? [], error: null });
        }
        return resolve({ data: [], error: null });
      };

      return builder;
    }),
  };
}

async function evaluate(scenario: Scenario) {
  vi.resetModules();
  const supabase = makeSupabase(scenario);
  vi.doMock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabase }));
  const { evaluateConsentGate } = await import("@/lib/consent-gate");
  return await evaluateConsentGate("user-alpha");
}

function decision(key: string, granted: boolean, recordedAt: string) {
  return {
    consent_key: key,
    granted,
    policy_version: RELEASE.release_id,
    recorded_at: recordedAt,
  };
}

const AFTER_FLOOR = "2026-08-10T01:00:00.000Z";
const BEFORE_FLOOR = "2026-08-09T00:00:00.000Z";

describe("evaluateConsentGate — 진리표", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, CONSENT_SUBJECT_HMAC_KEY_V1: VALID_KEY };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("@/lib/supabase-server");
  });

  it("현재 버전 필수 2개가 모두 true 여야만 통과한다", async () => {
    const result = await evaluate({
      release: RELEASE,
      floor: RELEASE,
      decisions: [
        decision("age_over_14", true, AFTER_FLOOR),
        decision("terms", true, AFTER_FLOOR),
      ],
    });

    expect(result.complete).toBe(true);
  });

  it("한 키가 누락되면 미완료다", async () => {
    const result = await evaluate({
      release: RELEASE,
      floor: RELEASE,
      decisions: [decision("terms", true, AFTER_FLOOR)],
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("missing");
    expect(result.complete === false && result.missingKeys).toContain("age_over_14");
  });

  it("floor 이전 동의만 있으면 미완료다 (문구가 바뀌면 재동의)", async () => {
    const result = await evaluate({
      release: RELEASE,
      floor: RELEASE,
      decisions: [
        decision("age_over_14", true, BEFORE_FLOOR),
        decision("terms", true, BEFORE_FLOOR),
      ],
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("stale_release");
  });

  it("최신 결정이 false 면 미완료이고 false 가 우선한다", async () => {
    const result = await evaluate({
      release: RELEASE,
      floor: RELEASE,
      decisions: [
        decision("age_over_14", true, AFTER_FLOOR),
        // recorded_at DESC 정렬을 흉내낸다. 첫 행이 최신이다.
        decision("terms", false, "2026-08-10T02:00:00.000Z"),
        decision("terms", true, AFTER_FLOOR),
      ],
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("latest_false");
  });

  it("활성 릴리스가 없으면 미완료다", async () => {
    const result = await evaluate({ release: null, floor: null, decisions: [] });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("no_active_release");
  });

  it("requires_reconsent=false 릴리스는 기존 수락을 무효화하지 않는다", async () => {
    // floor 는 예전 릴리스(2026-08-10) 이고 current 는 더 최신이지만
    // requires_reconsent=false 라 floor 를 올리지 않는다.
    const result = await evaluate({
      release: { ...RELEASE, release_id: "consent-20260901-r1", requires_reconsent: false },
      floor: RELEASE,
      decisions: [
        decision("age_over_14", true, AFTER_FLOOR),
        decision("terms", true, AFTER_FLOOR),
      ],
    });

    expect(result.complete).toBe(true);
  });

  it("릴리스 조회 실패는 fail-closed 다", async () => {
    const result = await evaluate({ releaseError: true });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("query_error");
  });

  it("동의 조회 실패도 fail-closed 다", async () => {
    const result = await evaluate({
      release: RELEASE,
      floor: RELEASE,
      decisionError: true,
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.reason).toBe("query_error");
  });

  it("아무 동의도 없으면 필수 2개가 전부 누락으로 보고된다", async () => {
    const result = await evaluate({ release: RELEASE, floor: RELEASE, decisions: [] });

    expect(result.complete).toBe(false);
    expect(result.complete === false && result.missingKeys.sort()).toEqual([
      "age_over_14",
      "terms",
    ]);
  });
});
