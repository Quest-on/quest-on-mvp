import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import koAuthoring from "@/messages/ko/authoring.json";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";

/**
 * 채점 화면 문항 탭의 점수 배지 (#577)
 *
 * 서술형 시험에서 학생이 제출하면 배경 채점이 문항마다 `grade_type: "ai_summary"`, `score: 0` 인
 * 평가 요약 행을 남긴다. 탭이 그 행을 점수로 그려서, 교수가 채점하기 전인데 모든 탭에 "0점"이 떴다.
 * 점수 행(manual·auto)만 배지를 그리고, 교수가 실제로 준 0점은 그대로 보인다.
 */

const questions = [0, 1, 2].map((i) => ({ id: `q${i}`, idx: i, type: "essay", prompt: `문제 ${i + 1}` }));

type GradeInput = { score: number; grade_type?: string | null };

function render(grades: Record<number, GradeInput>, hideScores = false): string {
  const rows = Object.fromEntries(
    Object.entries(grades).map(([k, g]) => [k, { id: `g${k}`, q_idx: Number(k), comment: "", ...g }])
  );
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "ko", messages: { authoring: koAuthoring }, timeZone: "Asia/Seoul" },
      createElement(QuestionNavigation, {
        questions,
        selectedQuestionIdx: 0,
        onSelectQuestion: () => {},
        grades: rows,
        hideScores,
      })
    )
  );
}

const scoreBadges = (html: string) => html.match(/\d+점/g) ?? [];

describe("문항 탭 점수 배지 (#577)", () => {
  it("평가 요약 행(ai_summary)만 있으면 점수 배지가 없다", () => {
    const html = render({
      0: { score: 0, grade_type: "ai_summary" },
      1: { score: 0, grade_type: "ai_summary" },
      2: { score: 0, grade_type: "ai_summary" },
    });
    expect(html).toContain("CASE 1");
    expect(scoreBadges(html)).toEqual([]);
  });

  it("채점 실패 행(ai_failed)도 점수로 그리지 않는다", () => {
    expect(scoreBadges(render({ 0: { score: 0, grade_type: "ai_failed" } }))).toEqual([]);
  });

  it("교수가 저장한 점수와 자동 채점 점수는 그대로 보인다", () => {
    const html = render({
      0: { score: 85, grade_type: "manual" },
      1: { score: 0, grade_type: "ai_summary" },
      2: { score: 10, grade_type: "auto" },
    });
    expect(scoreBadges(html)).toEqual(["85점", "10점"]);
  });

  it("교수가 실제로 준 0점은 보인다", () => {
    expect(scoreBadges(render({ 0: { score: 0, grade_type: "manual" } }))).toEqual(["0점"]);
  });

  it("grade_type 이 없는 옛 행도 점수가 있으면 보인다", () => {
    expect(scoreBadges(render({ 0: { score: 70 } }))).toEqual(["70점"]);
  });

  it("hideScores 면 점수 배지를 숨긴다", () => {
    expect(scoreBadges(render({ 0: { score: 85, grade_type: "manual" } }, true))).toEqual([]);
  });
});
