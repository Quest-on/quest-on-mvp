/**
 * navigate 소비 지점 회귀 테스트 (이슈 #101).
 *
 * 두 층으로 검증한다.
 *
 *  1. **실행 검증** — 컨트롤러의 판정을 `decideNavigate` seam 으로 빼서, 위험한
 *     route 에서 push 가 **0회** 호출되고 실패 결과가 나오는지 실제로 돌린다.
 *  2. **배선 검증** — 컨트롤러 소스가 그 seam 을 쓰는지. 이 저장소에는 React 렌더
 *     테스트 인프라가 없어서(`@testing-library/*`·`jsdom` 미설치) 컴포넌트를 띄우는
 *     대신 `router.push(action.route)` 형태로 되돌아가는 회귀를 막는다.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { decideNavigate } from "../lib/agent/navigate-guard";

const source = readFileSync("components/agent/AgentRunController.tsx", "utf8");

/** 컨트롤러의 navigate 처리와 같은 순서로 seam 을 소비하는 테스트 하네스. */
function runNavigate(route: unknown, currentPathname: string | null) {
  const push = vi.fn();
  const decision = decideNavigate(route, currentPathname);

  if (!decision.ok) {
    return { push, result: { ok: false as const } };
  }
  if (decision.navigate) {
    push(decision.route);
  }
  return { push, result: { ok: true as const } };
}

describe("navigate 실행 판정 (decideNavigate)", () => {
  it("위험한 route 는 push 를 한 번도 호출하지 않고 실패 결과를 낸다", () => {
    for (const hostile of [
      "javascript:alert(document.cookie)",
      "https://evil.com",
      "//evil.com",
      "/instructor/../admin",
      "/admin/users",
    ]) {
      const { push, result } = runNavigate(hostile, "/instructor");
      expect(push, `${hostile} 에서 push 가 호출됐다`).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    }
  });

  it("정상 route 는 정규화된 값으로 정확히 한 번 push 한다", () => {
    const { push, result } = runNavigate("/instructor/./new", "/instructor");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/instructor/new");
    expect(result.ok).toBe(true);
  });

  it("이미 그 경로면 push 하지 않지만 성공으로 본다", () => {
    const { push, result } = runNavigate("/instructor/new", "/instructor/new");
    expect(push).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("현재 경로를 모르면(서버 측) 그냥 이동한다", () => {
    const { push } = runNavigate("/instructor", null);
    expect(push).toHaveBeenCalledWith("/instructor");
  });
});

describe("AgentRunController navigate wiring", () => {
  it("판정 seam 을 import 한다", () => {
    expect(source).toMatch(
      /import\s*\{\s*decideNavigate\s*\}\s*from\s*"@\/lib\/agent\/navigate-guard"/
    );
  });

  it("모델이 준 route 를 router.push 에 직접 넣지 않는다", () => {
    expect(source).not.toMatch(/router\.push\(\s*action\.route\s*\)/);
    expect(source).not.toMatch(/const\s+route\s*=\s*action\.route\s*;/);
  });

  it("navigate 분기가 seam 판정 결과만 router.push 한다", () => {
    const start = source.indexOf('if (action.type === "navigate")');
    const navigateBlock = source.slice(start, start + 1400);

    expect(navigateBlock).toContain("decideNavigate(");
    // 거부되면 이동하지 않고 실패 결과를 만든다
    expect(navigateBlock).toMatch(/if\s*\(!decision\.ok\)/);
    expect(navigateBlock).toMatch(/ok:\s*false/);
    // push 대상은 판정 결과뿐이다
    expect(navigateBlock).toContain("router.push(decision.route)");
  });
});
