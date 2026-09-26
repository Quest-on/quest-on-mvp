/**
 * 복구 링크 확인(`verify`)과 새 비밀번호 저장(`complete`) (이슈 #318).
 *
 * 두 라우트가 지키는 것:
 *
 *   - **verify** 만 복구 세션을 만든다. 성공하면 그 세션의 `(user_id,
 *     session_id)` 에 묶인 의도 쿠키를 심는다. 세션은 생겼는데 의도를 못 만들면
 *     세션을 거둔다 — 남기면 링크가 "비밀번호 없는 로그인" 이 된다.
 *   - **complete** 는 지금 세션이 의도에 묶인 바로 그 세션일 때만 비밀번호를
 *     바꾸고, 바꾼 뒤 **모든 세션을 끊는다.**
 *   - 둘 다 다른 사이트에서 시작된 요청은 받지 않는다(로그인 CSRF).
 *
 * Supabase 는 SDK 경계(`getSupabaseAuthClient`)에서 스텁한다. 의도 쿠키는
 * 실제 `lib/password-reset-intent` 로 만들고 읽는다 — 서명 규칙까지 같이 본다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PASSWORD_RESET_COOKIE,
  issuePasswordResetIntent,
  readPasswordResetIntent,
} from "@/lib/password-reset-intent";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION = "33333333-3333-4333-8333-333333333333";
const TOKEN_HASH = "a".repeat(56);

type AuthError = { message: string; status?: number; code?: string } | null;

const checkRateLimitAsync = vi.hoisted(() =>
  vi.fn(async (_key: string, _config: { limit: number; windowSec: number }) => ({
    allowed: true,
  }))
);
const logError = vi.hoisted(() => vi.fn());
const logWarn = vi.hoisted(() => vi.fn(async () => undefined));
const cookieJar = vi.hoisted(() => new Map<string, string>());
const cookieSet = vi.hoisted(() =>
  vi.fn((_name: string, _value: string, _options?: Record<string, unknown>) => undefined)
);
const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(async (_params: unknown) => ({
    data: { session: null, user: null } as {
      session: { access_token: string } | null;
      user: { id: string } | null;
    },
    error: null as AuthError,
  })),
  getClaims: vi.fn(async () => ({
    data: null as { claims: Record<string, unknown> } | null,
    error: null as AuthError,
  })),
  updateUser: vi.fn(async (_attrs: unknown) => ({ error: null as AuthError })),
  signOut: vi.fn(async (_opts?: unknown) => ({ error: null as AuthError })),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return { ...actual, checkRateLimitAsync };
});
// 열렸을 때의 메커니즘을 본다. 스위치 자체는 password-reset-closed.test.ts.
vi.mock("@/lib/password-reset-availability", () => ({ isPasswordResetEnabled: () => true }));
vi.mock("@/lib/logger", () => ({ logError, logWarn }));
vi.mock("@/lib/supabase-auth", () => ({ getSupabaseAuthClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: cookieSet,
  }),
}));

const ORIGIN = "https://quest-on-staging-two.vercel.app";
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: ORIGIN };

/** payload 만 의미 있는 access token. verify 는 Supabase 가 준 토큰이라 서명을 안 본다. */
function accessToken(claims: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
}

function verifyRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = SAME_ORIGIN
) {
  return new Request(`${ORIGIN}/api/auth/password-reset/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "203.0.113.7",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  }) as unknown as import("next/server").NextRequest;
}

async function verify(fields: Record<string, string>, headers?: Record<string, string>) {
  const { POST } = await import("../app/api/auth/password-reset/verify/route");
  return POST(verifyRequest(fields, headers));
}

function completeRequest(body: string, headers: Record<string, string> = SAME_ORIGIN) {
  return new Request(`${ORIGIN}/api/auth/password-reset/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      ...headers,
    },
    body,
  }) as unknown as import("next/server").NextRequest;
}

async function complete(body: unknown, headers?: Record<string, string>) {
  const { POST } = await import("../app/api/auth/password-reset/complete/route");
  const res = await POST(
    completeRequest(typeof body === "string" ? body : JSON.stringify(body), headers)
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function location(res: Response): URL {
  return new URL(res.headers.get("location") ?? "about:blank");
}

/** 쿠키 이름으로 마지막 set 호출을 찾는다. */
function lastCookieSet(name: string) {
  return cookieSet.mock.calls.filter((c) => c[0] === name).at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  checkRateLimitAsync.mockResolvedValue({ allowed: true });
  vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", Buffer.alloc(32, 7).toString("base64"));

  auth.verifyOtp.mockResolvedValue({
    data: {
      session: { access_token: accessToken({ sub: USER, session_id: SESSION }) },
      user: { id: USER },
    },
    error: null,
  });
  auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USER, session_id: SESSION, email: "a@example.com" } },
    error: null,
  });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/password-reset/verify", () => {
  const VALID = { token_hash: TOKEN_HASH, type: "recovery" };

  it("성공하면 이 세션에 묶인 의도 쿠키를 심고 303 으로 재설정 화면에 보낸다", async () => {
    const res = await verify(VALID);

    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/reset-password");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN_HASH, type: "recovery" });

    const call = lastCookieSet(PASSWORD_RESET_COOKIE);
    expect(call).toBeDefined();
    const [, value, options] = call!;
    expect(readPasswordResetIntent(value)).toEqual({ userId: USER, sessionId: SESSION });
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", secure: true });
  });

  it("다른 사이트에서 온 요청은 토큰을 쓰지 않고 403 — 로그인 CSRF", async () => {
    const cases: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      // same-site(다른 서브도메인)도 우리 origin 이 아니다.
      { "sec-fetch-site": "same-site", origin: "https://x.vercel.app" },
      // Sec-Fetch-Site 가 없으면 Origin 으로 본다.
      { origin: "https://evil.example" },
      // no-referrer 페이지에서 보낸 폼은 Origin 이 "null" 이다. 어디서 왔는지
      // 모르는 건 같으니 열지 않는다. 그래서 확인 화면은 strict-origin 을 쓴다.
      { origin: "null" },
      // 둘 다 없으면 모르는 것 — 열지 않는다.
      {},
    ];
    for (const headers of cases) {
      const res = await verify(VALID, headers);
      expect(res.status).toBe(403);
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("Sec-Fetch-Site 가 없는 구형 브라우저도 Origin 이 같으면 통과한다", async () => {
    const res = await verify(VALID, { origin: ORIGIN });
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/reset-password");
  });

  it.each([
    ["token_hash 없음", { type: "recovery" }],
    ["type 이 recovery 가 아님", { token_hash: TOKEN_HASH, type: "magiclink" }],
    ["token_hash 형식이 이상함", { token_hash: "short", type: "recovery" }],
    ["token_hash 에 구분자", { token_hash: `${TOKEN_HASH}/..`, type: "recovery" }],
  ])("%s → Supabase 를 부르지 않고 쓸 수 없는 링크 안내로", async (_label, fields) => {
    const res = await verify(fields as Record<string, string>);
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/auth/recovery");
    expect(location(res).searchParams.get("error")).toBe("invalid_link");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("Supabase 가 거절한 링크(만료·재사용) → 안내로, 쿠키 없음", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "expired", status: 403, code: "otp_expired" },
    });
    const res = await verify(VALID);

    expect(location(res).searchParams.get("error")).toBe("invalid_link");
    expect(cookieSet).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      "[password-reset] verify_failed",
      expect.objectContaining({ payload: { status: 403, code: "otp_expired" } })
    );
  });

  it("한도에 걸리면 토큰을 쓰지 않고 같은 링크로 되돌려 보낸다", async () => {
    checkRateLimitAsync.mockResolvedValue({ allowed: false });
    const res = await verify(VALID);

    const url = location(res);
    expect(url.pathname).toBe("/auth/recovery");
    expect(url.searchParams.get("error")).toBe("rate_limited");
    expect(url.searchParams.get("token_hash")).toBe(TOKEN_HASH);
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("한도 키는 IP 기준 verify 버킷이다", async () => {
    const { RATE_LIMITS } = await import("@/lib/rate-limit");
    await verify(VALID);
    expect(checkRateLimitAsync).toHaveBeenCalledWith(
      "password-reset-verify:ip:203.0.113.7",
      RATE_LIMITS.passwordResetVerify
    );
  });

  it("세션은 생겼는데 의도를 못 만들면 그 세션을 거둔다 — 키가 없을 때", async () => {
    vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", "");
    const res = await verify(VALID);

    expect(location(res).searchParams.get("error")).toBe("invalid_link");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(lastCookieSet(PASSWORD_RESET_COOKIE)).toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "[password-reset] intent_issue_failed",
      expect.any(Error),
      expect.anything()
    );
  });

  it("세션에 session_id 가 없어도 거둔다 — 묶을 대상이 없다", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: { access_token: accessToken({ sub: USER }) }, user: { id: USER } },
      error: null,
    });
    const res = await verify(VALID);

    expect(location(res).searchParams.get("error")).toBe("invalid_link");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(lastCookieSet(PASSWORD_RESET_COOKIE)).toBeUndefined();
  });

  it("SDK 가 던져도 안내로 보내고 원문을 흘리지 않는다", async () => {
    auth.verifyOtp.mockRejectedValue(new Error("network"));
    const res = await verify(VALID);
    expect(res.status).toBe(303);
    expect(location(res).searchParams.get("error")).toBe("invalid_link");
    expect(logError).toHaveBeenCalledWith(
      "[password-reset] verify_error",
      expect.any(Error),
      expect.anything()
    );
  });
});

describe("POST /api/auth/password-reset/complete", () => {
  const NEW_PASSWORD = { password: "correct horse battery" };

  function withIntent(sessionId = SESSION) {
    const value = issuePasswordResetIntent({ userId: USER, sessionId });
    cookieJar.set(PASSWORD_RESET_COOKIE, value!);
  }

  it("묶인 세션이면 바꾸고, 모든 세션을 끊고, 의도 쿠키를 지운다", async () => {
    withIntent();
    const { status, body } = await complete(NEW_PASSWORD);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, revoked: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD.password });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });

    const call = lastCookieSet(PASSWORD_RESET_COOKIE);
    expect(call?.[1]).toBe("");
    expect(call?.[2]).toMatchObject({ maxAge: 0, path: "/" });
  });

  it("전체 로그아웃이 실패해도 비밀번호는 이미 바뀌었다 — 성공, revoked:false", async () => {
    withIntent();
    auth.signOut.mockResolvedValue({ error: { message: "x", status: 500 } });
    const { status, body } = await complete(NEW_PASSWORD);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, revoked: false });
    expect(logWarn).toHaveBeenCalledWith(
      "[password-reset] global_signout_failed",
      expect.anything()
    );
  });

  it("다른 사이트에서 온 요청은 403 — 아무것도 보지 않는다", async () => {
    withIntent();
    const { status } = await complete(NEW_PASSWORD, {
      "sec-fetch-site": "cross-site",
      origin: "https://evil.example",
    });
    expect(status).toBe(403);
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("한도에 걸리면 429 — 세션도 보지 않는다", async () => {
    withIntent();
    checkRateLimitAsync.mockResolvedValue({ allowed: false });
    const { status, body } = await complete(NEW_PASSWORD);
    expect(status).toBe(429);
    expect(body.error).toBe("RATE_LIMITED");
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("검증된 세션이 없으면 401", async () => {
    withIntent();
    auth.getClaims.mockResolvedValue({ data: null, error: { message: "no session" } });
    const { status, body } = await complete(NEW_PASSWORD);
    expect(status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["의도 쿠키가 없음", () => undefined],
    // 같은 계정이어도 다른 세션(평범한 로그인)이면 안 된다.
    ["다른 세션에 묶인 쿠키", () => withIntent(OTHER_SESSION)],
    ["서명이 틀린 쿠키", () => cookieJar.set(PASSWORD_RESET_COOKIE, `v1.${USER}.${SESSION}.9999999999.forged`)],
  ])("%s → 403 INTENT_INVALID, 바꾸지 않는다", async (_label, arrange) => {
    arrange();
    const { status, body } = await complete(NEW_PASSWORD);
    expect(status).toBe(403);
    expect(body.error).toBe("INTENT_INVALID");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON 이 아님", "not-json"],
    ["짧은 비밀번호", { password: "short" }],
    // 상한은 Supabase 와 같은 72 **바이트**다.
    ["72바이트 초과 — 영문 73자", { password: "x".repeat(73) }],
    // 글자 수로는 25자라 예전 스키마(max(72))를 통과했고, Supabase 가 400 으로
    // 거절한 걸 500 UPDATE_FAILED 로 돌려줬다.
    ["72바이트 초과 — 한글 25자", { password: "가".repeat(25) }],
  ])("%s → 400, 바꾸지 않는다", async (_label, body) => {
    withIntent();
    const res = await complete(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUT");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["same_password", "SAME_PASSWORD"],
    ["weak_password", "WEAK_PASSWORD"],
  ])("Supabase %s → 400 %s, 세션은 그대로", async (code, expected) => {
    withIntent();
    auth.updateUser.mockResolvedValue({ error: { message: "x", status: 422, code } });
    const { status, body } = await complete(NEW_PASSWORD);
    expect(status).toBe(400);
    expect(body.error).toBe(expected);
    // 아직 못 바꿨다. 끊으면 다시 링크를 받아야 한다.
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(lastCookieSet(PASSWORD_RESET_COOKIE)).toBeUndefined();
  });

  it("그 밖의 실패는 500 UPDATE_FAILED — 서버 원문을 싣지 않는다", async () => {
    withIntent();
    auth.updateUser.mockResolvedValue({
      error: { message: "internal detail", status: 500, code: "unexpected_failure" },
    });
    const { status, body } = await complete(NEW_PASSWORD);
    expect(status).toBe(500);
    expect(body.error).toBe("UPDATE_FAILED");
    expect(JSON.stringify(body)).not.toContain("internal detail");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("한도 키는 IP 기준 complete 전용 접두어다", async () => {
    withIntent();
    await complete(NEW_PASSWORD);
    expect(checkRateLimitAsync.mock.calls[0][0]).toBe(
      "password-reset-complete:ip:203.0.113.7"
    );
  });
});
