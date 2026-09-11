import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeInternalPath } from "@/lib/safe-redirect";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * `#174` 6번 — 학생이 시험 링크를 열었다가 로그인으로 튕기면, 로그인 뒤
 * 원래 가려던 곳이 아니라 기본 화면으로 갔다. 링크가 통째로 유실된다.
 */
describe("로그인 딥링크 보존 (#174-6)", () => {
  it("로그인으로 보낼 때 원래 경로를 싣는다", () => {
    const proxy = read("proxy.ts");
    expect(proxy, "목적지 없이 /sign-in 으로만 보낸다").toMatch(
      /searchParams\.set\("redirect"/
    );
    // 쿼리까지 보존해야 상태가 담긴 딥링크가 살아난다.
    expect(proxy).toMatch(/nextUrl\.search/);
  });

  it("돌아올 때 검증한 경로로만 보낸다", () => {
    const signIn = read("components/auth/CustomSignIn.tsx");
    expect(signIn, "safeInternalPath 를 안 거친다").toMatch(/safeInternalPath\(/);
    expect(signIn, "검증 실패 시 기본값으로 안 떨어진다").toMatch(
      /router\.push\(redirect \?\? "\/"\)/
    );
  });

  describe("safeInternalPath 가 실제로 막는다", () => {
    // 이 검증기가 무르면 로그인 직후 외부 사이트로 튕긴다.
    it.each([["//evil.com"], ["https://evil.com"], ["/\\evil.com"]])(
      "%s 를 거부한다",
      (input) => {
        expect(safeInternalPath(input)).toBeNull();
      }
    );

    it("내부 경로는 통과시킨다", () => {
      expect(safeInternalPath("/exam/ABC123")).toBe("/exam/ABC123");
    });
  });
});

/**
 * `#174` 5번 — 과제 한도 오류가 서버 영문 원문 그대로 화면에 떴다.
 */
describe("과제 오류 문구 (#174-5)", () => {
  const HOOK = read("hooks/useAssignmentSession.ts");
  const CODE = HOOK.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("서버 message 를 그대로 화면에 넘기지 않는다", () => {
    expect(CODE, "errData.message 를 그대로 쓴다").not.toMatch(/errData\.message/);
  });

  it("하드코딩 한국어가 남아 있지 않다", () => {
    const ko = CODE.match(/"[^"]*[가-힣][^"]*"/g) || [];
    expect(ko, `하드코딩 문자열 ${ko.length}건: ${ko.slice(0, 3).join(", ")}`).toHaveLength(0);
  });

  it("한도 코드별로 문구를 고른다", () => {
    expect(CODE).toMatch(/PUBLISH_LIMIT_REACHED/);
    expect(CODE).toMatch(/STUDENT_LIMIT_REACHED/);
  });

  it("모르는 코드는 기본 문구로 떨어진다", () => {
    expect(CODE).toMatch(/\|\|\s*t\("sessionInitError"\)/);
  });

  it.each(["ko", "en"])("%s 에 문구가 있다", (locale) => {
    const msg = JSON.parse(read(`messages/${locale}/assignment.json`));
    for (const key of [
      "entryWindowNotOpen",
      "examNotAvailable",
      "examNotFound",
      "publishLimitReached",
      "studentLimitReached",
      "sessionInitError",
    ]) {
      expect(msg.page?.[key], `${locale}/assignment.json 의 page.${key}`).toBeTruthy();
    }
  });
});
