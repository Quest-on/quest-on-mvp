import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use these modules.
// ---------------------------------------------------------------------------
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

// api-response is used by requireCaseGradeAccess; keep the real implementation
// so error codes/statuses are tested faithfully.
vi.mock("@/lib/api-response", async (importOriginal) => {
  return await importOriginal();
});

import {
  hasQuestionWithQIdx,
  isCaseQuestionQIdx,
  questionPromptByQIdx,
  requireCaseGradeAccess,
} from "@/lib/case-grade-access";
import type { AppUser } from "@/lib/get-current-user";

// ---------------------------------------------------------------------------
// Supabase query-builder helpers
// ---------------------------------------------------------------------------
type SingleResult = { data: unknown; error: unknown };

function makeChain(result: SingleResult) {
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    single: vi.fn().mockResolvedValue(result),
  };
  return b;
}

/** Wire up sequential `from()` calls per table. */
function queueTableMocks(queues: Record<string, ReturnType<typeof makeChain>[]>) {
  supabaseMock.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`No mock queued for table "${table}"`);
    return next;
  });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
const INSTRUCTOR: AppUser = {
  id: "instr-1",
  role: "instructor",
  email: "instr@test.com",
  status: "approved",
  fullName: "Test Instructor",
  avatarUrl: null,
};

const PAST_DEADLINE = "2024-01-01T00:00:00Z";   // well before today (2026-06-16)
const FUTURE_DEADLINE = "2099-12-31T23:59:59Z"; // well after today

const CASE_QUESTIONS = [
  { id: "q1", idx: 0, type: "essay", text: "Write an essay." },
];
const MCQ_QUESTIONS = [
  { id: "q1", idx: 0, type: "multiple-choice", text: "Pick one." },
];

function sessionRow(examId = "exam-1") {
  return { id: "sess-1", exam_id: examId, final_answer: null };
}

function examRow(overrides: Record<string, unknown> = {}) {
  return {
    instructor_id: "instr-1",
    questions: CASE_QUESTIONS,
    language: "ko",
    status: null,
    type: null,
    deadline: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helper tests (existing — no changes)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// requireCaseGradeAccess — assignment cases
// ---------------------------------------------------------------------------
describe("requireCaseGradeAccess — assignment (type='report')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants access when deadline has passed and requireGradable:true", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "report", deadline: PAST_DEADLINE }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.exam.type).toBe("report");
    }
  });

  it("bypasses case-type gate for assignments: q_idx=0 on a non-case question is still allowed", async () => {
    // MCQ question at idx 0 — for an exam this would be rejected by the case-type gate,
    // but for an assignment it must be allowed.
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({
            type: "report",
            deadline: PAST_DEADLINE,
            questions: MCQ_QUESTIONS,
          }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(true);
  });

  it("returns 409 ASSIGNMENT_NOT_DUE when deadline has not passed and requireGradable:true", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "report", deadline: FUTURE_DEADLINE }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, undefined, {
      requireGradable: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      const body = await result.response.json();
      expect(body.error).toBe("ASSIGNMENT_NOT_DUE");
    }
  });

  it("returns 409 ASSIGNMENT_NOT_DUE when deadline is null and requireGradable:true", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "report", deadline: null }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, undefined, {
      requireGradable: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      const body = await result.response.json();
      expect(body.error).toBe("ASSIGNMENT_NOT_DUE");
    }
  });

  it("grants access without requireGradable even when deadline is in the future", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "report", deadline: FUTURE_DEADLINE }),
          error: null,
        }),
      ],
    });

    // No requireGradable option — gate should be skipped entirely
    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR);

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requireCaseGradeAccess — exam regression cases
// ---------------------------------------------------------------------------
describe("requireCaseGradeAccess — exam (type='exam')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants access when status='closed' and requireGradable:true", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "exam", status: "closed", questions: CASE_QUESTIONS }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(true);
  });

  it("returns 409 EXAM_NOT_CLOSED when status is not 'closed' and requireGradable:true", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({ type: "exam", status: "open", questions: CASE_QUESTIONS }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      const body = await result.response.json();
      expect(body.error).toBe("EXAM_NOT_CLOSED");
    }
  });

  it("enforces case-type gate for exams: MCQ question is rejected", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({
            type: "exam",
            status: "closed",
            questions: MCQ_QUESTIONS,
          }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    }
  });

  it("enforces case-type gate for exams: essay question is allowed", async () => {
    queueTableMocks({
      sessions: [makeChain({ data: sessionRow(), error: null })],
      exams: [
        makeChain({
          data: examRow({
            type: "exam",
            status: "closed",
            questions: CASE_QUESTIONS,
          }),
          error: null,
        }),
      ],
    });

    const result = await requireCaseGradeAccess("sess-1", INSTRUCTOR, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects non-instructor users with 403", async () => {
    const student: AppUser = {
      id: "stu-1",
      role: "student",
      email: "s@t.com",
      status: "approved",
      fullName: null,
      avatarUrl: null,
    };

    // No DB calls expected
    const result = await requireCaseGradeAccess("sess-1", student, 0, {
      requireGradable: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects null user with 401", async () => {
    const result = await requireCaseGradeAccess("sess-1", null, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
