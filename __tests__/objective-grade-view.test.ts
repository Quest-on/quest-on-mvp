import { describe, it, expect } from "vitest";
import {
  buildTypedQuestionEntries,
  getSubmissionForQuestion,
  getSubmittedAnswer,
} from "@/lib/objective-grade-view";

// Reproduces the real exam "파이썬 테스트": 5 MCQ + 5 OX, stored questions have
// NO `idx` field and a UUID `id`. Submissions are keyed by global q_idx ("0".."9").
const QUESTIONS = [
  { id: "uuid-0", type: "multiple-choice", correctOptionIndex: 0 },
  { id: "uuid-1", type: "multiple-choice", correctOptionIndex: 2 },
  { id: "uuid-2", type: "multiple-choice", correctOptionIndex: 2 },
  { id: "uuid-3", type: "multiple-choice", correctOptionIndex: 2 },
  { id: "uuid-4", type: "multiple-choice", correctOptionIndex: 3 },
  { id: "uuid-5", type: "true-false", correctOptionIndex: 0 },
  { id: "uuid-6", type: "true-false", correctOptionIndex: 1 },
  { id: "uuid-7", type: "true-false", correctOptionIndex: 0 },
  { id: "uuid-8", type: "true-false", correctOptionIndex: 0 },
  { id: "uuid-9", type: "true-false", correctOptionIndex: 1 },
];

// 강도윤's submissions: MCQ 0/2/2/2/3 (all correct), OX 0/1/1/0/1 (q7 wrong).
const SUBMISSIONS: Record<string, { q_idx: number; answer: string }> = {
  "0": { q_idx: 0, answer: "0" },
  "1": { q_idx: 1, answer: "2" },
  "2": { q_idx: 2, answer: "2" },
  "3": { q_idx: 3, answer: "2" },
  "4": { q_idx: 4, answer: "3" },
  "5": { q_idx: 5, answer: "0" },
  "6": { q_idx: 6, answer: "1" },
  "7": { q_idx: 7, answer: "1" },
  "8": { q_idx: 8, answer: "0" },
  "9": { q_idx: 9, answer: "1" },
};

describe("buildTypedQuestionEntries", () => {
  it("preserves the GLOBAL index for the filtered type (OX entries are 5..9, not 0..4)", () => {
    const ox = buildTypedQuestionEntries(QUESTIONS, "true-false");
    expect(ox.map((e) => e.globalIndex)).toEqual([5, 6, 7, 8, 9]);
    const mcq = buildTypedQuestionEntries(QUESTIONS, "multiple-choice");
    expect(mcq.map((e) => e.globalIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("getSubmissionForQuestion — OX must resolve to OX submissions", () => {
  it("maps each OX question to its own submission via global index (regression for OX/MCQ cross-mapping)", () => {
    const ox = buildTypedQuestionEntries(QUESTIONS, "true-false");
    const resolved = ox.map(({ question, globalIndex }) => {
      const sub = getSubmissionForQuestion(SUBMISSIONS, question, globalIndex);
      const ans = getSubmittedAnswer(sub);
      const correct = Number(ans) === question.correctOptionIndex;
      return { globalIndex, answer: ans, correct };
    });

    // Answers must come from q5..q9, NOT from q0..q4 (the MCQ submissions).
    expect(resolved.map((r) => r.answer)).toEqual(["0", "1", "1", "0", "1"]);
    // True correctness: only q7 (global idx 7) is wrong → OX 4/5.
    expect(resolved.map((r) => r.correct)).toEqual([true, true, false, true, true]);
    expect(resolved.filter((r) => r.correct).length).toBe(4);
  });

  it("BUG GUARD: using the per-type filtered index would pull MCQ answers and mismark OX", () => {
    const ox = buildTypedQuestionEntries(QUESTIONS, "true-false");
    // Simulate the old behavior: pass the filtered position (0..4) instead of globalIndex.
    const wrong = ox.map(({ question }, filteredIndex) => {
      const sub = getSubmissionForQuestion(SUBMISSIONS, question, filteredIndex);
      return getSubmittedAnswer(sub);
    });
    // Old code resolved OX questions to the MCQ submissions q0..q4 → "0","2","2","2","3".
    expect(wrong).toEqual(["0", "2", "2", "2", "3"]);
  });
});

describe("getSubmissionForQuestion — candidate precedence", () => {
  it("prefers an explicit numeric idx when present", () => {
    const q = { idx: 5, id: "uuid-5", type: "true-false" };
    const sub = getSubmissionForQuestion(SUBMISSIONS, q, 0);
    expect(sub).toEqual(SUBMISSIONS["5"]);
  });

  it("falls back to numeric id when idx absent and global index misses", () => {
    const subs = { "42": { q_idx: 42, answer: "1" } };
    const q = { id: "42", type: "true-false" };
    expect(getSubmissionForQuestion(subs, q, 99)).toEqual(subs["42"]);
  });

  it("returns undefined when nothing resolves", () => {
    expect(getSubmissionForQuestion(SUBMISSIONS, { id: "uuid-x", type: "true-false" }, 99)).toBeUndefined();
    expect(getSubmissionForQuestion(undefined, { id: "x" }, 0)).toBeUndefined();
  });
});

describe("getSubmittedAnswer", () => {
  it("returns the answer string directly", () => {
    expect(getSubmittedAnswer({ answer: "2" })).toBe("2");
  });

  it("falls back to decompressed answerData (selectedIndex, number → string)", () => {
    expect(getSubmittedAnswer({ answer: "", decompressed: { answerData: { selectedIndex: 3 } } })).toBe("3");
    expect(getSubmittedAnswer({ decompressed: { answerData: { text: "X" } } })).toBe("X");
  });

  it("returns empty string for missing/empty submissions", () => {
    expect(getSubmittedAnswer(undefined)).toBe("");
    expect(getSubmittedAnswer({ answer: "   " })).toBe("");
  });
});
