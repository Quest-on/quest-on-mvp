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
