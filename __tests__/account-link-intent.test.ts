/**
 * 계정 연결 의도 쿠키와 링크 전용 콜백 (PR-2, AC-16).
 *
 * 왜 이 형태인가 (스펙 f46):
 * - OAuth `state` 는 SDK/GoTrue 가 PKCE-CSRF 용으로 소유한다. 앱이 덮어쓰면 안 된다.
 * - 같은 `/auth/callback` 에 `?flow=link` 를 붙이는 건 사용자가 조작할 수 있어
 *   단독으로 못 믿는다.
 * - `onboarding_role` 쿠키는 비-HttpOnly 라 인가 판단에 못 쓴다(파일 주석 명시).
 *
 * 그래서 인증된 시작점이 의도를 HttpOnly·Path 한정 쿠키에 넣고, 링크 전용
 * 콜백이 1회 소비한다. **핵심 통제는 `userId` 결합**이다 — 콜백이 쿠키의
 * userId 와 실제 세션 사용자를 대조한다.
 *
 * 예전에는 opaque `nonce` 도 있었지만 대조하는 곳이 없어 아무 일도 하지 않았고,
 * 이 파일의 테스트 이름이 "nonce 가 맞고" 라고 적어 없는 통제를 있다고 말했다
 * (이슈 #414). 지웠다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCOUNT_LINK_COOKIE,
  ACCOUNT_LINK_CALLBACK_PATH,
  ACCOUNT_LINK_COOKIE_MAX_AGE,
  linkIntentCookie,
  readLinkIntentCookie,
} from "@/lib/account-link-intent";

describe("링크 의도 쿠키", () => {
  // 라우트가 이 함수의 결과를 그대로 response.cookies.set 에 넘긴다.
  // 예전 테스트는 프로덕션이 안 쓰는 헤더 빌더를 검증해서, 실제 쿠키 속성을
  // 깨뜨려도 초록이었다(#414).
  it("HttpOnly·Secure·SameSite=Lax·Path 한정·짧은 수명을 전부 단다", () => {
    const c = linkIntentCookie({ userId: "u1", provider: "kakao" }, true);
    expect(c.name).toBe(ACCOUNT_LINK_COOKIE);
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.secure).toBe(true);
    expect(c.options.sameSite).toBe("lax");
    expect(c.options.path).toBe(ACCOUNT_LINK_CALLBACK_PATH);
    expect(c.options.maxAge).toBe(ACCOUNT_LINK_COOKIE_MAX_AGE);
  });

  it("평문 http 에서는 Secure 를 달지 않는다", () => {
    expect(linkIntentCookie({ userId: "u1", provider: "kakao" }, false).options.secure).toBe(false);
  });

  it("값에 userId·provider 가 실려 있고 되읽힌다", () => {
    const c = linkIntentCookie({ userId: "user-9", provider: "google" }, false);
    const parsed = readLinkIntentCookie(`${ACCOUNT_LINK_COOKIE}=${c.value}`);
    expect(parsed).toEqual({ userId: "user-9", provider: "google" });
  });

  it("라우트가 이 정의를 쓴다 — 형식이 두 벌이 되지 않게", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "app/api/account/identities/route.ts"),
      "utf8"
    );
    expect(src, "쿠키 형식을 라우트가 다시 쓰고 있다").toMatch(/linkIntentCookie\(/);
    expect(src, "속성을 인라인으로 다시 적었다").not.toMatch(/httpOnly:\s*true/);
  });

  it("쿠키가 없거나 깨졌으면 null", () => {
    expect(readLinkIntentCookie(undefined)).toBeNull();
    expect(readLinkIntentCookie("other=1")).toBeNull();
    expect(readLinkIntentCookie(`${ACCOUNT_LINK_COOKIE}=not-json`)).toBeNull();
    // userId 가 없으면 결합할 대상이 없다 — 통째로 버린다.
    expect(
      readLinkIntentCookie(`${ACCOUNT_LINK_COOKIE}=${encodeURIComponent(JSON.stringify({ provider: "kakao" }))}`)
    ).toBeNull();
  });

  it("provider 는 허용 목록만 받는다", () => {
    const bad = encodeURIComponent(JSON.stringify({ userId: "u", provider: "evil" }));
    expect(readLinkIntentCookie(`${ACCOUNT_LINK_COOKIE}=${bad}`)).toBeNull();
  });
});

// ── 링크 전용 콜백 ──────────────────────────────────────────────

const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null }; error: null }> => ({ data: { user: { id: "user-9" } }, error: null }));
const signOut = vi.fn(async () => ({ error: null }));
let cookieJar: Record<string, string> = {};
const setCookie = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession, getUser, signOut } }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Object.entries(cookieJar).map(([name, value]) => ({ name, value })),
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
    set: setCookie,
  }),
}));

const ORIGIN = "https://quest-on.app";

async function callLinkCallback(query: string): Promise<Response> {
  const { GET } = await import("../app/auth/link-callback/route");
  return GET(new Request(`${ORIGIN}/auth/link-callback${query}`));
}

function armIntent(userId = "user-9") {
  cookieJar[ACCOUNT_LINK_COOKIE] = encodeURIComponent(JSON.stringify({ userId, provider: "kakao" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar = {};
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "user-9" } }, error: null });
});

describe("GET /auth/link-callback", () => {
  it("세션 사용자가 의도와 일치하면 설정 화면으로 보내고 쿠키를 지운다", async () => {
    armIntent();
    const res = await callLinkCallback("?code=valid");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/settings?linked=kakao`);
    const cleared = setCookie.mock.calls.find((c) => c[0] === ACCOUNT_LINK_COOKIE);
    expect(cleared, "의도 쿠키를 소비 후 지우지 않았다").toBeTruthy();
    expect(cleared?.[2]?.maxAge).toBe(0);
  });

  it("의도 쿠키가 없으면 code 교환 없이 실패 경로", async () => {
    const res = await callLinkCallback("?code=valid");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("세션 사용자가 의도의 userId 와 다르면 실패 경로", async () => {
    // 다른 사람의 브라우저에서 훔친 code 를 내 의도 쿠키에 붙이는 시나리오.
    armIntent("someone-else");
    const res = await callLinkCallback("?code=valid");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("교환이 세션을 다른 사용자로 바꿨으면 그 세션을 남기지 않는다 — red-team BLOCK", async () => {
    // exchangeCodeForSession 은 성공하면 쿠키를 code 소유자의 세션으로 덮어쓴다.
    // 대조가 실패해 302 를 돌려도 그 쿠키가 응답에 실려 나가면 피해자 브라우저가
    // 공격자 계정으로 로그인된다(세션 고정 공격의 역방향). 실패 경로에서는 바뀜 세션을
    // 반드시 끊어야 한다.
    armIntent("victim");
    // 교환 전에는 피해자 세션(정상 시작), 교환이 공격자 code 를 소비한 뒤에는 공격자 세션.
    getUser
      .mockResolvedValueOnce({ data: { user: { id: "victim" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "attacker" } }, error: null });
    const res = await callLinkCallback("?code=attackers-code");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
    expect(signOut, "바뀜 세션을 끊지 않았다 — 피해자가 공격자 계정으로 로그인된다").toHaveBeenCalled();
  });

  it("교환 전에 현재 세션이 의도의 userId 가 아니면 교환하지 않는다", async () => {
    // 링크는 로그인된 사용자만 시작할 수 있다. 콜백 시점에 그 사용자가 아니면
    // (로그아웃됐거나 다른 계정) 교환을 시도할 이유가 없다. 교환하면 세션이 바뀜다.
    armIntent("victim");
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callLinkCallback("?code=valid");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("code 가 없으면 실패 경로", async () => {
    armIntent();
    const res = await callLinkCallback("");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("code 교환이 실패하면 실패 경로", async () => {
    armIntent();
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad") } as never);
    const res = await callLinkCallback("?code=bad");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });

  it("?flow=link 같은 URL 마커만으로는 아무것도 안 된다", async () => {
    // 마커는 사용자가 붙일 수 있다. 쿠키 없이는 링크 경로가 아니다.
    const res = await callLinkCallback("?code=valid&flow=link");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=auth_callback_failed`);
  });
});

describe("기존 /auth/callback 은 건드리지 않는다 (회귀)", () => {
  it("의도 쿠키가 있어도 일반 콜백은 온보딩으로 간다", async () => {
    armIntent();
    const { GET } = await import("../app/auth/callback/route");
    const res = await GET(new Request(`${ORIGIN}/auth/callback?code=valid`));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
  });
});
