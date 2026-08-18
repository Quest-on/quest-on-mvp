import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchEnabledProviders,
  isProviderUnavailable,
  UNRESOLVED,
} from "@/lib/oauth-providers";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * staging 에서 실제로 겪은 막다른 길을 막는다.
 *
 * "Google로 계속하기" 를 누르면 supabase-js 가 브라우저를 통째로 넘긴다.
 * provider 가 꺼져 있으면 앱 도메인 밖에서 이렇게 끝난다.
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * 돌아올 방법이 없다. 누르기 전에 알아야 한다.
 */
describe("OAuth provider 가용성", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (impl: () => unknown) => {
    vi.stubGlobal("fetch", vi.fn(impl));
  };

  const ok = (external: Record<string, unknown>) => ({
    ok: true,
    json: async () => ({ external }),
  });

  it("꺼진 provider 를 꺼졌다고 읽는다", async () => {
    // staging fsnahnxhukpqdqnxhsfh 의 실제 응답 형태.
    stubFetch(() => ok({ google: false, azure: false, email: true }));

    const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
    expect(a.enabled).toEqual({ google: false, azure: false });
    expect(isProviderUnavailable(a, "google")).toBe(true);
  });

  it("켜진 provider 는 막지 않는다", async () => {
    // production fmhpwotcfshoqpdhzqqj 의 실제 응답 형태.
    stubFetch(() => ok({ google: true, azure: false, email: true }));

    const a = await fetchEnabledProviders("https://y.supabase.co", "anon");
    expect(isProviderUnavailable(a, "google")).toBe(false);
    expect(isProviderUnavailable(a, "azure")).toBe(true);
  });

  it("anon 키를 apikey 헤더로 보낸다", async () => {
    const spy = vi.fn(() => ok({ google: true }));
    vi.stubGlobal("fetch", spy);

    await fetchEnabledProviders("https://z.supabase.co", "anon-key");

    expect(spy).toHaveBeenCalledWith(
      "https://z.supabase.co/auth/v1/settings",
      expect.objectContaining({ headers: { apikey: "anon-key" } })
    );
  });

  describe("모를 때는 막지 않는다", () => {
    // 네트워크가 잠깐 끊겼다고 로그인 버튼을 잠그면 멀쩡한 provider 를
    // 우리가 막는 꼴이다. 모르면 Supabase 가 판단하게 둔다.
    it("조회 전에는 막지 않는다", () => {
      expect(isProviderUnavailable(UNRESOLVED, "google")).toBe(false);
    });

    it("네트워크 실패", async () => {
      stubFetch(() => {
        throw new Error("network down");
      });
      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(a.enabled).toBeNull();
      expect(isProviderUnavailable(a, "google")).toBe(false);
    });

    it("비정상 응답 코드", async () => {
      stubFetch(() => ({ ok: false, json: async () => ({}) }));
      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(isProviderUnavailable(a, "google")).toBe(false);
    });

    it("external 이 없는 본문", async () => {
      stubFetch(() => ({ ok: true, json: async () => ({}) }));
      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(isProviderUnavailable(a, "google")).toBe(false);
    });

    it("환경변수가 비면 요청조차 하지 않는다", async () => {
      const spy = vi.fn();
      vi.stubGlobal("fetch", spy);
      const a = await fetchEnabledProviders(undefined, undefined);
      expect(spy).not.toHaveBeenCalled();
      expect(isProviderUnavailable(a, "google")).toBe(false);
    });
  });
});

describe("로그인·가입 화면 배선", () => {
  const FILES = [
    ["components/auth/CustomSignIn.tsx", "signIn"],
    ["components/auth/CustomSignUp.tsx", "signUp"],
  ] as const;

  it.each(FILES)("%s 가 가용성을 보고 구글 버튼을 잠근다", (path) => {
    const src = read(path);
    expect(src, "가용성 훅을 안 쓴다").toMatch(/useOAuthProviders\(\)/);
    expect(src, "구글 버튼이 가용성과 무관하게 열려 있다").toMatch(
      /disabled=\{!!oauthLoading \|\| googleUnavailable\}/
    );
  });

  it.each(FILES)("%s 가 signInWithOAuth 의 error 를 버리지 않는다", (path) => {
    const src = read(path);
    // 반환값을 버리면 실패했을 때 버튼이 영영 도는 채로 남는다.
    //
    // 부분일치로는 못 잡는다 — `const { error } = await supabase...` 도
    // `await supabase...` 를 포함한다. 줄 시작을 고정해야 "대입 없이 호출"
    // 만 걸린다.
    expect(src, "반환값을 대입하지 않고 호출한다").not.toMatch(
      /^\s*await supabase\.auth\.signInWithOAuth\(/m
    );
    expect(src, "error 를 안 본다").toMatch(/error: oauthError/);
    expect(src, "실패해도 로딩을 안 푼다").toMatch(
      /if \(oauthError\)[\s\S]{0,120}setOauthLoading\(null\)/
    );
  });

  it.each(["ko", "en"])("%s 메시지가 있다", (locale) => {
    const msg = JSON.parse(read(`messages/${locale}/auth.json`));
    for (const scope of ["signIn", "signUp"]) {
      expect(
        msg[scope]?.providerUnavailable,
        `${locale}/auth.json 의 ${scope}.providerUnavailable 이 없다`
      ).toBeTruthy();
    }
  });
});

describe("잠긴 이유가 읽혀야 한다", () => {
  // disabled 버튼은 opacity 0.5 다. 안내를 버튼 안에 넣으면 같이 흐려져서
  // 다크에서 대비가 10.79 -> 3.95 로 떨어졌다. 왜 못 누르는지 못 읽는다.
  // 버튼은 흐려도 되지만 이유는 읽혀야 한다.
  const FILES = [
    "components/auth/CustomSignIn.tsx",
    "components/auth/CustomSignUp.tsx",
  ] as const;

  it.each(FILES)("%s 의 안내가 버튼 밖에 있다", (path) => {
    const src = read(path);
    const start = src.indexOf("googleUnavailable ?");
    expect(start, "안내 조건을 찾지 못했다").toBeGreaterThan(-1);

    // 안내 블록이 </Button> 뒤에 와야 한다.
    const closed = src.lastIndexOf("</Button>", start);
    expect(closed, "안내가 버튼 안에 있다").toBeGreaterThan(-1);
  });

  it.each(FILES)("%s 가 안내를 Badge 로 버튼 안에 넣지 않는다", (path) => {
    const src = read(path);
    expect(
      src,
      "providerUnavailable 이 다시 Badge 로 들어갔다"
    ).not.toMatch(/<Badge[^>]*>\s*\{t\("providerUnavailable"\)\}/);
  });
});
