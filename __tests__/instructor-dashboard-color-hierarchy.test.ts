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

describe("의미 있는 상태색은 토큰으로 표현된다", () => {
  it("발행·대기 배지가 success/warning 토큰을 쓴다", () => {
    // 이 테스트는 원래 'emerald·yellow 원색이 유지되는지' 를 봤다. 당시엔
    // success/warning 토큰이 없어서 원색이 유일한 표현 수단이었고, 주석에도
    // '#203 에서 시맨틱 토큰으로 옮길 대상' 이라고 적어뒀다.
    //
    // #233 이 토큰을 만들었고 이제 옮겼다. 의미가 사라진 게 아니라 표현이
    // 바뀐 것이므로, 원색 대신 토큰 사용을 확인한다.
    expect(SOURCE).toMatch(/-(success|warning)-(surface|subtle|border|solid|text)/);
  });

  it("상태색 원색이 남아 있지 않다", () => {
    // 토큰으로 옮긴 뒤 원색이 다시 들어오면 다크모드 대비를 각 사용처가
    // 따로 책임지게 되고, 같은 의미가 두 방식으로 갈린다.
    const raw =
      withoutFolderPalette.match(
        /(bg|text|border|ring)-(emerald|green|amber|yellow|blue|sky|indigo)-(50|[1-9]00|950)/g
      ) ?? [];
    expect(raw).toEqual([]);
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
