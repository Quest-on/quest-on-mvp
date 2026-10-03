import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldHideAgentFab } from "@/components/agent/AgentPanelProvider";

/**
 * 이슈 #495 — 에이전트 FAB 이 CASE AI 가채점 패널의 전송 버튼을 덮었다.
 *
 * staging 실측(1440×900): 전송 버튼 [1375,847,32×32] 위를 FAB [1360,820,56×56] 이
 * 완전히 덮어 elementFromPoint 가 "AI 에이전트 열기" 를 돌려줬다. 인터뷰 답변도,
 * 마지막 "전체 CASE 가채점 시작" 도 같은 버튼이라 마우스로는 가채점을 시작할 수 없었다.
 *
 * FAB 은 에이전트 패널이 열렸을 때만 숨었다. 우측 전체를 덮는 다른 드로어는 몰랐다.
 * z 로 겨루지 않는다 — 드로어를 FAB 위로 올리면 드로어 안에서 여는 팝오버(portal z-50)가
 * 드로어 밑에 깔린다. 드로어가 열려 있는 동안 FAB 이 비켜난다.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("우측 드로어가 열려 있으면 에이전트 FAB 이 비켜난다 (#495)", () => {
  it("에이전트 패널도 드로어도 닫혀 있으면 보인다", () => {
    expect(shouldHideAgentFab({ panelOpen: false, cornerClaimed: false })).toBe(false);
  });

  it("에이전트 패널이 열려 있으면 숨는다 (기존 동작)", () => {
    expect(shouldHideAgentFab({ panelOpen: true, cornerClaimed: false })).toBe(true);
  });

  it("다른 드로어가 우하단을 쓰는 중이면 숨는다", () => {
    expect(shouldHideAgentFab({ panelOpen: false, cornerClaimed: true })).toBe(true);
  });

  it("FAB 은 숨김 판정을 이 함수 하나로 한다", () => {
    const fab = read("components/agent/AgentFab.tsx");
    expect(fab).toMatch(/shouldHideAgentFab\(\{\s*panelOpen:\s*open,\s*cornerClaimed\s*\}\)/);
  });

  it("CASE AI 가채점 패널은 열려 있는 동안 우하단을 점유한다", () => {
    const panel = read("components/instructor/BulkGradingPanel.tsx");
    expect(panel).toMatch(/useClaimAgentCorner\(open\)/);
  });
});
