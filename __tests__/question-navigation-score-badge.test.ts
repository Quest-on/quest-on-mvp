import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import koAuthoring from "@/messages/ko/authoring.json";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { formatSummaryScoreLabel } from "@/lib/grading-helpers";

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
    createElement(NextIntlClientProvider, {
      locale: "ko",
      messages: { authoring: koAuthoring },
      timeZone: "Asia/Seoul",
      children: createElement(QuestionNavigation, {
        questions,
        selectedQuestionIdx: 0,
        onSelectQuestion: () => {},
        grades: rows,
        hideScores,
      }),
    })
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

describe("문항 평가 요약 프롬프트의 점수 줄 (#577)", () => {
  // 시험 문항 요약 프롬프트가 평가 요약 자리 표시 행(또는 행 없음)의 0 을 "점수: 0점"으로 받으면, 교수가
  // 채점하기 전인데 AI 평가가 0점을 전제로 쓰일 수 있었다. 세션 종합 요약처럼 "미채점"으로 넘긴다.
  const grading = readFileSync(path.resolve(__dirname, "..", "lib/grading.ts"), "utf8").replace(/\r\n/g, "\n");

  it("미채점 서술형은 '미채점', 교수가 준 점수는 그 점수로 적는다", () => {
    expect(formatSummaryScoreLabel({ score: 0, ungraded: true, hasSubmission: true, questionType: "essay" })).toBe("미채점");
    expect(formatSummaryScoreLabel({ score: 85, ungraded: false, hasSubmission: true, questionType: "essay" })).toBe("85점");
    expect(formatSummaryScoreLabel({ score: 0, ungraded: false, hasSubmission: true, questionType: "essay" })).toBe("0점");
  });

  it("문항 요약은 점수 행이 아니면 ungraded 로 표시하고, 시험 프롬프트의 점수 줄이 그 판정을 쓴다", () => {
    expect(grading).toMatch(/ungraded: !isScoringGrade\(typedGrade\),/);
    expect(grading).toMatch(/점수: \$\{formatSummaryScoreLabel\(\{\n  score: grade\.score,\n  ungraded: grade\.ungraded,/);
    expect(grading).not.toMatch(/\n점수: \$\{grade\.score\}점\n/);
  });
});

describe("채점 입력 점수 칸 초기값 (#577)", () => {
  // 평가 요약 행의 score 0 을 초기값으로 넘기면 점수 칸에 "0"이 미리 채워져, 교수가 코멘트만 쓰고 저장해도
  // 0점이 확정될 수 있었다. 점수 행일 때만 넘기고, 아니면 빈 칸(undefined)이다.
  const page = readFileSync(
    path.resolve(__dirname, "..", "app/(app)/instructor/[examId]/grade/[studentId]/page.tsx"),
    "utf8"
  ).replace(/\r\n/g, "\n");

  it("시험 채점 화면은 점수 행일 때만 점수 칸 초기값을 넘긴다", () => {
    expect(page).toMatch(
      /caseGradeInitialScore =\s*currentGrade\?\.stage_grading\?\.answer\?\.score \?\?\s*\(isScoringGrade\(currentGrade\) \? currentGrade\.score : undefined\);/
    );
    expect(page).not.toMatch(/caseGradeInitialScore =\s*currentGrade\?\.stage_grading\?\.answer\?\.score \?\? currentGrade\?\.score;/);
  });
});
