import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 온보딩 착지 (#212)
 *
 * 사용자가 "바로 탕 하고 대시보드로 가는데 뭘 해야 할지 모르겠다"고 했다.
 * 재보니 둘이었다.
 *
 *   1. 데모 생성 후 window.location.href 로 **전체 페이지를 다시 띄웠다**.
 *      흰 화면을 거쳐 방금 만든 데모와 도착 화면의 연결이 끊긴다.
 *   2. 착지 화면의 주 행동(학생으로 체험하기)이 size="sm" 이라 헤더 버튼
 *      무리에 묻혔다.
 */

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const ONBOARDING = strip(
  readFileSync(path.join(process.cwd(), "app", "(app)", "onboarding", "page.tsx"), "utf8")
);

const HEADER = strip(
  readFileSync(
    path.join(process.cwd(), "components", "instructor", "ExamDetailHeader.tsx"),
    "utf8"
  )
);

describe("데모 착지는 전체 리로드를 하지 않는다", () => {
  it("라우터로 이동한다", () => {
    expect(ONBOARDING).toMatch(/router\.push\(examId \?/);
  });

  it("데모 착지 경로에 window.location.href 가 없다", () => {
    // 역할 확정 후 세션을 새로 읽어야 하는 경로는 예외라 전부 금지하지는 않는다.
    // 데모 착지만 검사한다.
    expect(ONBOARDING).not.toMatch(
      /window\.location\.href = examId \?/
    );
  });
});

describe("데모 착지 화면의 주 행동이 눈에 띈다", () => {
  it("학생으로 체험하기 버튼이 작게 렌더되지 않는다", () => {
    // size="sm" 이면 헤더의 보조 버튼들과 같은 크기라 다음 할 일로 안 읽힌다.
    const demoBlock = HEADER.slice(
      HEADER.indexOf("isDemo && demoPreviewLabel"),
      HEADER.indexOf("isDemo && demoPreviewLabel") + 1800
    );
    // #174 로 재응시가 확인 다이얼로그를 거치면서 한 줄 삼항이 분기로 갈렸다.
    // 고정할 것은 구현 형태가 아니라 "기본 크기 버튼으로 렌더된다" 는 계약이다.
    expect(demoBlock).toMatch(/<AlertDialogTrigger asChild>\s*<Button>\{demoRestartLabel\}/);
    expect(demoBlock).toMatch(/<Button>\{demoPreviewLabel\}/);
    expect(demoBlock).not.toMatch(/<Button size="sm">\{demoRestartLabel/);
  });

  it("헤더에서 강조되는 버튼은 데모 주 행동 분기뿐이다", () => {
    // 주 행동 하나만 강조여야 위계가 선다. 예전에는 편집·대시보드·Excel·CSV 가
    // 전부 헤더에 늘어서서, 강조가 아니어도 자리로 경쟁했다. 지금은 부차 행동이
    // 더보기 메뉴로 내려갔으므로 헤더에 남은 강조 버튼은 데모 CTA 뿐이어야 한다.
    const emphasized = [...HEADER.matchAll(/<Button((?:[^>"]|"[^"]*")*?)>([\s\S]{0,40})/g)]
      .filter((m) => !/variant=/.test(m[1]))
      .map((m) => m[2].trim().slice(0, 30));

    expect(emphasized.length, "헤더에 강조 버튼이 하나도 없다").toBeGreaterThan(0);
    // #174 로 재응시가 확인 다이얼로그를 거치면서 분기가 둘로 갈렸다. 둘은
    // 상호배타라 화면에는 언제나 하나만 뜬다.
    const stray = emphasized.filter(
      (label) => !/demoRestartLabel|demoPreviewLabel/.test(label)
    );
    expect(stray, `데모 CTA 가 아닌 강조 버튼이 있다: ${stray.join(" | ")}`).toHaveLength(0);
  });

  it("부차 행동이 헤더에서 더보기 메뉴로 내려가 있다", () => {
    for (const key of ["buttonEdit", "buttonDashboardLong"]) {
      expect(
        HEADER,
        `${key} 가 더보기 메뉴 항목이 아니다`
      ).toMatch(new RegExp(`<DropdownMenuItem asChild>[\\s\\S]{0,200}?${key}`));
    }
  });
});
