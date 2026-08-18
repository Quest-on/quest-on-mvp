import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const PAGE = read("app/(app)/instructor/[examId]/page.tsx");

const buttons = () =>
  [...PAGE.matchAll(/<Button((?:[^>"]|"[^"]*")*?)>/g)].map((m) => m[1]);

/**
 * 온보딩이 착지하는 화면이다. 여기서 다음 행동이 안 보이면 온보딩 전체가
 * 헛돈다 — `#212` 가 말한 "강조 버튼이 전부 같은 강도라 다음 행동을 모른다".
 *
 * 예전에는 엑셀 내보내기·성적 공개·일괄 채점 셋이 동시에 강조됐다. 앞의
 * 둘은 `variant` 체계를 `className="bg-primary ..."` 로 우회하고 있어서
 * 위계를 바꾸려 해도 안 먹혔다.
 */
describe("시험 상세 버튼 위계 (#212)", () => {
  it("항상 강조되는 버튼은 하나뿐이다", () => {
    const always = buttons().filter((a) => !/variant=/.test(a));
    expect(
      always,
      `무조건 강조되는 버튼이 ${always.length}개다: ${always
        .map((a) => a.replace(/\s+/g, " ").slice(0, 40))
        .join(" | ")}`
    ).toHaveLength(1);
  });

  it("강조를 className 으로 우회하지 않는다", () => {
    // className 으로 칠하면 variant 로 위계를 조정할 수 없다.
    const bypass = buttons().filter((a) => /className="[^"]*bg-primary/.test(a));
    expect(bypass, "버튼이 bg-primary 를 직접 칠한다").toHaveLength(0);
  });

  it("버튼에 하드코딩 색이 없다", () => {
    const raw = buttons().filter((a) => /text-white|bg-(blue|green|indigo)-\d/.test(a));
    expect(raw, "버튼에 하드코딩 색이 있다").toHaveLength(0);
  });

  it("채점이 남았으면 성적 공개가 물러선다", () => {
    // 채점 전에 성적 공개를 같은 강도로 들이밀면 순서를 잘못 안내한다.
    expect(PAGE, "성적 공개가 채점 CTA 와 같은 강도로 경쟁한다").toMatch(
      /grades_released \|\| showBulkCaseGradingCta \? "outline" : "default"/
    );
  });

  it("내보내기 두 개가 같은 강도다", () => {
    // 엑셀만 강조되고 CSV 는 outline 이었다. 같은 성격이면 같은 강도여야 한다.
    const downloads = [...PAGE.matchAll(/<Button([\s\S]{0,220}?)handleDownload/g)].map(
      (m) => m[1]
    );
    expect(downloads.length, "내보내기 버튼을 못 찾았다").toBeGreaterThanOrEqual(2);
    for (const b of downloads) {
      expect(b, ).toMatch(
        /variant="outline"/
      );
    }
  });
});
