import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const EXAM_ID = "22222222-2222-4222-8222-222222222222";

const {
  currentUserMock,
  checkRateLimitAsyncMock,
  requireBulkGradeAccessMock,
  requireCaseGradeAccessMock,
  auditLogMock,
  gradingSessionState,
  gradeRows,
  upsertHistory,
  supabaseMock,
} = vi.hoisted(() => {
  const gradeRows = new Map<string, Record<string, unknown>>();
  const upsertHistory: Array<Record<string, unknown>> = [];

  return {
    currentUserMock: vi.fn(),
    checkRateLimitAsyncMock: vi.fn(),
    requireBulkGradeAccessMock: vi.fn(),
    requireCaseGradeAccessMock: vi.fn(),
    auditLogMock: vi.fn(),
    gradingSessionState: {
      proposedGrades: {} as Record<string, Record<string, { score: number; comment: string }>>,
    },
    gradeRows,
    upsertHistory,
    supabaseMock: { from: vi.fn() },
  };
});

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: checkRateLimitAsyncMock,
  RATE_LIMITS: { general: { limit: 100, windowSec: 60 }, ai: { limit: 10, windowSec: 60 } },
}));
vi.mock("@/lib/bulk-grade-access", () => ({
  requireBulkGradeAccess: requireBulkGradeAccessMock,
}));
vi.mock("@/lib/case-grade-access", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/case-grade-access")>();
  return { ...original, requireCaseGradeAccess: requireCaseGradeAccessMock };
});
vi.mock("@/lib/bulk-grading", () => ({
  getBulkGradableQuestions: () => [{ qIdx: 0, questionPrompt: "Case" }],
}));
vi.mock("@/lib/grades-upsert", () => ({
  upsertGradesBySessionQuestion: vi.fn(async (_client, rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      const key = `${row.session_id}:${row.q_idx}`;
      gradeRows.set(key, { ...(gradeRows.get(key) ?? {}), ...row });
      upsertHistory.push({ ...row });
    }
    return rows.map((row) => row.q_idx);
  }),
}));
vi.mock("@/lib/audit", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/grading-trigger", () => ({ triggerGradingIfNeeded: vi.fn() }));
vi.mock("@/lib/app-users", () => ({ batchGetUserInfo: vi.fn() }));
vi.mock("@/lib/demo-completion", () => ({ recordDemoGradedViewed: vi.fn() }));

import { POST as bulkGradeCommit } from "@/app/api/exam/[examId]/bulk-grade/commit/route";
import { POST as caseGradeCommit } from "@/app/api/session/[sessionId]/case-grade/commit/route";
import { POST as editIndividualGrade } from "@/app/api/session/[sessionId]/grade/route";

function createChain(table: string) {
  let operation = "select";
  let selected = "";

  const result = (terminal?: "single" | "maybeSingle") => {
    if (table === "sessions") {
      return terminal === "single"
        ? { data: { id: SESSION_ID, exam_id: EXAM_ID }, error: null }
        : { data: [{ id: SESSION_ID }], error: null };
    }
    if (table === "exams") {
      return {
        data: {
          instructor_id: "instructor-1",
          questions: [{ id: "case-0", idx: 0, type: "essay", prompt: "Case" }],
          status: "closed",
          type: "exam",
          deadline: null,
        },
        error: null,
      };
    }
    if (table === "grades") {
      return { data: gradeRows.get(`${SESSION_ID}:0`) ?? null, error: null };
    }
    if (table === "exam_grading_sessions" && operation === "select") {
      return {
        data: {
          status: "grading_done",
          calibration_status: "complete",
          grading_scope: "full",
          proposed_grades: gradingSessionState.proposedGrades,
        },
        error: null,
      };
    }
    if (table === "exam_grading_sessions" && operation === "update" && selected) {
      return { data: { id: "grading-session", status: "committing" }, error: null };
    }
    return { data: null, error: null };
  };

  const chain: Record<string, unknown> = {
    select: vi.fn((columns: string) => {
      selected = columns;
      return chain;
    }),
    update: vi.fn(() => {
      operation = "update";
      return chain;
    }),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result("maybeSingle")),
    single: vi.fn(async () => result("single")),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };

  return chain;
}

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("grade provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gradeRows.clear();
    upsertHistory.length = 0;
    gradingSessionState.proposedGrades = {
      [SESSION_ID]: { "0": { score: 84, comment: "AI feedback" } },
    };
    currentUserMock.mockResolvedValue({ id: "instructor-1", role: "instructor" });
    checkRateLimitAsyncMock.mockResolvedValue({ allowed: true });
    auditLogMock.mockResolvedValue(undefined);
    supabaseMock.from.mockImplementation((table: string) => createChain(table));
    requireBulkGradeAccessMock.mockResolvedValue({
      ok: true,
      ctx: {
        user: { id: "instructor-1" },
        exam: { type: "exam", questions: [] },
        supabase: supabaseMock,
      },
    });
    requireCaseGradeAccessMock.mockResolvedValue({
      ok: true,
      ctx: { user: { id: "instructor-1" }, supabase: supabaseMock },
    });
  });

  it("stores the server-side AI proposal separately and preserves it after an instructor edit", async () => {
    const bulkResponse = await bulkGradeCommit(
      request(`/api/exam/${EXAM_ID}/bulk-grade/commit`, {
        grades: [{ session_id: SESSION_ID, q_idx: 0, score: 91, comment: "Instructor commit" }],
      }),
      { params: Promise.resolve({ examId: EXAM_ID }) },
    );

    expect(bulkResponse.status).toBe(200);
    const proposedAt = gradeRows.get(`${SESSION_ID}:0`)?.ai_proposed_at;
    expect(gradeRows.get(`${SESSION_ID}:0`)).toMatchObject({
      score: 91,
      ai_proposed_score: 84,
      ai_proposal_source: "bulk_grade_commit",
      grade_type: "manual",
    });
    expect(proposedAt).toEqual(expect.any(String));

    const editResponse = await editIndividualGrade(
      request(`/api/session/${SESSION_ID}/grade`, {
        questionIdx: 0,
        score: 93,
        comment: "Later instructor adjustment",
      }),
      { params: Promise.resolve({ sessionId: SESSION_ID }) },
    );

    expect(editResponse.status).toBe(200);
    expect(gradeRows.get(`${SESSION_ID}:0`)).toMatchObject({
      score: 93,
      grade_type: "manual",
      ai_proposed_score: 84,
      ai_proposed_at: proposedAt,
      ai_proposal_source: "bulk_grade_commit",
    });
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposed_score");
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposed_at");
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposal_source");
  });

  it("stores null provenance when no server-side AI proposal exists", async () => {
    gradingSessionState.proposedGrades = {};

    const response = await bulkGradeCommit(
      request(`/api/exam/${EXAM_ID}/bulk-grade/commit`, {
        grades: [{ session_id: SESSION_ID, q_idx: 0, score: 91, comment: "Instructor commit" }],
      }),
      { params: Promise.resolve({ examId: EXAM_ID }) },
    );

    expect(response.status).toBe(200);
    expect(gradeRows.get(`${SESSION_ID}:0`)).toMatchObject({
      score: 91,
      grade_type: "manual",
      ai_proposed_score: null,
      ai_proposed_at: null,
      ai_proposal_source: null,
    });
  });

  it("keeps case-grade commit manual without AI provenance", async () => {
    const response = await caseGradeCommit(
      request(`/api/session/${SESSION_ID}/case-grade/commit`, {
        qIdx: 0,
        score: 77,
        comment: "Discussion result",
      }),
      { params: Promise.resolve({ sessionId: SESSION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(upsertHistory.at(-1)).toMatchObject({ score: 77, grade_type: "manual" });
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposed_score");
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposed_at");
    expect(upsertHistory.at(-1)).not.toHaveProperty("ai_proposal_source");
  });
});
