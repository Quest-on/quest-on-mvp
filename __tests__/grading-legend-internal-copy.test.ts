/**
 * 채점 화면 범례의 "내부 복사" 출처 문구(#530).
 *
 * 시험 화면 안에서 복사한 텍스트(CopyProtector 마커)는 AI 답변뿐 아니라 문제 본문과
 * 평가 기준 시트에서도 온다. 범례가 "AI 답변" 만 말하면 교수가 문제 본문을 옮겨 적은
 * 구간까지 AI 답변으로 오해한다. 출처를 셋 다 말하는지 지킨다.
 */
import { describe, expect, it } from "vitest";
import ko from "../messages/ko/authoring.json";
import en from "../messages/en/authoring.json";

describe("채점 화면 내부 복사 범례 (#530)", () => {
  it("한국어 범례가 AI 답변, 문제 본문, 평가 기준을 모두 말한다", () => {
    const text = (ko as { finalAnswerCard: { legendInternal: string } }).finalAnswerCard.legendInternal;
    expect(text).toContain("AI 답변");
    expect(text).toContain("문제");
    expect(text).toContain("평가 기준");
  });

  it("영어 범례도 같은 세 출처를 말한다", () => {
    const text = (en as { finalAnswerCard: { legendInternal: string } }).finalAnswerCard.legendInternal;
    expect(text).toMatch(/AI response/i);
    expect(text).toMatch(/question/i);
    expect(text).toMatch(/rubric/i);
  });
});
