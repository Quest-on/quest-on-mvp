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

  it("나머지 헤더 버튼은 보조 스타일을 유지한다", () => {
    // 주 행동 하나만 강조여야 위계가 선다.
    const outlines = (HEADER.match(/variant="outline"/g) ?? []).length;
    expect(outlines).toBeGreaterThanOrEqual(2);
  });
});
