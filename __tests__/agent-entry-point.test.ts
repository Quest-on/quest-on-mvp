import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldRestoreAgentPanelOpen } from "@/components/agent/AgentPanelProvider";

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
   * 모바일(<768px)은 에이전트를 지원하지 않는다 — 결정이다 (이슈 #460).
   *
   * 위 두 검사는 소스의 **줄 순서**만 본다. 그래서 #439 가 FAB 에
   * `hidden md:flex` 를 달아 데스크톱 전용으로 만든 것을 통과시켰고, 그 사이
   * 모바일은 "비출제 화면에서는 내비로 열리는데 출제 화면에서는 못 연다" 는
   * 반쪽 상태였다 — 내비로 열면 에이전트가 출제 화면으로 이동하고, 거기서
   * 패널을 닫으면 다시 열 수 없었다.
   *
   * #460 은 모바일 미지원으로 정했다. 좁은 화면에서는 패널(Sheet)이 편집기를
   * 덮어, 에이전트가 타이핑으로 조작하는 모습을 보며 확인하는 이 기능의 핵심이
   * 성립하지 않는다. 그래서 **모바일에는 진입점이 하나도 없어야 한다.**
   *
   * 모바일 출제를 지원하게 되면 이 테스트가 깨지는 게 맞다. 그때 #500 을 읽고
   * 새 결정에 맞춰 뒤집는다.
   */
  describe("모바일(<768px)에는 진입점이 없다 (#460)", () => {
    const fab = read("components/agent/AgentFab.tsx");
    const nav = read("components/layout/mobile-bottom-nav.tsx");
    // AgentNavButton 함수 본문만 — 내비 컨테이너의 `lg:hidden` 과 섞이지 않게.
    const navAgentButton = nav.match(/function AgentNavButton\(\)[\s\S]*?\n}\n/)?.[0] ?? "";

    it("FAB 은 md 이상에서만 보인다", () => {
      expect(fab, "FAB 의 반응형 클래스가 바뀌었다 — #460·#500 을 읽고 이 describe 를 함께 고친다").toMatch(
        /hidden\s+md:flex/
      );
    });

    it("모바일 내비의 에이전트 버튼도 md 이상에서만 보인다", () => {
      expect(navAgentButton, "AgentNavButton 을 찾지 못했다").not.toBe("");
      expect(
        navAgentButton,
        "모바일 내비에서 에이전트를 열 수 있다 — 열면 출제 화면으로 이동한 뒤 닫으면 다시 못 연다(#460)"
      ).toMatch(/hidden\s+md:flex/);
    });

    it("모바일 내비는 출제 화면에서 렌더되지 않는다", () => {
      // 이게 바뀌면(출제 화면용 축소 내비) #500 의 2번 방향이다 — 위 두 검사와
      // 함께 다시 정한다.
      expect(layout).toMatch(/!isAuthoringRoute[\s\S]{0,200}MobileBottomNav/);
    });

    it("저장된 열림 상태를 모바일에서는 되살리지 않는다", () => {
      // 되살리면 휴대폰에서 Sheet 가 저절로 뜨고, 닫으면 다시 열 방법이 없다.
      expect(shouldRestoreAgentPanelOpen({ stored: "true", viewportWidth: 390 })).toBe(false);
      expect(shouldRestoreAgentPanelOpen({ stored: "true", viewportWidth: 767 })).toBe(false);
      expect(shouldRestoreAgentPanelOpen({ stored: "true", viewportWidth: 768 })).toBe(true);
      expect(shouldRestoreAgentPanelOpen({ stored: "true", viewportWidth: 1440 })).toBe(true);
      expect(shouldRestoreAgentPanelOpen({ stored: "false", viewportWidth: 1440 })).toBe(false);
      expect(shouldRestoreAgentPanelOpen({ stored: null, viewportWidth: 1440 })).toBe(false);
    });
  });

  it("실행기가 서버가 내보내는 액션을 전부 처리한다", () => {
    const executor = read("components/agent/useAgentEditorExecutor.ts");
    // 서버 프롬프트가 지시하는 액션들. 하나라도 빠지면 그 지시는 조용히 버려진다.
    for (const action of ["add_question", "generate_questions", "navigate"]) {
      expect(executor, `실행기가 ${action} 을 처리하지 않는다`).toContain(`case "${action}"`);
    }
  });
});
