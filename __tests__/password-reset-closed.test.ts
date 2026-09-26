/**
 * production 에서는 비밀번호 재설정이 어디로도 닿지 않는다 (이슈 #318).
 *
 * 새 설계는 staging 에서만 연다. production 은 staging 실측 뒤 별도 승인으로
 * 연다. 코드는 한 벌이라 "닫혔다" 가 한 진입점만 빠져도 조용히 열린다 —
 * 그래서 진입점마다 production 선언 아래에서 실제 동작을 본다.
 *
 * 스위치는 `lib/password-reset-availability.ts` 하나다. 열렸을 때의 메커니즘은
 * `password-reset-route.test.ts` · `password-reset-recovery-routes.test.ts` 가 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  isPasswordResetEnabled,
  resolvePasswordResetEnabled,
} from "@/lib/password-reset-availability";
import {
  PASSWORD_RESET_COOKIE,
  issuePasswordResetIntent,
} from "@/lib/password-reset-intent";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
const profileSingle = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({ auth })));
const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth,
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/supabase-auth", () => ({ getSupabaseAuthClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: cookieSet }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

const ORIGIN = "https://quest-on.app";
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", Buffer.alloc(32, 3).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function supabaseTouched(): boolean {
  return Object.values(auth).some((fn) => fn.mock.calls.length > 0) || createClient.mock.calls.length > 0;
}

describe("스위치", () => {
  it.each([
    [{ NEXT_PUBLIC_APP_ENV: "production" }, false],
    // 선언이 있으면 선언만 본다 — 로컬에서 production 선언으로 띄워도 닫힌다.
    [{ NEXT_PUBLIC_APP_ENV: "production", NODE_ENV: "development" }, false],
    [{ NEXT_PUBLIC_APP_ENV: "preview" }, false],
    [{ NEXT_PUBLIC_APP_ENV: "staging" }, true],
    [{ NEXT_PUBLIC_APP_ENV: " Staging " }, true],
    [{ NEXT_PUBLIC_APP_ENV: "development" }, true],
    [{ NEXT_PUBLIC_APP_ENV: "test" }, true],
    // 선언이 없는 production 빌드 — 프로덕션이든 선언을 빠뜨린 preview 든 닫힌다.
    [{ NODE_ENV: "production" }, false],
    [{ NEXT_PUBLIC_APP_ENV: "", NODE_ENV: "production" }, false],
    [{}, false],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
  ])("%j → %s", (env, expected) => {
    expect(resolvePasswordResetEnabled(env)).toBe(expected);
  });

  it("production 선언이면 꺼져 있다", () => {
    expect(isPasswordResetEnabled()).toBe(false);
  });
});

describe("production — 재설정은 닫혀 있다", () => {
  it.each([
    ["/forgot-password", "../app/(auth)/forgot-password/page"],
    ["/auth/recovery", "../app/auth/recovery/page"],
    ["/reset-password", "../app/(auth)/reset-password/page"],
  ])("%s 페이지는 세션을 읽기 전에 404 다", async (_path, mod) => {
    const { default: Page } = await import(mod);
    // 동기 컴포넌트는 던지고 async 는 거절한다. 둘 다 같은 식으로 잡는다.
    await expect(
      Promise.resolve().then(() =>
        Page({ searchParams: Promise.resolve({ token_hash: "a".repeat(40), type: "recovery" }) })
      )
    ).rejects.toThrow(NOT_FOUND);
    expect(supabaseTouched()).toBe(false);
  });

  it("발송 API 는 404 이고 메일을 보내지 않는다", async () => {
    const { POST } = await import("../app/api/auth/password-reset/route");
    const res = await POST(
      new NextRequest(`${ORIGIN}/api/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "someone@example.com" }),
      })
    );

    expect(res.status).toBe(404);
    expect(supabaseTouched()).toBe(false);
  });

  it("링크 확인 API 는 404 이고 토큰을 쓰지 않는다", async () => {
    const { POST } = await import("../app/api/auth/password-reset/verify/route");
    const body = new URLSearchParams({ token_hash: "a".repeat(40), type: "recovery" });
    const res = await POST(
      new NextRequest(`${ORIGIN}/api/auth/password-reset/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
        },
        body,
      })
    );

    expect(res.status).toBe(404);
    expect(supabaseTouched()).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("완료 API 는 404 이고 비밀번호를 바꾸지 않는다", async () => {
    const { POST } = await import("../app/api/auth/password-reset/complete/route");
    const res = await POST(
      new NextRequest(`${ORIGIN}/api/auth/password-reset/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
        },
        body: JSON.stringify({ password: "a-new-password-123" }),
      })
    );

    expect(res.status).toBe(404);
    expect(supabaseTouched()).toBe(false);
  });

  it("콜백은 next=/reset-password 를 목적지로 잇지 않는다", async () => {
    // 복구 링크는 Supabase 에 직접 요청해 받을 수도 있다(anon 키는 공개다).
    // 그 링크로 로그인은 되지만 재설정 화면으로 이어지면 안 된다.
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const { GET } = await import("../app/auth/callback/route");
    const res = await GET(new Request(`${ORIGIN}/auth/callback?code=abc&next=/reset-password`));
    const location = new URL(res.headers.get("location") ?? "");

    expect(location.pathname).toBe("/onboarding");
    expect(location.searchParams.get("redirect")).toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("로그인 화면에 '비밀번호를 잊으셨나요?' 링크를 그리지 않는다", () => {
    // 클라이언트 컴포넌트라 여기서 렌더하지 않는다. 링크가 스위치 안에 있는지 본다.
    const src = readFileSync("components/auth/CustomSignIn.tsx", "utf8");
    expect(src).toMatch(
      /isPasswordResetEnabled\(\)\s*&&\s*\(\s*<Link\s+href="\/forgot-password"/
    );
    expect(src.match(/href="\/forgot-password"/g)).toHaveLength(1);
  });
});

describe("proxy — 서명된 의도 쿠키가 있어도 스위치가 꺼지면 들이지 않는다", () => {
  beforeEach(() => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    auth.getUser.mockResolvedValue({ data: { user: { id: USER } } });
    profileSingle.mockResolvedValue({ data: { role: "student" } });
  });

  function requestWithIntent(): NextRequest {
    const req = new NextRequest(new URL("/reset-password", ORIGIN));
    // 이 사용자에게 제대로 발급된 값이다. 막는 건 서명이 아니라 스위치여야 한다.
    const value = issuePasswordResetIntent({ userId: USER, sessionId: SESSION });
    expect(value).not.toBeNull();
    req.cookies.set(PASSWORD_RESET_COOKIE, value!);
    return req;
  }

  it("production 에서 /reset-password 는 대시보드로 보낸다", async () => {
    const { proxy } = await import("../proxy");
    const res = await proxy(requestWithIntent());

    expect(new URL(res.headers.get("location") ?? "http://x/").pathname).toBe("/student");
  });

  it("같은 요청이 staging 에서는 통과한다 — 막은 것이 스위치임을 확인한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    const { proxy } = await import("../proxy");
    const res = await proxy(requestWithIntent());

    expect(res.headers.get("location")).toBeNull();
  });
});
