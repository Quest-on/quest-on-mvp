/**
 * 채점 화면 범례의 "내부 복사" 출처 문구(#530).
 *
 * 시험 화면 안의 복사 표식은 AI 대화, 문제 본문, 평가 기준 시트(CopyProtector)와 학생
 * 본인 답안(답안 칸 copy 핸들러)에 붙는다. 범례가 출처 하나(예: "AI 답변")만 말하면 교수가
 * 학생 자신의 글이나 문제 본문을 AI 답변으로 오해한다. 출처를 나열하지 않고 "시험 화면 안"
 * 이라는 범위로 말해, 표식 위치가 늘어도 문구가 틀리지 않게 한다.
 */
import { describe, expect, it } from "vitest";
import ko from "../messages/ko/authoring.json";
import en from "../messages/en/authoring.json";

type Messages = { finalAnswerCard: { legendInternal: string } };

describe("채점 화면 내부 복사 범례 (#530)", () => {
  it("한국어 범례가 시험 화면 안의 복사라고 말하고 특정 출처 하나로 좁히지 않는다", () => {
    const text = (ko as Messages).finalAnswerCard.legendInternal;
    expect(text).toContain("시험 화면");
    expect(text).not.toMatch(/\(AI 답변\)/);
  });

  it("영어 범례도 같은 범위로 말한다", () => {
    const text = (en as Messages).finalAnswerCard.legendInternal;
    expect(text).toMatch(/exam screen/i);
    expect(text).not.toMatch(/\(AI response\)/i);
  });
});
