/**
 * OAuth 콜백 오픈 리다이렉트 회귀 테스트 (이슈 #99).
 *
 * 기존 구현은 `${origin}${next}` 문자열 결합이었다. URL 파서는 결합된 문자열을
 * 다시 해석하므로 `next` 가 호스트를 바꿔치기할 수 있었다:
 *
 *   new URL("https://quest-on.app" + "@evil.com") -> https://quest-on.app@evil.com/
 *
 * 로그인에 **성공한 직후** 외부로 튕기는 경로라 피싱 신뢰도가 그대로 넘어간다.
 */
import { describe, it, expect } from "vitest";
import { buildCallbackRedirectUrl } from "../lib/safe-redirect";

const ORIGIN = "https://quest-on.app";

function hostOf(url: string): string {
  return new URL(url).host;
}

describe("buildCallbackRedirectUrl", () => {
  it("정상 내부 경로는 그대로 유지한다", () => {
    expect(buildCallbackRedirectUrl(ORIGIN, "/exam/ABC")).toBe(
      "https://quest-on.app/exam/ABC"
    );
    expect(buildCallbackRedirectUrl(ORIGIN, "/onboarding?redirect=/student")).toBe(
      "https://quest-on.app/onboarding?redirect=/student"
    );
  });

  it("next 가 없으면 루트로 보낸다 — 기존 기본값과 동일", () => {
    expect(buildCallbackRedirectUrl(ORIGIN, null)).toBe("https://quest-on.app/");
    expect(buildCallbackRedirectUrl(ORIGIN, undefined)).toBe("https://quest-on.app/");
  });

  it("userinfo 트릭(@evil.com)이 호스트를 바꾸지 못한다", () => {
    // 문자열 결합이었다면 https://quest-on.app@evil.com/ 이 됐다.
    const url = buildCallbackRedirectUrl(ORIGIN, "@evil.com");
    expect(hostOf(url)).toBe("quest-on.app");
    expect(url).toBe("https://quest-on.app/");
  });

  it("프로토콜 상대 URL 과 역슬래시 변형을 막는다", () => {
    for (const next of ["//evil.com", "/\\evil.com", "//evil.com/path"]) {
      const url = buildCallbackRedirectUrl(ORIGIN, next);
      expect(hostOf(url)).toBe("quest-on.app");
    }
  });

  it("절대 URL 과 위험한 스킴을 막는다", () => {
    for (const next of [
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      const url = buildCallbackRedirectUrl(ORIGIN, next);
      expect(hostOf(url)).toBe("quest-on.app");
      expect(url.startsWith("https://quest-on.app/")).toBe(true);
    }
  });

  it("어떤 입력이 와도 결과 오리진은 항상 우리 오리진이다", () => {
    const hostile = [
      "@evil.com",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "  //evil.com",
      "\t@evil.com",
      "/exam\nhttps://evil.com",
    ];

    for (const next of hostile) {
      expect(new URL(buildCallbackRedirectUrl(ORIGIN, next)).origin).toBe(ORIGIN);
    }
  });

  it("실패 경로의 기본 목적지도 같은 조립을 거친다", () => {
    expect(
      buildCallbackRedirectUrl(ORIGIN, "/sign-in?error=auth_callback_failed")
    ).toBe("https://quest-on.app/sign-in?error=auth_callback_failed");
  });

  it("fallback 을 지정하면 거부된 입력이 그쪽으로 간다", () => {
    expect(buildCallbackRedirectUrl(ORIGIN, "@evil.com", "/student")).toBe(
      "https://quest-on.app/student"
    );
  });
});
