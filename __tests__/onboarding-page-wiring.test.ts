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
  it("역할 해석에 metadata 와 쿠키를 넘긴다 — localStorage 는 제거됐다 (#87)", () => {
    const call = source.slice(
      source.indexOf("resolveSignupRole({"),
      source.indexOf("resolveSignupRole({") + 600
    );

    expect(call).toContain("metadataRole");
    expect(call).toContain("document.cookie");
    expect(call).not.toContain("localStorageRole");
    expect(source).not.toContain('localStorage.getItem("selectedRole")');
  });

  it("인가 필드를 프로필 PATCH 에 싣지 않는다 (AC-20)", () => {
    const patch = source.slice(
      source.indexOf('fetch("/api/user/profile"'),
      source.indexOf('fetch("/api/user/profile"') + 400
    );

    expect(patch).toContain("display_name");
    // role·status 를 다시 실으면 서버가 400 으로 거부해 온보딩이 통째로 막힌다.
    expect(patch).not.toMatch(/\brole,/);
    expect(patch).not.toContain("status:");
  });

  it("역할이 없을 때만 역할 클레임 라우트를 부른다 (AC-21)", () => {
    expect(source).toContain('fetch("/api/user/role"');
    expect(source).toMatch(/if \(!profile\?\.role\) \{/);
  });

  it("프로필 단계에서 역할별 기존 프로필을 조회한다", () => {
    expect(source).toContain('"/api/student/profile"');
    // 이제 강사도 기존 프로필을 프리필받는다.
    //
    // 예전에는 학생만 조회해서, 소급 동의 게이트가 켜지면 기존 강사가
    // 빈 이름·학교 폼을 받고 그대로 제출해 기존 데이터를 덮어썼다.
    // 그래서 조회 자체는 두 역할 모두 하고 대상 경로만 갈라진다.
    expect(source).toContain('"/api/instructor/profile"');
    expect(source).toMatch(/role === "student"\s*\?\s*"\/api\/student\/profile"/);
    // 프로필 단계가 아니면 어느 쪽도 부르지 않는다.
    expect(source).toMatch(/step !== "profile"/);
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
