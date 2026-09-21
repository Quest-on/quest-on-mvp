import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCriteriaText } from "@/lib/bulk-grade-thread";

/**
 * 이슈 #426 의 재현.
 *
 * 채점 인터뷰에서 선택지 칩을 **한 번이라도** 누르면 그 Q&A 가 `criteriaText` 에
 * 실려 서버로 갔다. 서버는 `criteriaText` 가 비어 있지 않으면
 * `extractGradingCriteriaFromChat` 을 건너뛰고 조기 반환하므로
 * (app/api/exam/[examId]/bulk-grade/start/route.ts), **나머지 인터뷰 전체와
 * 강사가 확정한 score_range 가 통째로 버려졌다.**
 *
 * staging 실측 — 같은 5라운드 인터뷰를 입력 방식만 바꿔서:
 *
 *   칩 1회 + 타이핑 4회 → criteria_summary 는 1라운드만, score_range 없음
 *   타이핑 5회          → 전 대화 반영, score_range {min:40, max:95}
 *
 * 칩 답변은 `handleOptionPick` 이 이미 `chatMutation` 으로 채팅에 남긴다.
 * `criteriaText` 에 또 싣는 건 중복이고, 그 중복이 경로를 가로챈 것이다.
 * 그래서 `criteriaText` 는 **강사가 직접 타이핑한 재채점 지시만** 담는다.
 */

describe("criteriaText 는 재채점 지시만 담는다 (#426)", () => {
  it("첫 가채점에서는 비어 있다 — 인터뷰는 채팅에서 읽는다", () => {
    expect(buildCriteriaText({ regradeArmed: false, criteriaMode: "custom", draft: "" })).toBe("");
  });

  it("칩을 눌렀든 말든 첫 가채점은 여전히 비어 있다", () => {
    // 칩 답변은 이미 채팅 메시지다. 여기에 또 실으면 서버가 조기 반환한다.
    expect(buildCriteriaText({ regradeArmed: false, criteriaMode: "custom", draft: "" })).toBe("");
  });

  it("재채점에 타이핑한 지시가 있으면 그것만 담는다", () => {
    const text = buildCriteriaText({
      regradeArmed: true,
      criteriaMode: "custom",
      draft: "  대안 비교가 없으면 10점 감점하세요.  ",
    });
    expect(text).toBe("대안 비교가 없으면 10점 감점하세요.");
  });

  it("ai_default 모드에서는 타이핑 지시를 싣지 않는다", () => {
    expect(
      buildCriteriaText({ regradeArmed: true, criteriaMode: "ai_default", draft: "무시돼야 한다" })
    ).toBe("");
  });

  it("8000자에서 자른다", () => {
    const text = buildCriteriaText({
      regradeArmed: true,
      criteriaMode: "custom",
      draft: "가".repeat(9000),
    });
    expect(text.length).toBe(8000);
  });

  it("패널이 칩 Q&A 를 criteriaText 에 덧붙이지 않는다", () => {
    // 이 호출이 되살아나면 #426 이 그대로 재발한다.
    const panel = readFileSync(
      join(process.cwd(), "components/instructor/BulkGradingPanel.tsx"),
      "utf8"
    );
    expect(panel).not.toMatch(/formatPickedQACriteria/);
    expect(panel).toMatch(/buildCriteriaText\(/);
  });
});
