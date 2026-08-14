import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 강사 대시보드 색·위계 (#212)
 *
 * 첫 사용자가 "버튼 색이 너무 튀고 많아서 뭘 눌러야 할지 모르겠다"고 했다.
 * 실제로 한 화면에 emerald·yellow·violet·pink·blue 5계열 16개 클래스가 있었고,
 * 그중 violet·pink·blue 는 **아무 의미 없는 장식**이었다.
 *
 * 저장소 UI/UX 규칙은 색에 의미를 고정한다 — 녹=성공, 적=오류, 황=경고, 청=정보.
 * 장식으로 쓰면 "색 > 크기 > 모양 순으로 위계를 만든다"가 성립할 수 없다.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), "components", "instructor", "InstructorHomeClient.tsx"),
  "utf8"
);

/** 사용자가 직접 고르는 폴더 색 팔레트는 대상이 아니다. */
const withoutFolderPalette = SOURCE.split("\n")
  .filter((line) => !/labelKey: "drive\.color/.test(line))
  .join("\n");

describe("장식용 원색을 쓰지 않는다", () => {
  it("violet·pink·blue 원색 클래스가 없다", () => {
    // 이 셋은 의미가 없었다. 정보성 배지는 secondary 토큰, 아이콘은 muted 로 간다.
    const decorative =
      withoutFolderPalette.match(
        /(bg|text|border|ring)-(violet|pink|blue|purple|indigo)-[0-9]{2,3}/g
      ) ?? [];
    expect(decorative).toEqual([]);
  });

  it("브랜드색을 버튼에 직접 박지 않는다", () => {
    // bg-pink-700 을 버튼에 박으면 variant 위계가 무의미해지고 다크모드 대비도 잃는다.
    expect(withoutFolderPalette).not.toMatch(/<Button[\s\S]{0,200}?bg-[a-z]+-[0-9]{2,3}/);
  });
});

describe("의미 있는 상태색은 남긴다", () => {
  it("발행·대기 배지의 emerald·yellow 는 유지된다", () => {
    // 규칙상 녹=성공, 황=경고. 이건 의미가 있으므로 지우면 안 된다.
    // (#203 에서 시맨틱 토큰으로 옮길 대상이지 이 이슈의 대상이 아니다)
    expect(SOURCE).toMatch(/emerald/);
    expect(SOURCE).toMatch(/yellow/);
  });
});

describe("버튼 위계", () => {
  it("강조 버튼이 대다수를 차지하지 않는다", () => {
    const total = (SOURCE.match(/<Button/g) ?? []).length;
    const variants = (SOURCE.match(/variant="[a-z]+"/g) ?? []).length;
    const emphasized = total - variants;

    // 전부 기본(강조)이면 "가장 중요한 하나"가 사라진다.
    expect(total).toBeGreaterThan(0);
    expect(emphasized).toBeLessThan(total / 2);
  });
});
