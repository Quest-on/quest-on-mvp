import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 이슈 #422 의 재현.
 *
 * 방문 통계 설정 pill 과 CASE AI 가채점 드로어가 둘 다 `position: fixed` 로
 * 화면 오른쪽 끝을 잡는다. z-index 가 같으면 DOM 순서가 늦은 pill 이 이겨서
 * 드로어의 전송 버튼을 덮는다. staging 실측(뷰포트 1440×900):
 *
 *   드로어 z-40 box=(912, 0, 528, 900)
 *   전송   box=(1375, 847, 32, 32)
 *   pill   z-40 box=(1297, 836, 119, 40)   ← 전송 버튼의 위 29px 을 가림
 *
 * 둘 다 오른쪽 끝 고정이라 뷰포트 크기를 바꿔도 풀리지 않는다.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** `z-<n>` 유틸리티 중 가장 큰 값. */
function maxZ(source: string): number {
  const found = [...source.matchAll(/(?:^|[\s"'`])z-(\d+)(?=[\s"'`]|$)/g)].map((m) =>
    Number(m[1])
  );
  if (!found.length) throw new Error(`no z-<n> utility in: ${source.trim().slice(0, 80)}`);
  return Math.max(...found);
}

/** 주어진 조각을 모두 포함하는 단 한 줄. 0줄이거나 2줄 이상이면 실패시킨다. */
function soleLineWith(source: string, ...needles: string[]): string {
  const lines = source.split("\n").filter((l) => needles.every((n) => l.includes(n)));
  if (lines.length !== 1) {
    throw new Error(`expected exactly 1 line for [${needles.join(", ")}], got ${lines.length}`);
  }
  return lines[0];
}

describe("방문 통계 pill 은 우측 드로어를 덮지 않는다 (#422)", () => {
  const analytics = read("components/WebsiteAnalytics.tsx");
  const panel = read("components/instructor/BulkGradingPanel.tsx");

  // 이 파일에는 우하단 고정 요소가 둘이다. 동의 카드(w-96)가 아니라
  // 설정 pill(rounded-full)을 집어야 한다 — 첫 매치를 쓰면 카드가 잡힌다.
  const pillLine = soleLineWith(analytics, "fixed right-4", "rounded-full");
  const cardLine = soleLineWith(analytics, "fixed right-4", "w-96");
  const drawerLine = soleLineWith(panel, "fixed inset-y-0 right-0");

  it("집어 온 줄이 각각 pill·카드·드로어가 맞다", () => {
    expect(pillLine).toContain("h-10");
    expect(cardLine).toContain("overflow-y-auto");
    expect(drawerLine).toContain("w-[528px]");
  });

  it("pill 의 z-index 가 드로어보다 낮다", () => {
    // 같으면 DOM 순서가 승부를 가르고, 늦게 그려지는 pill 이 이긴다.
    expect(maxZ(pillLine)).toBeLessThan(maxZ(drawerLine));
  });

  it("동의 카드는 드로어보다 위에 남는다", () => {
    // 카드는 동의를 받는 모달성 표면이라 덮는 게 맞다. 내려가는 건 pill 뿐이다.
    expect(maxZ(cardLine)).toBeGreaterThan(maxZ(drawerLine));
  });
});
