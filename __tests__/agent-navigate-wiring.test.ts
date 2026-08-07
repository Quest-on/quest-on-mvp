/**
 * `AgentRunController` 의 navigate 소비 지점 배선 회귀 테스트 (이슈 #101).
 *
 * 왜 소스 텍스트를 검사하는가: 이 저장소에는 React 컴포넌트 렌더 테스트 인프라가
 * 없다(`@testing-library/*`, `jsdom` 모두 미설치). 인증 경계를 지키려고 리뷰 대응
 * PR 에서 테스트 의존성을 새로 들이는 것은 `docs/DEPENDENCY_POLICY.md` 근거가 필요한
 * 별개 결정이므로, 그 대신 **가드를 우회하는 형태로 되돌아가는 것**을 막는 최소
 * 회귀만 고정한다.
 *
 * 고정하는 계약:
 *   1. 컨트롤러가 `safeAgentRoute` 를 import 한다
 *   2. 모델이 준 `action.route` 가 `router.push` 로 직접 들어가지 않는다
 *   3. navigate 분기에서 가드 결과가 falsy 면 실패 결과를 만들고 이동하지 않는다
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync("components/agent/AgentRunController.tsx", "utf8");

describe("AgentRunController navigate wiring", () => {
  it("가드를 import 한다", () => {
    expect(source).toMatch(
      /import\s*\{\s*safeAgentRoute\s*\}\s*from\s*"@\/lib\/agent\/navigate-guard"/
    );
  });

  it("모델이 준 route 를 router.push 에 직접 넣지 않는다", () => {
    expect(source).not.toMatch(/router\.push\(\s*action\.route\s*\)/);
    expect(source).not.toMatch(/const\s+route\s*=\s*action\.route\s*;/);
  });

  it("navigate 분기가 가드를 통과한 값만 router.push 한다", () => {
    const navigateBlock = source.slice(
      source.indexOf('if (action.type === "navigate")'),
      source.indexOf('if (action.type === "navigate")') + 1200
    );

    expect(navigateBlock).toContain("safeAgentRoute(action.route)");
    // 가드가 거부하면 이동하지 않고 실패 결과를 만든다
    expect(navigateBlock).toMatch(/if\s*\(!route\)/);
    expect(navigateBlock).toMatch(/ok:\s*false/);
    // push 대상은 가드 결과 변수뿐이다
    expect(navigateBlock).toContain("router.push(route)");
  });
});
