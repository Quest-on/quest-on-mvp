/**
 * 비밀번호 재설정이 닫혀 있는 동안 어디로도 닿지 않는다 (이슈 #318).
 *
 * 리뷰 네 번 동안 매번 수정이 새 구멍을 만들어, 위협 모델을 다시 쓸 때까지
 * 기능을 닫고 나머지를 승격하기로 했다. 코드는 남긴다 — 그래서 "닫혔다" 가
 * 한 곳만 빠져도 조용히 다시 열린다. 진입점마다 실제 동작을 본다.
 *
 * 스위치는 `lib/password-reset-availability.ts` 하나다. 열었을 때의 메커니즘은
 * `password-reset-route.test.ts` · `auth-callback-route.test.ts` 가 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { passwordResetIntentCookie } from "@/lib/password-reset-intent";

const exchangeCodeForSession = vi.fn();
const resetPasswordForEmail = vi.fn();
const cookieSet = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession, resetPasswordForEmail },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: cookieSet }),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

/** amr 클레임만 담은 가짜 access token — 서명은 보지 않는다. */
function recoveryToken(): string {
  const payload = Buffer.from(JSON.stringify({ amr: [{ method: "otp" }] }))
    .toString("base64url");
  return `header.${payload}.sig`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("#318 — 재설정은 닫혀 있다", () => {
  it("스위치가 꺼져 있다", () => {
    expect(isPasswordResetEnabled()).toBe(false);
  });

  it.each([
    ["/forgot-password", "../app/(auth)/forgot-password/page"],
    ["/reset-password", "../app/(auth)/reset-password/page"],
  ])("%s 페이지는 404 다", async (_path, mod) => {
    const { default: Page } = await import(mod);
    // notFound() 는 던져서 렌더를 끊는다.
    expect(() => Page()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("발송 API 는 404 이고 메일을 보내지 않는다", async () => {
    const { POST } = await import("../app/api/auth/password-reset/route");
    const res = await POST(
      new NextRequest("https://quest-on.app/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "someone@example.com" }),
      })
    );

    expect(res.status).toBe(404);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("복구 세션이 와도 콜백이 의도 쿠키를 심지 않고 재설정 화면으로 보내지 않는다", async () => {
    // 복구 링크는 Supabase 에 직접 요청해 받을 수도 있다(anon 키는 공개다).
    // 그 링크로 로그인은 되지만 재설정 화면으로 이어지면 안 된다.
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: recoveryToken() } },
      error: null,
    });
    const { GET } = await import("../app/auth/callback/route");
    const res = await GET(
      new Request("https://quest-on.app/auth/callback?code=abc&next=/reset-password")
    );
    const location = new URL(res.headers.get("location") ?? "");

    expect(location.pathname).toBe("/onboarding");
    expect(location.searchParams.get("redirect")).toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("다른 목적지는 그대로 이어 준다 — 콜백 전체를 막은 게 아니다", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: recoveryToken() } },
      error: null,
    });
    const { GET } = await import("../app/auth/callback/route");
    const res = await GET(
      new Request("https://quest-on.app/auth/callback?code=abc&next=/exam/ABC123")
    );
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("redirect")).toBe(
      "/exam/ABC123"
    );
  });

  it("로그인 화면에 '비밀번호를 잊으셨나요?' 링크를 그리지 않는다", () => {
    // 클라이언트 컴포넌트라 여기서 렌더하지 않는다. 링크가 스위치 안에 있는지 본다.
    const src = readFileSync("components/auth/CustomSignIn.tsx", "utf8");
    expect(src).toMatch(
      /isPasswordResetEnabled\(\)\s*&&\s*\(\s*<Link\s+href="\/forgot-password"/
    );
    expect(src.match(/href="\/forgot-password"/g)).toHaveLength(1);
  });

  describe("proxy — 의도 쿠키가 있어도 로그인 사용자를 들이지 않는다", () => {
    const SECRET = "password-reset-closed-secret";

    beforeEach(() => {
      vi.stubEnv("TEST_BYPASS_SECRET", SECRET);
      vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
      vi.stubEnv("CONSENT_GATE_MODE", "enforce");
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      vi.resetModules();
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("/reset-password 는 대시보드로 보낸다", async () => {
      const { proxy } = await import("../proxy");
      const req = new NextRequest(new URL("/reset-password", "http://localhost:3000"));
      req.cookies.set("__test_bypass", SECRET);
      req.cookies.set("__test_user_role", "student");
      const intent = passwordResetIntentCookie(false);
      req.cookies.set(intent.name, intent.value);

      const res = await proxy(req);

      expect(new URL(res.headers.get("location") ?? "http://x/").pathname).toBe("/student");
    });
  });
});
