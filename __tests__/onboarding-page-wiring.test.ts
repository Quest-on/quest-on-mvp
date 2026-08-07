/**
 * `/onboarding` 페이지의 소비 지점 배선 회귀 (PR #89 리뷰 P2 2건).
 *
 * 리뷰가 지적한 두 회귀는 헬퍼가 아니라 **페이지가 무엇을 넘기고 무엇을 부르는가**
 * 였다.
 *   - OAuth 역할: 페이지가 `localStorage.selectedRole` 을 `resolveSignupRole` 에
 *     넘기지 않으면, 헬퍼에 폴백이 있어도 OAuth 가입자는 역할을 다시 묻게 된다.
 *   - 기존 프로필 프리필: 페이지가 `/api/student/profile` 을 부르지 않으면 빈 폼이 뜬다.
 *
 * 이 저장소에는 React 렌더 테스트 인프라가 없다(`@testing-library/*`·`jsdom` 미설치).
 * 그래서 렌더 결과가 아니라 배선이 사라지는 회귀를 소스 수준에서 막는다.
 * 한계: "실제로 폼이 채워진다"는 증명하지 않는다. 그건 브라우저 E2E 의 몫이다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync("app/(app)/onboarding/page.tsx", "utf8");

describe("온보딩 페이지 배선", () => {
  it("역할 해석에 localStorage.selectedRole 을 넘긴다 (#87 전 OAuth 경로)", () => {
    const call = source.slice(
      source.indexOf("resolveSignupRole({"),
      source.indexOf("resolveSignupRole({") + 600
    );

    expect(call).toContain("metadataRole");
    expect(call).toContain("cookieString");
    expect(call).toContain("localStorageRole");
    expect(call).toContain('localStorage.getItem("selectedRole")');
  });

  it("프로필 단계에서 기존 학생 프로필을 조회한다", () => {
    expect(source).toContain('"/api/student/profile"');
    // 학생 프로필 단계에서만 부른다 (강사 프로필 GET 은 없다)
    expect(source).toMatch(/step !== "profile" \|\| role !== "student"/);
  });

  it("프리필이 사용자 입력을 덮어쓰지 않는다", () => {
    for (const setter of ["setName", "setSchool", "setStudentNumber"]) {
      expect(source).toMatch(new RegExp(`${setter}\\(\\(prev\\) => prev \\|\\|`));
    }
  });

  it("리다이렉트 목적지를 safeInternalPath 로 좁힌 뒤에만 이동한다", () => {
    expect(source).toContain("safeInternalPath(redirectUrl)");
    expect(source).not.toMatch(/redirectUrl\.startsWith\("\/"\)/);
    expect(source).toContain("window.location.href = redirectTarget");
  });
});
