import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  gradeObjectiveAnswer,
  isObjectiveQuestion,
  normalizeQuestions,
} from "@/lib/grading-helpers";

/**
 * Regression coverage for objective (multiple-choice / true-false) grading.
 *
 * Contract:
 *  - objective question → deterministic grade, score is 100/0, NO OpenAI call.
 *  - case/essay question → unchanged AI grading path is still taken.
 *
 * The first half is a pure-function test of `gradeObjectiveAnswer`. The second
 * half drives `gradeOneQuestion` with a mocked DB and asserts that an objective
 * question never reaches the AI grading helper, while a case question does.
 */

// ── Pure helper tests ──────────────────────────────────────────────

describe("normalizeQuestions preserves objective fields", () => {
  it("keeps type / options / correctOptionIndex", () => {
    const out = normalizeQuestions([
      {
        id: "q1",
        text: "2 + 2 = ?",
        type: "multiple-choice",
        options: ["3", "4", "5", "6"],
        correctOptionIndex: 1,
      },
    ]);
    expect(out[0].type).toBe("multiple-choice");
    expect(out[0].options).toEqual(["3", "4", "5", "6"]);
    expect(out[0].correctOptionIndex).toBe(1);
  });
});

describe("isObjectiveQuestion", () => {
  it("is true for mcq and true-false, false otherwise", () => {
    expect(isObjectiveQuestion("multiple-choice")).toBe(true);
    expect(isObjectiveQuestion("true-false")).toBe(true);
    expect(isObjectiveQuestion("essay")).toBe(false);
    expect(isObjectiveQuestion("short-answer")).toBe(false);
    expect(isObjectiveQuestion(undefined)).toBe(false);
  });
});

describe("gradeObjectiveAnswer", () => {
  const options = ["A", "B", "C", "D"];

  it("scores 100 for a correct selection", () => {
    const r = gradeObjectiveAnswer({ rawAnswer: "2", options, correctOptionIndex: 2 });
    expect(r).not.toBeNull();
    expect(r!.score).toBe(100);
    expect(r!.selectedIndex).toBe(2);
    expect(r!.comment).toContain("정답");
  });

  it("scores 0 for an incorrect selection", () => {
    const r = gradeObjectiveAnswer({ rawAnswer: "0", options, correctOptionIndex: 2 });
    expect(r!.score).toBe(0);
    expect(r!.comment).toContain("오답");
  });

  it("scores 0 for an empty / non-numeric answer", () => {
    expect(gradeObjectiveAnswer({ rawAnswer: "", options, correctOptionIndex: 1 })!.score).toBe(0);
    expect(gradeObjectiveAnswer({ rawAnswer: "  ", options, correctOptionIndex: 1 })!.score).toBe(0);
    expect(gradeObjectiveAnswer({ rawAnswer: "abc", options, correctOptionIndex: 1 })!.score).toBe(0);
    expect(gradeObjectiveAnswer({ rawAnswer: "1abc", options, correctOptionIndex: 1 })!.score).toBe(0);
  });

  it("handles true-false (O/X) as a 2-option mcq", () => {
    const tf = ["O", "X"];
    expect(gradeObjectiveAnswer({ rawAnswer: "0", options: tf, correctOptionIndex: 0 })!.score).toBe(100);
    expect(gradeObjectiveAnswer({ rawAnswer: "1", options: tf, correctOptionIndex: 0 })!.score).toBe(0);
  });

  it("returns null when correctOptionIndex is missing/invalid", () => {
    expect(gradeObjectiveAnswer({ rawAnswer: "1", options })).toBeNull();
    expect(
      gradeObjectiveAnswer({ rawAnswer: "1", options, correctOptionIndex: -1 })
    ).toBeNull();
  });
});

// ── gradeOneQuestion integration ──────────────────────────────────

const { supabaseMock, logErrorMock, callOpenAIMock, upsertGradesMock } =
  vi.hoisted(() => ({
    supabaseMock: { from: vi.fn() },
    logErrorMock: vi.fn(),
    callOpenAIMock: vi.fn(),
    upsertGradesMock: vi.fn(),
  }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));
vi.mock("@/lib/grades-upsert", () => ({
  upsertGradesBySessionQuestion: upsertGradesMock,
}));
vi.mock("@/lib/openai", async (original) => {
  const actual = (await original()) as Record<string, unknown>;
  return {
    ...actual,
    getOpenAI: () => ({
      chat: { completions: { create: callOpenAIMock } },
    }),
  };
});

import { gradeOneQuestion } from "@/lib/grading";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

/** Build a supabase mock backed by per-table fixtures for loadPhaseContext. */
function buildSupabase(opts: {
  questions: unknown[];
  submissionAnswer: string;
  existingGrade?: unknown;
}) {
  return (table: string) => {
    const data = (() => {
      switch (table) {
        case "grades":
          return opts.existingGrade ?? null;
        case "sessions":
          return {
            id: SESSION_ID,
            exam_id: "exam-1",
            student_id: "student-1",
            final_answer: null,
          };
        case "exams":
          return {
            id: "exam-1",
            title: "Test Exam",
            questions: opts.questions,
            rubric: null,
            chat_weight: 50,
            type: "exam",
            language: "ko",
          };
        case "submissions":
          return [
            {
              id: "sub-1",
              q_idx: 0,
              answer: opts.submissionAnswer,
              compressed_answer_data: null,
              workspace_state: null,
              created_at: new Date().toISOString(),
            },
          ];
        case "messages":
          return [];
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    })();

    const isList = table === "submissions" || table === "messages";
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: vi.fn(self),
      eq: vi.fn(self),
      order: vi.fn(self),
      update: vi.fn(self),
      upsert: vi.fn(self),
      maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
      single: vi.fn(() => Promise.resolve({ data, error: null })),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: isList ? data : data, error: null })),
    });
    return chain;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callOpenAIMock.mockReset();
  upsertGradesMock.mockReset();
  upsertGradesMock.mockResolvedValue(undefined);
});

describe("gradeOneQuestion — objective vs case", () => {
  it("objective question → deterministic grade, no OpenAI call", async () => {
    supabaseMock.from.mockImplementation(
      buildSupabase({
        questions: [
          {
            id: "q1",
            text: "정답은?",
            type: "multiple-choice",
            options: ["A", "B", "C", "D"],
            correctOptionIndex: 2,
          },
        ],
        submissionAnswer: "2",
      })
    );

    const result = await gradeOneQuestion(SESSION_ID, 0);

    expect(result).toEqual({ skipped: false, graded: true });
    expect(callOpenAIMock).not.toHaveBeenCalled();
    expect(upsertGradesMock).toHaveBeenCalledTimes(1);

    const [, grades] = upsertGradesMock.mock.calls[0];
    expect(grades[0].score).toBe(100);
    expect(grades[0].grade_type).toBe("auto");
    expect(grades[0].stage_grading).toBeNull();
  });

  it("objective wrong answer → score 0, still no OpenAI call", async () => {
    supabaseMock.from.mockImplementation(
      buildSupabase({
        questions: [
          {
            id: "q1",
            text: "정답은?",
            type: "true-false",
            options: ["O", "X"],
            correctOptionIndex: 0,
          },
        ],
        submissionAnswer: "1",
      })
    );

    const result = await gradeOneQuestion(SESSION_ID, 0);

    expect(result).toEqual({ skipped: false, graded: true });
    expect(callOpenAIMock).not.toHaveBeenCalled();
    const [, grades] = upsertGradesMock.mock.calls[0];
    expect(grades[0].score).toBe(0);
  });

  it("objective question ignores existing ai_summary placeholder row", async () => {
    supabaseMock.from.mockImplementation(
      buildSupabase({
        questions: [
          {
            id: "q1",
            text: "정답은?",
            type: "multiple-choice",
            options: ["A", "B", "C", "D"],
            correctOptionIndex: 3,
          },
        ],
        submissionAnswer: "3",
        existingGrade: { id: "summary", grade_type: "ai_summary" },
      })
    );

    const result = await gradeOneQuestion(SESSION_ID, 0);

    expect(result).toEqual({ skipped: false, graded: true });
    expect(callOpenAIMock).not.toHaveBeenCalled();
    const [, grades] = upsertGradesMock.mock.calls[0];
    expect(grades[0].score).toBe(100);
    expect(grades[0].grade_type).toBe("auto");
  });

  it("case question → skipped without OpenAI grading", async () => {
    supabaseMock.from.mockImplementation(
      buildSupabase({
        questions: [
          {
            id: "q1",
            text: "사례를 분석하시오.",
            type: "essay",
          },
        ],
        submissionAnswer: "학생의 서술형 답안입니다.",
      })
    );

    const result = await gradeOneQuestion(SESSION_ID, 0);

    expect(result).toEqual({
      skipped: true,
      graded: false,
      failureReason: "Non-objective exam question skipped",
    });
    expect(callOpenAIMock).not.toHaveBeenCalled();
    expect(upsertGradesMock).not.toHaveBeenCalled();
  });
});
