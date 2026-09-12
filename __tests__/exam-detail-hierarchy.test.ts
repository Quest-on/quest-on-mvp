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

  it("성적 공개는 공개할 게 있을 때만 강조된다", () => {
    // 채점 전에 성적 공개를 같은 강도로 들이밀면 순서를 잘못 안내한다.
    // 갓 만든 데모는 응시자가 0명이라 공개할 것 자체가 없다.
    const m = /variant=\{[\s\S]{0,600}?grades_released[\s\S]{0,600}?\}/.exec(PAGE);
    expect(m, "성적 공개 버튼의 조건을 찾지 못했다").toBeTruthy();
    expect(m![0], "채점 CTA 와 경쟁한다").toMatch(/showBulkCaseGradingCta/);
    expect(m![0], "응시자가 0명이어도 강조된다").toMatch(/studentCount/);
  });

  it("내보내기 두 개가 같은 자리, 같은 강도다", () => {
    // 엑셀만 강조되고 CSV 는 outline 이었다. 같은 성격이면 같은 강도여야 한다.
    // 지금은 둘 다 더보기 메뉴 항목이라 강도가 구조적으로 같다.
    const items = [...PAGE.matchAll(/<DropdownMenuItem([\s\S]{0,300}?)handleDownload/g)].map(
      (m) => m[1]
    );
    expect(items.length, "내보내기 메뉴 항목을 못 찾았다").toBeGreaterThanOrEqual(2);
  });

  it("내보내기가 헤더 버튼으로 되돌아가지 않는다", () => {
    // 학생이 0명인 화면에도 비활성 Excel/CSV 버튼 둘이 헤더를 차지하고 있었다.
    // 방금 시험을 만든 사람에게 그건 "여기서 뭔가 해야 하나"만 남긴다.
    const asButtons = [...PAGE.matchAll(/<Button([\s\S]{0,220}?)handleDownload/g)];
    expect(asButtons, "내보내기가 다시 헤더 버튼이 됐다").toHaveLength(0);
  });

  it("내보내기는 채점이 끝난 시험에서만 보인다", () => {
    // 채점 전에는 내보낼 결과 자체가 없다. 비활성으로 띄우는 것과 아예 안
    // 띄우는 것은 다르다 — 전자는 매번 "왜 안 눌리지"를 만든다.
    expect(PAGE).toMatch(/phase === "review" \? \(/);
  });
});
