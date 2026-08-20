import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildIntakeSkip, type IntakeRow } from "@/lib/onboarding-funnel";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * `#82` — intake 를 건너뛴 교수자를 어떻게 할 것인가.
 *
 * 원래 AC-6 은 "발행 직전에 같은 문항을 다시 묻는다" 였다. 걷어냈다.
 * 데모는 intake 시점에 이미 만들어져서 나중에 답을 받아도 못 바꾸고,
 * 발행 직전은 교수자가 자기 시험을 내는 순간이라 온보딩 설문을 끼울 자리가
 * 아니다. 대신 이미 공짜로 쌓이던 `skipped` 를 퍼널에 보이게 했다.
 */
describe("intake 건너뜀 집계", () => {
  it("건너뛴 사용자와 답한 사용자를 나눈다", () => {
    const rows: IntakeRow[] = [
      { user_id: "a", metadata: { skipped: true } },
      { user_id: "b", metadata: { skipped: false } },
      { user_id: "c", metadata: null },
      { user_id: "d", metadata: { skipped: true } },
    ];
    const r = buildIntakeSkip(rows);
    expect(r).toEqual({ answered: 2, skipped: 2, skipRate: 0.5 });
  });

  it("같은 사용자가 여러 번이면 답한 쪽을 채택한다", () => {
    // 건너뛰고 나중에 다시 답했으면 답한 것이다.
    const rows: IntakeRow[] = [
      { user_id: "a", metadata: { skipped: true } },
      { user_id: "a", metadata: { skipped: false } },
    ];
    expect(buildIntakeSkip(rows)).toEqual({ answered: 1, skipped: 0, skipRate: 0 });
  });

  it("표본이 없으면 null 이다", () => {
    // 0 을 돌려주면 화면이 "건너뜀 0%" 라고 거짓말한다.
    expect(buildIntakeSkip([])).toBeNull();
  });

  it("user_id 없는 행을 세지 않는다", () => {
    const rows = [{ user_id: "", metadata: { skipped: true } }] as IntakeRow[];
    expect(buildIntakeSkip(rows)).toBeNull();
  });

  it("발행 직전 재질문을 붙이지 않는다", () => {
    // 이 약속을 되살리면 발행 경로에 온보딩 설문이 끼어든다.
    const src = read("app/api/onboarding/demo/route.ts");
    expect(src, "재질문 약속이 되살아났다").not.toMatch(
      /발행 직전에 같은 질문을 다시 받아야/
    );
  });

  it("skipped 가 죽은 값이 아니다 — 라우트가 읽는다", () => {
    const src = read("app/api/admin/onboarding-funnel/route.ts");
    expect(src, "퍼널 라우트가 intake 를 조회하지 않는다").toMatch(/buildIntakeSkip/);
    expect(src, "metadata 를 안 가져온다").toMatch(/user_id, metadata/);
  });

  it("화면이 건너뜀 비율을 그린다", () => {
    const src = read("app/admin/onboarding/page.tsx");
    expect(src).toMatch(/data\.intakeSkip/);
    expect(src, "문구가 하드코딩됐다").toMatch(/t\("intakeSkipTitle"\)/);
  });
});
