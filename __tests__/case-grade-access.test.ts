import { describe, expect, it } from "vitest";
import {
  hasQuestionWithQIdx,
  isCaseQuestionQIdx,
  questionPromptByQIdx,
} from "@/lib/case-grade-access";

describe("case-grade qIdx helpers", () => {
  const questions = [
    { id: "a", idx: 10, type: "essay", text: "First explicit case" },
    { id: "b", idx: 20, type: "essay", prompt: "Second explicit case" },
  ];

  it("resolves explicit question idx instead of array offsets", () => {
    expect(hasQuestionWithQIdx(questions, 20)).toBe(true);
    expect(questionPromptByQIdx(questions, 20)).toBe("Second explicit case");
  });

  it("rejects missing explicit qIdx values", () => {
    expect(hasQuestionWithQIdx(questions, 1)).toBe(false);
    expect(questionPromptByQIdx(questions, 1)).toBe("");
  });

  it("allows only case-like question types for case grading", () => {
    const mixedQuestions = [
      { id: "mcq", idx: 0, type: "multiple-choice", text: "MCQ" },
      { id: "ox", idx: 1, type: "true-false", text: "OX" },
      { id: "case", idx: 2, type: "case", text: "Case" },
      { id: "essay", idx: 3, type: "essay", text: "Essay" },
      { id: "short", idx: 4, type: "short-answer", text: "Short" },
    ];

    expect(isCaseQuestionQIdx(mixedQuestions, 0)).toBe(false);
    expect(isCaseQuestionQIdx(mixedQuestions, 1)).toBe(false);
    expect(isCaseQuestionQIdx(mixedQuestions, 2)).toBe(true);
    expect(isCaseQuestionQIdx(mixedQuestions, 3)).toBe(true);
    expect(isCaseQuestionQIdx(mixedQuestions, 4)).toBe(true);
  });
});
