/**
 * `/auth/callback` 라우트 핸들러 소비 지점 회귀 테스트 (이슈 #99).
 *
 * 헬퍼(`buildCallbackRedirectUrl`) 단위 테스트만으로는 "라우트가 실제로 그 헬퍼를
 * 쓰는가"를 증명하지 못한다. 여기서는 진짜 `GET` 핸들러를 호출해 **응답의
 * Location 헤더**를 본다. 리뷰 지적의 형태(`?next=@evil.com` 을 붙인 요청)를
 * 그대로 재현한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** amr 클레임만 담은 가짜 access token — 서명은 보지 않는다. */
function tokenWithAmr(method: string): string {
  const payload = Buffer.from(JSON.stringify({ amr: [{ method }] }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

type ExchangeResult = {
  data: { session: { access_token: string } | null };
  error: Error | null;
};

const PASSWORD_SESSION: ExchangeResult = {
  data: { session: { access_token: tokenWithAmr("password") } },
  error: null,
};
const RECOVERY_SESSION: ExchangeResult = {
  data: { session: { access_token: tokenWithAmr("otp") } },
  error: null,
};

const exchangeCodeForSession = vi.fn(async (): Promise<ExchangeResult> => PASSWORD_SESSION);
const cookieSet = vi.fn();

// 재설정은 지금 닫혀 있다(#318, lib/password-reset-availability.ts). 이 파일은
// **열었을 때** 메커니즘이 맞는지를 본다 — 다시 열 때 그대로 쓰려고 남긴다.
// 닫혀 있을 때의 동작은 __tests__/password-reset-closed.test.ts 가 본다.
vi.mock("@/lib/password-reset-availability", () => ({ isPasswordResetEnabled: () => true }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: cookieSet,
  }),
}));

const ORIGIN = "https://quest-on.app";

async function callCallback(query: string): Promise<string> {
  const { GET } = await import("../app/auth/callback/route");
  const response = await GET(new Request(`${ORIGIN}/auth/callback${query}`));
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue(PASSWORD_SESSION);
});

describe("GET /auth/callback", () => {
  // 콜백은 이제 항상 /onboarding 을 거친다.
  //
  // 예전에는 next 로 바로 보냈는데, 그러면 동의를 받지 않은 사용자가
  // 곧장 보호 화면으로 들어간다. 원래 가려던 곳은 잃지 않고 ?redirect= 로
  // 보존한 뒤 온보딩을 마치고 그리로 돌려보낸다.
  it("원래 목적지를 보존한 채 온보딩으로 보낸다", async () => {
    const location = await callCallback("?code=valid&next=/exam/ABC");
    expect(location).toBe(`${ORIGIN}/onboarding?redirect=%2Fexam%2FABC`);
  });

  it("next 가 없으면 온보딩으로만 보낸다", async () => {
    expect(await callCallback("?code=valid")).toBe(`${ORIGIN}/onboarding`);
  });

  it("next=@evil.com 이 호스트를 바꾸지 못한다 — 이슈 #99 재현", async () => {
    // 수정 전 구현(`${origin}${next}`)이었다면 https://quest-on.app@evil.com/ 로
    // 나가서 로그인 성공 직후 외부 사이트에 떨어졌다.
    // 온보딩 경유로 바뀐 뒤에도 이 방어는 그대로여야 한다.
    const location = await callCallback("?code=valid&next=@evil.com");
    expect(new URL(location).host).toBe("quest-on.app");
    // 위험한 값은 redirect 로도 실려나가지 않는다.
    expect(location).toBe(`${ORIGIN}/onboarding`);
  });

  it("프로토콜 상대 URL·절대 URL·위험 스킴을 모두 막는다", async () => {
    for (const next of [
      "//evil.com",
      "/%5Cevil.com",
      "https://evil.com",
      "javascript:alert(1)",
    ]) {
      const location = await callCallback(
        `?code=valid&next=${encodeURIComponent(next)}`
      );
      expect(new URL(location).origin).toBe(ORIGIN);
    }
  });

  it("세션 교환이 실패하면 로그인 페이지로 보낸다", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error("bad code"),
    });

    const location = await callCallback("?code=bad&next=/exam/ABC");
    expect(location).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("code 가 없으면 세션 교환 없이 로그인 페이지로 보낸다", async () => {
    const location = await callCallback("?next=/exam/ABC");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  // ── 비밀번호 재설정만 온보딩을 건너뛴다 (#318) ────────────────────
  //
  // 복구 링크를 누른 사람은 비밀번호를 바꾸러 온 것이다. 온보딩(필수 동의
  // 게이트)에 먼저 세우면, 동의를 미루고 탭을 닫는 순간 **로그인은 된 채
  // 잊어버린 비밀번호는 그대로** 남는다. 다음에 또 못 들어온다.
  describe("비밀번호 재설정 경로", () => {
    it("복구 세션이면 온보딩을 거치지 않고 곧장 간다", async () => {
      exchangeCodeForSession.mockResolvedValue(RECOVERY_SESSION);
      const location = await callCallback("?code=valid&next=/reset-password");
      expect(location).toBe(`${ORIGIN}/reset-password`);
    });

    it("복구 세션일 때만 의도 쿠키를 심는다", async () => {
      exchangeCodeForSession.mockResolvedValue(RECOVERY_SESSION);
      await callCallback("?code=valid&next=/reset-password");
      expect(cookieSet).toHaveBeenCalledWith(
        "password_reset_intent",
        "1",
        expect.objectContaining({ httpOnly: true, path: "/reset-password" })
      );
    });

    // ── 여기가 #456 의 핵심이다 ────────────────────────────────────
    //
    // 예전엔 `next` 값만 보고 온보딩을 건너뛰었다. `next` 는 사용자가 붙일 수
    // 있는 값이라, 평범한 OAuth 로그인에 붙이면 **필수 동의 게이트가 그대로
    // 열렸다.** anon 키는 공개이므로 누구나 만들 수 있는 링크였다.
    it("복구가 아닌 세션은 next 를 붙여도 온보딩을 거친다", async () => {
      for (const method of ["password", "oauth"]) {
        vi.clearAllMocks();
        exchangeCodeForSession.mockResolvedValue({
          data: { session: { access_token: tokenWithAmr(method) } },
          error: null,
        });
        const location = await callCallback("?code=valid&next=/reset-password");
        expect(new URL(location).pathname).toBe("/onboarding");
        expect(cookieSet).not.toHaveBeenCalledWith(
          "password_reset_intent",
          expect.anything(),
          expect.anything()
        );
      }
    });

    it("amr 을 읽을 수 없으면 복구로 보지 않는다", async () => {
      // 모를 때 열어주면 그게 구멍이다.
      for (const token of ["not-a-jwt", "a.b", ""]) {
        vi.clearAllMocks();
        exchangeCodeForSession.mockResolvedValue({
          data: { session: { access_token: token } },
          error: null,
        });
        const location = await callCallback("?code=valid&next=/reset-password");
        expect(new URL(location).pathname).toBe("/onboarding");
      }
    });

    it("게이트를 여는 건 그 경로 하나뿐이다", async () => {
      // 비슷하게 생긴 경로가 묻어 들어오면 온보딩이 통째로 무력해진다.
      exchangeCodeForSession.mockResolvedValue(RECOVERY_SESSION);
      for (const next of [
        "/reset-password-extra",
        "/reset-password/",
        "/reset-password?x=1",
        "/instructor",
      ]) {
        const location = await callCallback(
          `?code=valid&next=${encodeURIComponent(next)}`
        );
        expect(new URL(location).pathname).toBe("/onboarding");
      }
    });

    it("세션 교환이 실패하면 재설정 화면으로도 보내지 않는다", async () => {
      exchangeCodeForSession.mockResolvedValue({
        data: { session: null },
        error: new Error("expired"),
      });

      const location = await callCallback("?code=expired&next=/reset-password");
      expect(location).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
    });
  });
});
