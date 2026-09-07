import { describe, expect, it } from "vitest";

import { readFileSync } from "fs";

/**
 * `app/robots.ts` 는 프로덕션이 아닌 배포에서 `Disallow: /` 를 반환한다.
 * 그런데 proxy 의 matcher 가 `/robots.txt` 를 잡으면 미인증 요청이 `/sign-in`
 * 으로 리다이렉트된다. 크롤러는 언제나 미인증이므로 색인 금지 지시를 못 본다.
 *
 * 실측(수정 전):
 *   GET https://quest-on-staging-two.vercel.app/robots.txt
 *     -> 307 Location: /sign-in?redirect=%2Frobots.txt
 *   GET https://quest-on.app/robots.txt
 *     -> 307 Location: /sign-in
 */
const proxySource = readFileSync("proxy.ts", "utf8");

/** 소스의 matcher 문자열 리터럴을 런타임 정규식으로 되돌린다. */
const matcherPatterns = proxySource
  .slice(proxySource.indexOf("matcher: ["))
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith('"'))
  .map((line) => JSON.parse(line.replace(/,$/, "")) as string);

const asRegExp = (pattern: string) => new RegExp(`^${pattern}$`);

describe("proxy matcher — 크롤러가 읽는 파일", () => {
  const [pageMatcher, apiMatcher] = matcherPatterns.map(asRegExp);

  it("matcher 두 개를 읽었다", () => {
    expect(matcherPatterns).toHaveLength(2);
  });

  it("/robots.txt 는 인증 게이트를 타지 않는다", () => {
    expect(pageMatcher.test("/robots.txt")).toBe(false);
  });

  it("/sitemap.xml 도 인증 게이트를 타지 않는다", () => {
    // 라우트가 없으면 404 가 정직한 답이다. 로그인 리다이렉트로 위장하지 않는다.
    expect(pageMatcher.test("/sitemap.xml")).toBe(false);
  });

  it("보호 페이지는 그대로 게이트를 탄다", () => {
    for (const pathname of ["/", "/instructor", "/student/exam/abc", "/onboarding"]) {
      expect(pageMatcher.test(pathname)).toBe(true);
    }
  });

  it("확장자가 붙은 API 도 게이트를 탄다", () => {
    // 페이지 matcher 의 확장자 제외가 API 까지 열어 주면 안 된다.
    // 두 번째 matcher 가 `/api/*` 를 확장자와 무관하게 다시 잡는다.
    expect(apiMatcher.test("/api/export/roster.xml")).toBe(true);
    expect(apiMatcher.test("/api/exam/abc/notice.txt")).toBe(true);
  });
});
