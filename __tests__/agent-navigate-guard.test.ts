/**
 * 에이전트 navigate 라우트 가드 회귀 테스트 (이슈 #101).
 *
 * `route` 는 모델이 만든 문자열이고, 에이전트 프롬프트에는 교수자가 넣은 자료가
 * 섞인다. 프롬프트 인젝션으로 나온 값이 `router.push` 에 그대로 들어가면
 * `javascript:` 실행이나 외부 이동으로 이어진다 — 그것도 학생 답안에 접근 가능한
 * 교수자 세션 상태로.
 */
import { describe, it, expect } from "vitest";
import { safeAgentRoute } from "../lib/agent/navigate-guard";

describe("safeAgentRoute", () => {
  it("에이전트가 실제로 쓰는 경로는 통과시킨다", () => {
    expect(safeAgentRoute("/instructor")).toBe("/instructor");
    expect(safeAgentRoute("/instructor/new")).toBe("/instructor/new");
    expect(safeAgentRoute("/instructor/abc123")).toBe("/instructor/abc123");
    expect(safeAgentRoute("/instructor/new?step=2")).toBe("/instructor/new?step=2");
  });

  it("javascript: 스킴을 거부한다 — router.push 로 실행될 수 있다", () => {
    expect(safeAgentRoute("javascript:alert(document.cookie)")).toBeNull();
    expect(safeAgentRoute("JavaScript:alert(1)")).toBeNull();
    expect(safeAgentRoute("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("외부 이동을 거부한다 — 인증된 교수자 세션이 그대로 넘어간다", () => {
    expect(safeAgentRoute("https://evil.com")).toBeNull();
    expect(safeAgentRoute("//evil.com")).toBeNull();
    expect(safeAgentRoute("/\\evil.com")).toBeNull();
    expect(safeAgentRoute("  //evil.com")).toBeNull();
  });

  it("allowlist 밖의 내부 경로도 거부한다 — 에이전트 권한을 화면 단위로 좁힌다", () => {
    expect(safeAgentRoute("/admin")).toBeNull();
    expect(safeAgentRoute("/admin/users")).toBeNull();
    expect(safeAgentRoute("/student")).toBeNull();
    expect(safeAgentRoute("/api/admin/users")).toBeNull();
  });

  it("접두사만 같은 경로에 속지 않는다", () => {
    expect(safeAgentRoute("/instructors-fake")).toBeNull();
    expect(safeAgentRoute("/instructor-evil/page")).toBeNull();
  });

  // 문자열 접두사만 보면 뚫린다: /instructor/../admin 은 실제로 /admin 으로 간다.
  it("경로 정규화 후 allowlist 를 벗어나는 입력을 거부한다", () => {
    expect(safeAgentRoute("/instructor/../admin")).toBeNull();
    expect(safeAgentRoute("/instructor/../../admin/users")).toBeNull();
    expect(safeAgentRoute("/instructor/new/../../student")).toBeNull();
  });

  it("정규화가 allowlist 안에 머무르면 정규화된 형태로 통과시킨다", () => {
    expect(safeAgentRoute("/instructor/./new")).toBe("/instructor/new");
    expect(safeAgentRoute("/instructor/new/../abc123")).toBe("/instructor/abc123");
    // 검증한 값과 실제 이동 값이 같아야 한다
    expect(safeAgentRoute("/instructor?tab=1#top")).toBe("/instructor?tab=1#top");
  });

  it("퍼센트 인코딩된 구분자는 경로 세그먼트로 남아 allowlist 를 벗어나지 않는다", () => {
    // %2F 는 파서가 경로 구분자로 풀지 않는다 — /instructor 하위에 머문다.
    const encoded = safeAgentRoute("/instructor/..%2Fadmin");
    expect(encoded).not.toBeNull();
    expect(
      new URL(encoded!, "https://quest-on.app").pathname.startsWith("/instructor/")
    ).toBe(true);
  });

  it("문자열이 아니거나 비어 있으면 거부한다", () => {
    expect(safeAgentRoute(undefined)).toBeNull();
    expect(safeAgentRoute(null)).toBeNull();
    expect(safeAgentRoute(123)).toBeNull();
    expect(safeAgentRoute({ toString: () => "/instructor" })).toBeNull();
    expect(safeAgentRoute("")).toBeNull();
  });

  it("통과시킨 경로는 항상 같은 출처로 해석된다 (교차 검증)", () => {
    for (const route of ["/instructor", "/instructor/new?step=2"]) {
      const resolved = new URL(safeAgentRoute(route)!, "https://quest-on.app");
      expect(resolved.origin).toBe("https://quest-on.app");
      expect(resolved.pathname.startsWith("/instructor")).toBe(true);
    }
  });
});
