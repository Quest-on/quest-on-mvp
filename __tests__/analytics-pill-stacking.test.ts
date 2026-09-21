import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 이슈 #422 와 그 후속.
 *
 * 화면 우하단은 페이지가 소유한다. 방문 통계 pill 은 전역 상시 노출이라
 * 우선순위가 가장 낮은데, 원래 `fixed` + `z-40` 으로 같은 자리를 잡고 있었다.
 * DOM 에서 `{children}` 뒤에 붙으므로(app/layout.tsx) 동률이면 pill 이 이겼고,
 * 그 결과 **페이지의 주요 버튼들을 pill 이 덮었다.**
 *
 * staging 실측(뷰포트 1440×900, 교수자 채점 패널):
 *   드로어 z-40 box=(912, 0, 528, 900)
 *   전송   box=(1375, 847, 32, 32)
 *   pill   z-40 box=(1297, 836, 119, 40)   ← 전송 버튼의 위 29px 을 가림
 *
 * z 만 낮추면 이번엔 pill 이 코너 CTA 밑에 깔려 누를 수 없다. 법적 고지가
 * 이 pill 을 동의 철회 수단으로 지목하고 있으므로(messages/ko/legal.json),
 * 둘 다 눌리게 해야 한다 — 그래서 z 는 낮추고 자리는 CTA 띠 밖으로 뺀다.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** 주어진 조각을 모두 포함하는 단 한 줄. 0줄이거나 2줄 이상이면 실패시킨다. */
function soleLineWith(source: string, ...needles: string[]): string {
  const lines = source.split("\n").filter((l) => needles.every((n) => l.includes(n)));
  if (lines.length !== 1) {
    throw new Error(`expected exactly 1 line for [${needles.join(", ")}], got ${lines.length}`);
  }
  return lines[0];
}

/**
 * className 을 토큰 집합으로 본다. 클래스 순서를 바꾸거나 중간에 하나 끼워 넣어도
 * 깨지지 않게 — 검사하려는 건 배치지 문자열이 아니다.
 */
function classTokens(line: string): string[] {
  // className="…" 일 수도, cn("…", …) 안일 수도 있다. 그 줄에서 가장 긴
  // 큰따옴표 문자열을 클래스 목록으로 본다.
  const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!quoted.length) throw new Error(`no quoted string in: ${line.trim().slice(0, 80)}`);
  const longest = quoted.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.split(/\s+/).filter(Boolean);
}

/** `z-<n>` 중 가장 큰 값. */
function maxZ(tokens: string[]): number {
  const zs = tokens
    .map((t) => /^(?:[a-z]+:)?z-(\d+)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  if (!zs.length) throw new Error(`no z-<n> token in: ${tokens.join(" ").slice(0, 80)}`);
  return Math.max(...zs);
}

/** breakpoint prefix 를 뗀 `bottom-…` 토큰들. */
function bottomTokens(tokens: string[]): string[] {
  return tokens
    .map((t) => t.replace(/^[a-z]+:/, ""))
    .filter((t) => t.startsWith("bottom-"));
}

const analytics = read("components/WebsiteAnalytics.tsx");

// 이 파일에는 우하단 고정 요소가 둘이다. 동의 카드(w-96)가 아니라
// 설정 pill(rounded-full)을 집어야 한다 — 첫 매치를 쓰면 카드가 잡힌다.
const pill = classTokens(soleLineWith(analytics, "fixed right-4", "rounded-full"));
const card = classTokens(soleLineWith(analytics, "fixed right-4", "w-96"));

/** pill 과 같은 모서리를 두고 겨루는 것들. */
const CORNER_RIVALS: Array<{ file: string; needles: string[] }> = [
  { file: "components/instructor/BulkGradingPanel.tsx", needles: ["fixed inset-y-0 right-0"] },
  { file: "components/exam/FloatingChatButton.tsx", needles: ["fixed bottom-6 right-6"] },
  { file: "components/assignment/FinalAnswerButton.tsx", needles: ["fixed bottom-6 right-6"] },
  { file: "components/agent/AgentFab.tsx", needles: ["fixed bottom-6 right-6"] },
];

describe("방문 통계 pill 은 우하단 모서리를 두고 겨루지 않는다 (#422)", () => {
  it("집어 온 줄이 각각 pill·카드가 맞다", () => {
    expect(pill).toContain("h-10");
    expect(card).toContain("w-96");
  });

  it("pill 은 드로어보다 아래 레이어다", () => {
    const drawer = classTokens(
      soleLineWith(read("components/instructor/BulkGradingPanel.tsx"), "fixed inset-y-0 right-0")
    );
    // 동률이면 DOM 순서가 승부를 가르고, 늦게 그려지는 pill 이 이긴다.
    expect(maxZ(pill)).toBeLessThan(maxZ(drawer));
  });

  it("동의 카드는 드로어보다 위에 남는다", () => {
    const drawer = classTokens(
      soleLineWith(read("components/instructor/BulkGradingPanel.tsx"), "fixed inset-y-0 right-0")
    );
    // 카드는 동의를 받는 모달성 표면이라 덮는 게 맞다. 내려가는 건 pill 뿐이다.
    expect(maxZ(card)).toBeGreaterThan(maxZ(drawer));
  });

  it("코너 CTA 들이 여전히 같은 띠(bottom-6)에 있다", () => {
    // 이 전제가 깨지면 아래 오프셋 값도 다시 계산해야 한다.
    for (const rival of CORNER_RIVALS.slice(1)) {
      const tokens = classTokens(soleLineWith(read(rival.file), ...rival.needles));
      expect(bottomTokens(tokens), rival.file).toContain("bottom-6");
    }
  });

  it("pill 은 그 띠 밖으로 올라가 있다", () => {
    // z 를 낮추는 것만으로는 부족하다 — 그러면 pill 이 CTA 밑에 깔려서
    // 법적 고지가 지목한 동의 철회 수단을 누를 수 없게 된다.
    const bottoms = bottomTokens(pill);
    expect(bottoms.length).toBeGreaterThan(0);
    for (const b of bottoms) {
      expect(b, `pill bottom token ${b}`).toMatch(/\+4\.5rem/);
    }
  });
});
