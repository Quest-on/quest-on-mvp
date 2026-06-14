import { describe, expect, it } from "vitest";
import {
  isObjectiveQuestionIncomplete,
  isQuestionContentEmpty,
  type ObjectiveQuestionLike,
} from "@/lib/authoring-validation";

describe("isQuestionContentEmpty", () => {
  it("treats empty string as empty", () => {
    expect(isQuestionContentEmpty("")).toBe(true);
  });

  it("treats HTML-only markup as empty", () => {
    expect(isQuestionContentEmpty("<p></p>")).toBe(true);
    expect(isQuestionContentEmpty("<p><br></p>")).toBe(true);
  });

  it("treats &nbsp; and whitespace as empty", () => {
    expect(isQuestionContentEmpty("&nbsp;")).toBe(true);
    expect(isQuestionContentEmpty("   ")).toBe(true);
    expect(isQuestionContentEmpty("<p>&nbsp;&nbsp;</p>")).toBe(true);
  });

  it("treats visible text as non-empty", () => {
    expect(isQuestionContentEmpty("<p>hello</p>")).toBe(false);
    expect(isQuestionContentEmpty("plain text")).toBe(false);
    expect(isQuestionContentEmpty("<p>&nbsp;text&nbsp;</p>")).toBe(false);
  });
});

describe("isObjectiveQuestionIncomplete", () => {
  const mc = (over: Partial<ObjectiveQuestionLike>): ObjectiveQuestionLike => ({
    type: "multiple-choice",
    correctOptionIndex: 0,
    options: ["a", "b", "c", "d"],
    ...over,
  });

  it("ignores non-objective question types", () => {
    expect(isObjectiveQuestionIncomplete({ type: "essay" })).toBe(false);
    expect(isObjectiveQuestionIncomplete({ type: "short-answer" })).toBe(false);
  });

  it("flags missing correct answer", () => {
    expect(isObjectiveQuestionIncomplete(mc({ correctOptionIndex: undefined }))).toBe(true);
    expect(
      isObjectiveQuestionIncomplete({ type: "true-false", correctOptionIndex: undefined })
    ).toBe(true);
  });

  it("flags multiple-choice with fewer than 4 options", () => {
    expect(isObjectiveQuestionIncomplete(mc({ options: ["a", "b", "c"] }))).toBe(true);
    expect(isObjectiveQuestionIncomplete(mc({ options: undefined }))).toBe(true);
  });

  it("flags multiple-choice with a blank option in the first four", () => {
    expect(isObjectiveQuestionIncomplete(mc({ options: ["a", "", "c", "d"] }))).toBe(true);
    expect(isObjectiveQuestionIncomplete(mc({ options: ["a", "b", "c", "  "] }))).toBe(true);
  });

  it("accepts a complete multiple-choice question", () => {
    expect(isObjectiveQuestionIncomplete(mc({}))).toBe(false);
    expect(
      isObjectiveQuestionIncomplete(mc({ options: ["a", "b", "c", "d", "e"] }))
    ).toBe(false);
  });

  it("accepts a true-false question with a chosen answer", () => {
    expect(
      isObjectiveQuestionIncomplete({ type: "true-false", correctOptionIndex: 1 })
    ).toBe(false);
  });
});
