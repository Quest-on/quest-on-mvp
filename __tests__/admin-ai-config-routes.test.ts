import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, checkRateLimitAsync, loadCurrentVersion, publishVersion } = vi.hoisted(
  () => ({
    requireAdmin: vi.fn(async () => null as unknown),
    checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
    loadCurrentVersion: vi.fn(),
    publishVersion: vi.fn(),
  })
);

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync,
  RATE_LIMITS: { general: { limit: 60, windowSec: 60 } },
}));
vi.mock("@/lib/ai-config-store", () => ({ loadCurrentVersion, publishVersion }));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(async () => {}),
  logWarn: vi.fn(async () => {}),
  logInfo: vi.fn(async () => {}),
}));

import { GET, POST } from "@/app/api/admin/ai-config/route";

const VERSION_A = "11111111-1111-4111-8111-111111111111";
const VERSION_B = "22222222-2222-4222-8222-222222222222";

function postRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue(null);
  checkRateLimitAsync.mockReset().mockResolvedValue({ allowed: true });
  loadCurrentVersion.mockReset();
  publishVersion.mockReset();
  process.env.ADMIN_USERNAME = "alice";
});

describe("GET /api/admin/ai-config", () => {
  it("refuses a non-admin before touching the store", async () => {
    const denial = new Response("nope", { status: 401 });
    requireAdmin.mockResolvedValue(denial);

    const res = await GET();

    expect(res).toBe(denial);
    expect(loadCurrentVersion).not.toHaveBeenCalled();
  });

  it("returns raw overrides, effective profiles and per-field sources separately", async () => {
    loadCurrentVersion.mockResolvedValue({
      versionId: VERSION_A,
      overrides: { bulk_grading_worker: { temperature: null } },
    });

    const res = await GET();
    const body = await res.json();

    expect(body.versionId).toBe(VERSION_A);
    // 원본은 명시적 null 을 보존해야 한다 — UI 의 "없음" 상태가 여기서 나온다.
    expect(body.overrides.bulk_grading_worker.temperature).toBeNull();
    // effective 는 해석 결과 — null 이 제거로 적용돼 키가 사라진다.
    expect(body.effectiveProfiles.bulk_grading_worker.temperature).toBeUndefined();
    // 상속받은 값은 출처가 code 로 표시된다.
    expect(body.sources.bulk_grading_worker.model).toBe("code");
    expect(body.tasks).toHaveLength(7);
  });

  it("rate limits before doing work", async () => {
    checkRateLimitAsync.mockResolvedValue({ allowed: false });
    const res = await GET();
    expect(res.status).toBe(429);
    expect(loadCurrentVersion).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/ai-config", () => {
  it("refuses a non-admin before publishing", async () => {
    const denial = new Response("nope", { status: 401 });
    requireAdmin.mockResolvedValue(denial);

    const res = await POST(postRequest({ overrides: {}, reason: "x" }));

    expect(res).toBe(denial);
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("requires a change reason", async () => {
    const res = await POST(postRequest({ overrides: {} }));
    expect(res.status).toBe(400);
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("derives the actor server-side and ignores any actor in the payload", async () => {
    publishVersion.mockResolvedValue({
      previousVersionId: VERSION_A,
      newVersionId: VERSION_B,
      cacheWarning: null,
    });

    await POST(
      postRequest({
        overrides: {},
        reason: "tune",
        actor: "admin:attacker",
        versionId: "spoofed",
      })
    );

    const args = publishVersion.mock.calls[0]?.[0] as { actor: string };
    expect(args.actor).toBe("admin:alice");
    expect(args.actor).not.toContain("attacker");
  });

  it("rejects an unpriced model before any publish", async () => {
    const res = await POST(
      postRequest({
        overrides: { auto_grading_summary: { model: "totally-unpriced" } },
        reason: "swap model",
      })
    );

    expect(res.status).toBe(400);
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("rejects an unsupported model/effort combination before any publish", async () => {
    const res = await POST(
      postRequest({
        overrides: { auto_grading_summary: { model: "gpt-4o-mini", reasoningEffort: "high" } },
        reason: "bump effort",
      })
    );

    expect(res.status).toBe(400);
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range retry count", async () => {
    const res = await POST(
      postRequest({ overrides: { bulk_grading_worker: { maxRetries: 9 } }, reason: "more" })
    );

    expect(res.status).toBe(400);
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("passes the sparse override through untouched on success", async () => {
    publishVersion.mockResolvedValue({
      previousVersionId: VERSION_A,
      newVersionId: VERSION_B,
      cacheWarning: null,
    });

    const res = await POST(
      postRequest({
        overrides: { bulk_grading_worker: { temperature: null, maxRetries: 1 } },
        reason: "disable temperature",
      })
    );
    const body = await res.json();

    const args = publishVersion.mock.calls[0]?.[0] as { overrides: Record<string, unknown> };
    expect(args.overrides).toEqual({
      bulk_grading_worker: { temperature: null, maxRetries: 1 },
    });
    expect(body.versionId).toBe(VERSION_B);
  });

  it("surfaces a cache propagation warning without failing the publish", async () => {
    publishVersion.mockResolvedValue({
      previousVersionId: VERSION_A,
      newVersionId: VERSION_B,
      cacheWarning: "설정은 저장됐지만 캐시 전파가 실패했습니다.",
    });

    const res = await POST(postRequest({ overrides: {}, reason: "x" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cacheWarning).toMatch(/캐시/);
  });

  it("rejects a malformed body", async () => {
    const res = await POST({
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(400);
    expect(publishVersion).not.toHaveBeenCalled();
  });
});
