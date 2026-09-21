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
    expect(a.enabled).toEqual({ google: false, azure: false, kakao: false });
    expect(isProviderUnavailable(a, "google")).toBe(true);
  });

  it("켜진 provider 는 막지 않는다", async () => {
    // production fmhpwotcfshoqpdhzqqj 의 실제 응답 형태.
    stubFetch(() => ok({ google: true, azure: false, email: true }));

    const a = await fetchEnabledProviders("https://y.supabase.co", "anon");
    expect(isProviderUnavailable(a, "google")).toBe(false);
    expect(isProviderUnavailable(a, "azure")).toBe(true);
  });

  describe("kakao", () => {
    // 카카오는 비즈앱 심사 뒤에야 켜진다. 그 사이 버튼이 막다른 길로
    // 보내면 안 되므로 프로브가 kakao 를 읽어야 한다.
    it("꺼진 kakao 를 꺼졌다고 읽는다", async () => {
      stubFetch(() => ok({ google: true, azure: false, kakao: false }));

      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(a.enabled?.kakao).toBe(false);
      expect(isProviderUnavailable(a, "kakao")).toBe(true);
    });

    it("켜진 kakao 는 막지 않는다", async () => {
      stubFetch(() => ok({ google: true, azure: false, kakao: true }));

      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(a.enabled?.kakao).toBe(true);
      expect(isProviderUnavailable(a, "kakao")).toBe(false);
    });

    it("응답에 kakao 키가 없으면 꺼졌다고 읽는다", async () => {
      // 배포 중 구형 settings 응답. google/azure 와 같은 규칙 —
      // external 은 있는데 키가 없으면 false.
      stubFetch(() => ok({ google: true, azure: false }));

      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(isProviderUnavailable(a, "kakao")).toBe(true);
    });

    it("조회 실패 시 kakao 도 막지 않는다", async () => {
      stubFetch(() => {
        throw new Error("network down");
      });
      const a = await fetchEnabledProviders("https://x.supabase.co", "anon");
      expect(isProviderUnavailable(a, "kakao")).toBe(false);
    });
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

  // 버튼 마크업은 두 화면이 공유한다(components/auth/OAuthProviderButtons.tsx).
  // 예전에는 같은 SVG·같은 브랜드 클래스가 두 파일에 복제돼 있었고, 이 가드도
  // 두 벌로 돌았다. 화면은 "가용성을 읽어 넘기는지", 공용 컴포넌트는 "그걸로
  // 잠그는지" 로 나눠 본다.
  const PROVIDER_BUTTONS = "components/auth/OAuthProviderButtons.tsx";

  it.each(FILES)("%s 가 가용성을 읽어 버튼에 넘긴다", (path) => {
    const src = read(path);
    expect(src, "가용성 훅을 안 쓴다").toMatch(/useOAuthProviders\(\)/);
    expect(src, "가용성을 버튼에 안 넘긴다").toMatch(/googleUnavailable=\{googleUnavailable\}/);
    expect(src, "카카오 가용성을 안 넘긴다").toMatch(/kakaoUnavailable=\{kakaoUnavailable\}/);
  });

  it("공용 버튼이 가용성으로 구글·카카오를 잠근다", () => {
    const src = read(PROVIDER_BUTTONS);
    expect(src, "구글 버튼이 가용성과 무관하게 열려 있다").toMatch(
      /disabled=\{busy \|\| googleUnavailable[^}]*\}/
    );
    expect(src, "카카오 버튼이 가용성과 무관하게 열려 있다").toMatch(
      /disabled=\{busy \|\| kakaoUnavailable[^}]*\}/
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

  it("두 화면이 버튼 마크업을 복제하지 않는다", () => {
    // 같은 SVG path 네 벌, 같은 카카오 브랜드 클래스, 같은 안내 문구 두 줄이
    // 두 파일에 그대로 있었다. 가입 화면 주석이 "브랜드 규정은 CustomSignIn.tsx
    // 의 같은 버튼 주석 참조" 라고 적을 만큼 알려진 중복이었고, 이미 갈라지고
    // 있었다 — 가입 화면만 역할 선택 전에 잠갔다.
    const marks = [
      "#FEE500", // 카카오 브랜드 컨테이너 색
      "#4285F4", // 구글 로고 path
      "#F25022", // Microsoft 타일
      'viewBox="0 0 23 23"',
    ];
    for (const [path] of FILES) {
      const src = read(path);
      for (const m of marks) {
        expect(src, `${path} 에 ${m} 가 아직 있다 — 공용 버튼으로 옮겨야 한다`).not.toContain(m);
      }
      expect(src, `${path} 가 공용 버튼을 안 쓴다`).toMatch(/<OAuthProviderButtons/);
    }
    // 그리고 공용 쪽에는 전부 있어야 한다 — 위 단정이 "그냥 지웠다" 로 통과하면 안 된다.
    const shared = read("components/auth/OAuthProviderButtons.tsx");
    for (const m of marks) {
      expect(shared, `공용 버튼에 ${m} 가 없다`).toContain(m);
    }
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
  // 버튼과 안내는 이제 두 화면이 공유한다 — 한 곳만 보면 된다.
  const FILES = ["components/auth/OAuthProviderButtons.tsx"] as const;

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

  it.each(FILES)("%s 의 준비중 안내도 버튼 밖에 있다", (path) => {
    // Microsoft 버튼은 상시 disabled 다. 같은 이유로 안내가 흐려지면 안 된다.
    const src = read(path);
    expect(
      src,
      "comingSoon 이 버튼 안 Badge 로 들어갔다"
    ).not.toMatch(/<Badge[^>]*>\s*\{t\("comingSoon"\)\}/);
  });
});
