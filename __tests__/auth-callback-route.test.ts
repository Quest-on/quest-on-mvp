/**
 * `/auth/callback` 라우트 핸들러 소비 지점 회귀 테스트 (이슈 #99).
 *
 * 헬퍼(`buildCallbackRedirectUrl`) 단위 테스트만으로는 "라우트가 실제로 그 헬퍼를
 * 쓰는가"를 증명하지 못한다. 여기서는 진짜 `GET` 핸들러를 호출해 **응답의
 * Location 헤더**를 본다. 리뷰 지적의 형태(`?next=@evil.com` 을 붙인 요청)를
 * 그대로 재현한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn(async () => ({ error: null }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
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
  exchangeCodeForSession.mockResolvedValue({ error: null });
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
      error: new Error("bad code"),
    } as never);

    const location = await callCallback("?code=bad&next=/exam/ABC");
    expect(location).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("code 가 없으면 세션 교환 없이 로그인 페이지로 보낸다", async () => {
    const location = await callCallback("?next=/exam/ABC");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });
});
