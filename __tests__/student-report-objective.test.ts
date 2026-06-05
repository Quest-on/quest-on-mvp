import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { currentUserMock, checkRateLimitAsyncMock, supabaseMock } = vi.hoisted(
  () => ({
    currentUserMock: vi.fn(),
    checkRateLimitAsyncMock: vi.fn(),
    supabaseMock: {
      from: vi.fn(),
    },
  }),
);

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: checkRateLimitAsyncMock,
  RATE_LIMITS: {
    sessionRead: { limit: 30, windowSec: 60 },
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { GET } from "@/app/api/student/session/[sessionId]/report/route";

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(resolve(result)),
    ),
  };
  return builder;
}

function queueTableMocks(queues: Record<string, ReturnType<typeof createChain>[]>) {
  supabaseMock.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`No mock configured for table ${table}`);
    return next;
  });
}

describe("GET /api/student/session/[sessionId]/report objective grades", () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: "student-1", role: "student" });
    checkRateLimitAsyncMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
  });

  it("returns deterministic MCQ scores in grades even when no grade row exists", async () => {
    queueTableMocks({
      sessions: [
        createChain({
          data: {
            id: sessionId,
            exam_id: "exam-1",
            student_id: "student-1",
            submitted_at: "2026-05-29T00:00:00.000Z",
            created_at: "2026-05-29T00:00:00.000Z",
            compressed_session_data: null,
            grading_progress: null,
          },
          error: null,
        }),
      ],
      exams: [
        createChain({
          data: {
            id: "exam-1",
            title: "Objective Exam",
            code: "ABC123",
            description: null,
            duration: 60,
            grades_released: true,
            score_weights: null,
            questions: [
              {
                id: "q1",
                idx: 0,
                type: "multiple-choice",
                prompt: "정답은?",
                options: ["A", "B", "C", "D"],
                correctOptionIndex: 2,
              },
            ],
          },
          error: null,
        }),
      ],
      submissions: [
        createChain({
          data: [
            {
              id: "sub-1",
              q_idx: 0,
              answer: "2",
              compressed_answer_data: null,
              created_at: "2026-05-29T00:01:00.000Z",
            },
          ],
          error: null,
        }),
      ],
      messages: [createChain({ data: [], error: null })],
      grades: [createChain({ data: [], error: null })],
      session_quiz_attempts: [createChain({ data: null, error: null })],
    });

    const response = await GET(new Request("http://localhost/report") as NextRequest, {
      params: Promise.resolve({ sessionId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grades).toMatchObject({
      0: { q_idx: 0, score: 100 },
    });
    expect(body.overallScore).toBe(100);
    expect(body.exam.questions[0].correctOptionIndex).toBeUndefined();
  });
});
