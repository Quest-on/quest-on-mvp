/**
 * 지각 승인과 레거시 세션이 학생 AI 고지를 우회하지 못하게 고정한다 (#150).
 *
 * 교수자의 승인 시각을 학생 수락으로 쓰면 학생은 모달을 보지 못한 채 시험을
 * 시작한다. 실제 라우트의 update 페이로드와 훅 배선을 함께 검사해야 이 우회가
 * 되살아나지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const update = vi.fn();

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => ({ id: "instructor-1", role: "instructor" }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { examControl: { limit: 30, windowSec: 60 } },
}));

vi.mock("@/lib/logger", () => ({ logError: () => {} }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      if (table === "exams") {
        const examQuery = {
          select: () => examQuery,
          eq: () => examQuery,
          single: async () => ({
            data: {
              id: EXAM_ID,
              instructor_id: "instructor-1",
              status: "running",
              started_at: "2026-08-10T09:00:00.000Z",
            },
            error: null,
          }),
        };
        return examQuery;
      }

      const sessionQuery = {
        select: () => sessionQuery,
        eq: () => sessionQuery,
        single: async () => ({
          data: { id: SESSION_ID, exam_id: EXAM_ID, status: "late_pending" },
          error: null,
        }),
        update: (payload: unknown) => {
          update(payload);
          return sessionQuery;
        },
      };
      return sessionQuery;
    },
  }),
}));

async function approveLateEntry() {
  const { POST } = await import("../app/api/exam/[examId]/late-entry/route");
  const request = new Request(`https://quest-on.app/api/exam/${EXAM_ID}/late-entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: SESSION_ID, action: "approve" }),
  });
  const response = await POST(request as never, {
    params: Promise.resolve({ examId: EXAM_ID }),
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("지각 입장 고지 게이트 (#150)", () => {
  it("교수자 승인은 학생의 preflight 수락 시각을 쓰지 않는다", async () => {
    const res = await approveLateEntry();

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).not.toHaveProperty("preflight_accepted_at");
  });

  it("AI 채팅 시험에서 사람 단위 ACK가 없으면 preflight를 다시 띄운다", () => {
    const hook = readFileSync("hooks/useExamSession.ts", "utf8");

    expect(hook).toMatch(/hasAiChatQuestions\(initData\.exam\.questions\)/);
    expect(hook).toMatch(/!initData\.disclosureAcknowledged/);
    expect(hook).toMatch(/\|\| needsDisclosureAcknowledgement/);
    expect(hook).toMatch(/"late_pending"/);
  });

  it("제출된 세션에는 이미 보지 못한 고지도 다시 띄우지 않는다", () => {
    const hook = readFileSync("hooks/useExamSession.ts", "utf8");

    expect(hook).toMatch(/completedSessionStatuses = new Set\(\["submitted", "auto_submitted"\]\)/);
    expect(hook).toMatch(/!completedSessionStatuses\.has\(currentSessionStatus\)/);
    expect(hook).toMatch(/!initData\.session\.submitted_at/);
  });
});
