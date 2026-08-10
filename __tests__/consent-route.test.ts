import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AC-U2 / AC-U6 — 온보딩 동의 라우트 계약.
 *
 * 잡으려는 사고:
 *   · 인증을 확인하기 전에 DB 를 건드리는 것 (AGENTS.md: 인증 검증 전 데이터 접근 금지)
 *   · 클라이언트가 user_id / controller_type / policy_version 을 덮어쓰는 것
 *   · 알 수 없는 consent_key 가 통과하는 것
 *   · 기록 실패를 2xx 로 감추는 것
 */

let gateModeMock = vi.fn(() => "prompt");
let currentUserMock = vi.fn();
let recordMock = vi.fn();
let releaseMock = vi.fn();
let gateMock = vi.fn();

async function loadRoute() {
  vi.resetModules();

  vi.doMock("@/lib/supabase-auth", () => ({ currentUser: currentUserMock }));
  vi.doMock("@/lib/consent-records", async () => {
    const actual = await vi.importActual<typeof import("@/lib/consent-records")>(
      "@/lib/consent-records",
    );
    return { ...actual, recordConsentDecisions: recordMock };
  });
  vi.doMock("@/lib/consent-gate", () => ({
    getCurrentPolicyRelease: releaseMock,
    evaluateConsentGate: gateMock,
  }));
  // 기본은 수집 활성(prompt). off/shadow 동작은 별도 케이스에서 검증한다.
  vi.doMock("@/lib/consent-gate-mode", () => ({
    getConsentGateMode: () => gateModeMock(),
    modeCollectsConsent: (mode: string) => mode === "prompt" || mode === "enforce",
  }));

  return await import("@/app/api/consents/onboarding/route");
}

function jsonRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

describe("POST /api/consents/onboarding", () => {
  beforeEach(() => {
    currentUserMock = vi.fn(async () => ({ id: "user-alpha" }));
    recordMock = vi.fn(async () => ({ subjectRef: "v1:x", insertedCount: 2 }));
    releaseMock = vi.fn(async () => ({
      releaseId: "consent-20260810-r1",
      contentHash: "a".repeat(64),
      effectiveAt: "2026-08-10T00:00:00.000Z",
      requiresReconsent: true,
    }));
    gateMock = vi.fn();
    gateModeMock = vi.fn(() => "prompt");
  });

  afterEach(() => {
    vi.doUnmock("@/lib/supabase-auth");
    vi.doUnmock("@/lib/consent-records");
    vi.doUnmock("@/lib/consent-gate");
    vi.doUnmock("@/lib/consent-gate-mode");
  });

  it("off 모드에서는 503 이고 기록하지 않는다", async () => {
    // 기능이 배포됐지만 아직 켜지지 않은 단계다. 여기서 수집하면
    // 롤아웃을 되돌려도 이미 받은 행이 남는다.
    gateModeMock = vi.fn(() => "off");
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("CONSENT_NOT_ACTIVE");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("shadow 모드에서도 503 이고 기록하지 않는다", async () => {
    gateModeMock = vi.fn(() => "shadow");
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(503);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("enforce 모드에서는 정상 기록한다", async () => {
    gateModeMock = vi.fn(() => "enforce");
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("수집 차단은 인증 확인 뒤에 일어난다 (미인증이 우선)", async () => {
    gateModeMock = vi.fn(() => "off");
    currentUserMock = vi.fn(async () => null);
    const { POST } = await loadRoute();

    expect((await POST(jsonRequest({ ageOver14: true, terms: true }))).status).toBe(401);
  });

  it("AC-U2 — 미인증은 401 이고 기록을 시도하지 않는다", async () => {
    currentUserMock = vi.fn(async () => null);
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
    // 인증 실패 시 정책 릴리스 조회조차 하지 않는다.
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — user_id 를 보내면 strict Zod 가 400 으로 막는다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      jsonRequest({ ageOver14: true, terms: true, user_id: "user-victim" }),
    );

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — controller_type 을 보내면 400 이다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      jsonRequest({ ageOver14: true, terms: true, controller_type: "institution" }),
    );

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — policy_version 을 보내면 400 이다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      jsonRequest({ ageOver14: true, terms: true, policy_version: "forged" }),
    );

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — 알 수 없는 consent_key 는 400 이다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      jsonRequest({ ageOver14: true, terms: true, __injected__: true }),
    );

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — 필수 항목이 false 면 400 이다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: false, terms: true }));

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("AC-U2 — 정상 요청은 서버가 정한 user_id 와 policy_version 으로 기록한다", async () => {
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);

    const [userId, decisions, policyVersion] = recordMock.mock.calls[0];
    expect(userId).toBe("user-alpha");
    expect(policyVersion).toBe("consent-20260810-r1");
    expect(decisions).toHaveLength(2);
    expect((decisions as { consentKey: string }[]).map((d) => d.consentKey).sort()).toEqual([
      "age_over_14",
      "terms",
    ]);
  });

  it("AC-U6 — 기록 실패는 5xx 이고 2xx 로 감추지 않는다", async () => {
    recordMock = vi.fn(async () => {
      throw new Error("db down");
    });
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("CONSENT_RECORD_FAILED");
  });

  it("AC-U6 — 부분 저장은 성공이 아니다", async () => {
    recordMock = vi.fn(async () => ({ subjectRef: "v1:x", insertedCount: 1 }));
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("CONSENT_RECORD_INCOMPLETE");
  });

  it("활성 릴리스가 없으면 503 이고 기록하지 않는다", async () => {
    releaseMock = vi.fn(async () => null);
    const { POST } = await loadRoute();

    const res = await POST(jsonRequest({ ageOver14: true, terms: true }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("CONSENT_NOT_ACTIVE");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("깨진 JSON 은 400 이고 DB 를 건드리지 않는다", async () => {
    const { POST } = await loadRoute();

    const req = {
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as import("next/server").NextRequest;

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/consents/onboarding", () => {
  beforeEach(() => {
    currentUserMock = vi.fn(async () => ({ id: "user-alpha" }));
    recordMock = vi.fn();
    releaseMock = vi.fn();
    gateMock = vi.fn(async () => ({
      complete: true,
      currentRelease: { releaseId: "consent-20260810-r1" },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/supabase-auth");
    vi.doUnmock("@/lib/consent-records");
    vi.doUnmock("@/lib/consent-gate");
    vi.doUnmock("@/lib/consent-gate-mode");
  });

  it("GET 이 수집 활성 여부를 함께 돌려준다", async () => {
    gateModeMock = vi.fn(() => "off");
    const { GET } = await loadRoute();

    expect((await (await GET()).json()).collecting).toBe(false);

    gateModeMock = vi.fn(() => "prompt");
    const { GET: GET2 } = await loadRoute();

    expect((await (await GET2()).json()).collecting).toBe(true);
  });

  it("미인증은 401 이고 게이트를 평가하지 않는다", async () => {
    currentUserMock = vi.fn(async () => null);
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(401);
    expect(gateMock).not.toHaveBeenCalled();
  });

  it("완료 상태를 그대로 돌려준다", async () => {
    const { GET } = await loadRoute();

    const res = await GET();
    const body = await res.json();

    expect(body.complete).toBe(true);
    expect(body.policyVersion).toBe("consent-20260810-r1");
  });

  it("미완료면 사유와 누락 키를 함께 돌려준다", async () => {
    gateMock = vi.fn(async () => ({
      complete: false,
      reason: "missing",
      currentRelease: { releaseId: "consent-20260810-r1" },
      missingKeys: ["terms"],
    }));
    const { GET } = await loadRoute();

    const res = await GET();
    const body = await res.json();

    expect(body.complete).toBe(false);
    expect(body.reason).toBe("missing");
    expect(body.missingKeys).toEqual(["terms"]);
  });
});
