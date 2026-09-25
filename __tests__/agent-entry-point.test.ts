import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 이슈 #436 — 에이전트를 열 수 있는 자리와 동작하는 자리가 어긋나면 안 된다.
 *
 * 2026-05-29 에 `AgentFab` 이 큰 채점 PR 안의 한 줄로 주석 처리됐다("임시 숨김").
 * 사유도 추적 이슈도 없이 4개월이 지났고, 그 사이 기능은 **통째로 도달
 * 불가능**했다. 겉으로는 모바일 하단 내비에 버튼이 남아 있어 반쯤 살아 있는
 * 것처럼 보였지만:
 *
 *   - 실행기(useAgentEditorExecutor)는 `/instructor/new` 에만 등록된다
 *   - 모바일 내비는 `!isAuthoringRoute` 조건이라 그 페이지에서 안 뜬다
 *   - 데스크톱 FAB 은 주석
 *
 * 즉 열 수 있는 곳에서는 안 돌고, 도는 곳에서는 못 열었다.
 *
 * staging 실측으로 확인한 상태(뷰포트 900×1000, `/instructor/new`):
 *   nav[aria-label="하단 네비게이션"]  →  없음
 *   FAB                                →  없음
 *   [aria-label="에이전트 패널 닫기"]   →  있음 (패널만 마운트)
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("교수 에이전트에 진입점이 있다 (#436)", () => {
  const layout = read("app/(app)/instructor/layout.tsx");

  it("FAB 이 주석이 아니라 실제로 렌더된다", () => {
    expect(layout, "AgentFab import 가 없다").toMatch(
      /^import \{ AgentFab \} from "@\/components\/agent\/AgentFab";$/m
    );
    // 주석 안의 <AgentFab /> 는 렌더가 아니다. JSX 로 쓰인 것만 센다.
    const rendered = layout
      .split("\n")
      .filter((l) => l.includes("<AgentFab />") && !l.trimStart().startsWith("{/*") && !l.trimStart().startsWith("*"));
    expect(rendered.length, "AgentFab 이 렌더되지 않는다").toBeGreaterThan(0);
  });

  it("실행기가 등록된 페이지를 FAB 이 덮는다", () => {
    // 실행기가 붙은 곳에서 열 수 없으면 기능이 없는 것과 같다.
    const editor = read("app/(app)/instructor/new/page.tsx");
    expect(editor, "편집기가 실행기를 등록하지 않는다").toMatch(/useAgentEditorExecutor\(/);
    expect(editor).toMatch(/registerExecutor/);

    // FAB 은 authoring route 조건 밖에 있어야 한다 — 안에 들어가면
    // 모바일 내비와 같은 이유로 편집기에서 사라진다.
    const fabLine = layout.split("\n").findIndex((l) => l.includes("<AgentFab />"));
    const authoringGuard = layout.split("\n").findIndex((l) => l.includes("!isAuthoringRoute"));
    expect(fabLine).toBeGreaterThan(-1);
    expect(authoringGuard).toBeGreaterThan(-1);
    // 가드는 MobileBottomNav 만 감싼다. FAB 이 그 블록 안으로 들어가면 안 된다.
    const between = layout.split("\n").slice(authoringGuard, fabLine).join("\n");
    expect(between, "FAB 이 authoring route 가드 안에 들어갔다").toContain("MobileBottomNav");
  });

  /**
   * 반응형 노출까지 본다 (이슈 #460).
   *
   * 위 두 검사는 소스의 **줄 순서**만 본다. 그래서 #439 가 FAB 에
   * `hidden md:flex` 를 달아 데스크톱 전용으로 만든 것을 통과시켰다 —
   * 768px 미만에서는 진입점이 하나도 없는데도.
   *
   * 여기서 고정하는 것은 "지금 이게 맞다" 가 아니라 **두 사실이 짝으로
   * 움직인다**는 것이다. 한쪽만 고치고 끝났다고 생각하는 걸 막는다.
   */
  it("진입점의 반응형 노출과 내비 가드를 짝으로 고정한다", () => {
    const fab = read("components/agent/AgentFab.tsx");

    // 사실 1: FAB 은 md 이상에서만 보인다.
    expect(fab, "FAB 의 반응형 클래스가 바뀌었다 — #460 을 다시 읽고 아래 it.fails 도 함께 고친다").toMatch(
      /hidden\s+md:flex/
    );

    // 사실 2: 모바일 내비는 출제 화면에서 렌더되지 않는다. 그런데 실행기가
    // 붙어 있는 곳이 바로 그 화면이다.
    expect(layout).toMatch(/!isAuthoringRoute[\s\S]{0,200}MobileBottomNav/);
  });

  /**
   * 위 두 사실이 겹치면 모바일에는 진입점이 없다. 그게 #460 이다.
   *
   * `it.fails` 로 둔다 — 지금 실패하는 게 정상이므로 통과하고, 누가 #460 을
   * 고치면 "예상대로 실패하지 않았다" 로 **이 테스트가 깨진다.** 그때 `it` 로
   * 바꾸고 위 사실 1 도 함께 고친다. 결함을 정상으로 고정하지 않으면서
   * 고쳐졌다는 신호를 받는 방법이다.
   */
  it.fails("모바일에도 진입점이 있다 — #460 이 정해지면 it 으로 바꾼다", () => {
    const fab = read("components/agent/AgentFab.tsx");
    const fabHiddenOnMobile = /hidden\s+md:flex/.test(fab);
    const navSkipsAuthoring = /!isAuthoringRoute[\s\S]{0,200}MobileBottomNav/.test(layout);

    expect(
      fabHiddenOnMobile && navSkipsAuthoring,
      "출제 화면(실행기가 붙은 유일한 라우트)에 모바일 진입점이 없다"
    ).toBe(false);
  });

  it("실행기가 서버가 내보내는 액션을 전부 처리한다", () => {
    const executor = read("components/agent/useAgentEditorExecutor.ts");
    // 서버 프롬프트가 지시하는 액션들. 하나라도 빠지면 그 지시는 조용히 버려진다.
    for (const action of ["add_question", "generate_questions", "navigate"]) {
      expect(executor, `실행기가 ${action} 을 처리하지 않는다`).toContain(`case "${action}"`);
    }
  });
});
