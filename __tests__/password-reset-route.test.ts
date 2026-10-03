/**
 * `POST /api/auth/password-reset` — 계정 열거 차단과 레이트리밋 (이슈 #318).
 *
 * 가장 지키기 어려운 불변식은 **"가입된 주소와 아닌 주소의 응답이 같아야
 * 한다"** 이다. 나중에 누군가 "사용자에게 친절하게" 알려주려고 분기를 하나
 * 넣는 순간 조용히 깨진다. 그래서 바이트 단위로 비교한다. 주소 한도에 걸린
 * 경우도 같은 바이트여야 한다 — 주소별로 응답이 달라지면 그게 신호가 된다.
 *
 * ## 발송 방식
 *
 * 링크는 메일 템플릿이 `{{ .TokenHash }}` 로 만든다. PKCE 로 보내면 GoTrue 가
 * 토큰에 `pkce_` 접두어를 붙여 그 해시로는 확인되지 않으므로, **implicit
 * 플로우 클라이언트**로 보내는지를 SDK 경계에서 본다.
 *
 * ## 응답이 발송을 기다리지 않는다
 *
 * 가입된 주소면 GoTrue 가 요청 안에서 SMTP 를 보내고, 아니면 바로 돌아온다.
 * 응답이 그걸 기다리면 바이트가 같아도 **걸린 시간**이 가입 여부를 말한다.
 * 그래서 발송은 `after()` 로 응답 뒤에 한다. 테스트에서는 `after` 에 넘긴
 * 작업을 모아 두었다가 응답을 받은 뒤 돌린다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RATE_LIMITS } from "@/lib/rate-limit";

const checkRateLimitAsync = vi.hoisted(() =>
  vi.fn(async (_key: string, _config: { limit: number; windowSec: number }) => ({
    allowed: true,
  }))
);
const logError = vi.hoisted(() => vi.fn());
/** `after()` 에 넘긴 작업. 응답을 받은 뒤에 돌린다 — 실제 순서와 같다. */
const afterTasks = vi.hoisted(() => [] as Array<() => unknown>);
const logWarn = vi.hoisted(() => vi.fn(async () => undefined));
const resetPasswordForEmail = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({
    error: null as { message: string; status?: number; code?: string } | null,
  }))
);
const createClient = vi.hoisted(() =>
  vi.fn((_url: string, _key: string, _options?: unknown) => ({
    auth: { resetPasswordForEmail },
  }))
);

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return { ...actual, checkRateLimitAsync };
});

// 열렸을 때의 메커니즘을 본다. 스위치 자체는 password-reset-closed.test.ts.
vi.mock("@/lib/password-reset-availability", () => ({ isPasswordResetEnabled: () => true }));
vi.mock("@/lib/logger", () => ({ logError, logWarn }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));

async function drainAfter() {
  for (const task of afterTasks.splice(0)) await task();
}

const ORIGIN = "https://quest-on-staging-two.vercel.app";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/auth/password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function post(body: unknown, headers?: Record<string, string>) {
  const { POST } = await import("../app/api/auth/password-reset/route");
  const res = await POST(makeRequest(body, headers));
  const result = { status: res.status, text: await res.text() };
  await drainAfter();
  return result;
}

const IP = { "x-forwarded-for": "203.0.113.7" };

function keys() {
  return checkRateLimitAsync.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  checkRateLimitAsync.mockResolvedValue({ allowed: true });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  // process.env 는 워커 공유다. stubEnv 로 넣고 afterEach 에서 되돌린다.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", Buffer.alloc(32, 5).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/password-reset", () => {
  it("가입 여부·발송 결과·주소 한도와 무관하게 응답이 완전히 같다", async () => {
    const existing = await post({ email: "real@university.ac.kr" }, IP);

    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "User not found", status: 404 },
    });
    const unknown = await post({ email: "nobody@university.ac.kr" }, IP);

    resetPasswordForEmail.mockRejectedValueOnce(new Error("upstream down"));
    const broken = await post({ email: "third@university.ac.kr" }, IP);

    // IP 는 통과, 주소는 한도 — 한 사람을 겨냥한 반복.
    checkRateLimitAsync
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const addressLimited = await post({ email: "target@university.ac.kr" }, IP);

    expect(existing.status).toBe(200);
    expect(unknown).toEqual(existing);
    expect(broken).toEqual(existing);
    expect(addressLimited).toEqual(existing);
  });

  it("응답은 발송을 기다리지 않는다 — 걸린 시간이 가입 여부를 말하지 않게", async () => {
    // 가입된 주소면 GoTrue 가 SMTP 를 끝낼 때까지 붙잡는다. 끝나지 않는 발송으로 흉내 낸다.
    resetPasswordForEmail.mockImplementationOnce(() => new Promise(() => {}));
    const { POST } = await import("../app/api/auth/password-reset/route");

    const res = await POST(makeRequest({ email: "real@university.ac.kr" }, IP));

    expect(res.status).toBe(200);
    // 응답이 나갈 때 발송은 아직 시작도 안 했다. after() 에 하나가 걸려 있다.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);

    void afterTasks.splice(0)[0]();
    expect(resetPasswordForEmail).toHaveBeenCalledWith("real@university.ac.kr");
  });

  it("발송이 던져도 뒤에서 잡아 로그로 남긴다", async () => {
    resetPasswordForEmail.mockRejectedValueOnce(new Error("upstream down"));
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    expect(res.status).toBe(200);
    expect(logError).toHaveBeenCalledWith(
      "[password-reset] recover_error",
      expect.any(Error),
      expect.anything()
    );
  });

  it("주소 한도에 걸리면 보내지 않고 경고를 남긴다", async () => {
    checkRateLimitAsync
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await post({ email: "target@university.ac.kr" }, IP);

    // 새 메일은 직전 링크를 무효로 만든다. 계속 보내면 그 사람은 복구를 못 한다.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      "[password-reset] address_limited",
      expect.objectContaining({ payload: { addr: expect.stringMatching(/^[0-9a-f]{8}$/) } })
    );
  });

  it("발송 실패는 사용자에게 숨기되 로그에는 남긴다", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "rate limit", status: 429, code: "over_email_send_rate_limit" },
    });
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    expect(res.status).toBe(200);
    expect(logError).toHaveBeenCalledWith(
      "[password-reset] recover_failed",
      expect.anything(),
      expect.objectContaining({
        additionalData: { status: 429, code: "over_email_send_rate_limit" },
      })
    );
  });

  it("IP 한도에 걸리면 429 로 분명히 알린다", async () => {
    checkRateLimitAsync.mockResolvedValueOnce({ allowed: false });
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    // 이 경우만 다르게 답해도 되는 이유: "이 IP 가 많이 눌렀다" 는 계정 존재
    // 여부와 무관하다. 감추면 사용자가 계속 누른다.
    expect(res.status).toBe(429);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("IP 와 주소를 각자의 버킷으로 제한한다", async () => {
    // 같은 버킷을 쓰면 두 한도를 따로 조정할 수 없다. 주소 한도는 1시간 창이다.
    await post({ email: "a@b.ac.kr" }, { "x-forwarded-for": "198.51.100.42" });

    expect(checkRateLimitAsync).toHaveBeenCalledWith(
      "password-reset:ip:198.51.100.42",
      RATE_LIMITS.passwordReset
    );
    expect(checkRateLimitAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^password-reset:addr:[0-9a-f]{32}$/),
      RATE_LIMITS.passwordResetAddress
    );
  });

  it("주소 키에 평문 이메일을 남기지 않는다", async () => {
    await post({ email: "someone@university.ac.kr" }, IP);
    for (const k of keys()) {
      expect(k).not.toContain("someone");
    }
  });

  it("대소문자가 달라도 같은 주소로 본다", async () => {
    await post({ email: "Same@University.AC.KR" }, IP);
    const first = keys().find((k) => k.startsWith("password-reset:addr:"));

    vi.clearAllMocks();
    checkRateLimitAsync.mockResolvedValue({ allowed: true });
    await post({ email: "same@university.ac.kr" }, IP);
    const second = keys().find((k) => k.startsWith("password-reset:addr:"));

    expect(first).toBe(second);
  });

  it("Vercel 이 다시 쓰는 헤더를 먼저 보고, 없으면 다른 헤더를 본다", async () => {
    await post(
      { email: "a@b.ac.kr" },
      { "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "10.0.0.1" }
    );
    expect(keys()).toContain("password-reset:ip:198.51.100.1");

    vi.clearAllMocks();
    checkRateLimitAsync.mockResolvedValue({ allowed: true });
    // 전부 비면 `unknown` 한 키로 모여 한 사람의 재시도가 전체를 잠근다.
    await post({ email: "a@b.ac.kr" }, { "x-real-ip": "198.51.100.9" });
    expect(keys()).toContain("password-reset:ip:198.51.100.9");
  });

  it("JSON 이 아닌 본문은 400 이다 — 보냈다고 말하지 않는다", async () => {
    const { POST } = await import("../app/api/auth/password-reset/route");
    const req = new Request(`${ORIGIN}/api/auth/password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json", ...IP },
      body: "not-json",
    }) as unknown as import("next/server").NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("이메일 형식이 아니면 400 이고 보내지 않는다", async () => {
    for (const email of ["", "not-an-email", "a@", 42, null]) {
      const res = await post({ email }, IP);
      expect(res.status).toBe(400);
    }
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("implicit 플로우로 보내고 redirectTo 를 넘기지 않는다", async () => {
    await post({ email: "someone@university.ac.kr" }, IP);

    // PKCE 면 토큰에 `pkce_` 가 붙어 템플릿의 TokenHash 로 확인되지 않는다.
    expect(createClient).toHaveBeenCalledWith(
      "https://ref.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({ flowType: "implicit", persistSession: false }),
      })
    );
    // 링크는 템플릿이 SiteURL 로 만든다.
    expect(resetPasswordForEmail).toHaveBeenCalledWith("someone@university.ac.kr");
    expect(resetPasswordForEmail.mock.calls[0]).toHaveLength(1);
  });

  it("이메일은 앞뒤 공백을 떼고 소문자로 넘긴다", async () => {
    await post({ email: "  Spaced@University.ac.kr  " }, IP);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("spaced@university.ac.kr");
  });

  it.each([
    ["Supabase URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ["의도 서명 키", "PASSWORD_RESET_INTENT_SECRET"],
  ])("%s 가 없으면 보내지 않고 503 — 받는 쪽이 동작할 수 없다", async (_label, key) => {
    vi.stubEnv(key, "");
    const a = await post({ email: "someone@university.ac.kr" }, IP);
    const b = await post({ email: "nobody@university.ac.kr" }, IP);

    expect(a.status).toBe(503);
    // 주소와 무관한 설정 문제라 모든 주소에 같다 — 존재 여부를 흘리지 않는다.
    expect(b).toEqual(a);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "[password-reset] misconfigured",
      expect.anything(),
      expect.anything()
    );
  });
});
