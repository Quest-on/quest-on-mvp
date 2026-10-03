/**
 * 채점 데이터 라우트가 문항의 AI 역할(ai_role)을 내려 준다 (#564 8번)
 *
 * 채점 화면은 분석 파트너 문항이 있는 시험에서만 실행 기록을 부른다. 그러려면 `GET /api/session/<id>/grade` 가
 * 문항을 정리할 때 `ai_role` 을 남겨야 한다(예전에는 정리하면서 지웠다). 문자열일 때만 그대로 남기고, 해석은
 * 화면(`hasAnalysisPartnerQuestions`)이 학생 화면과 같은 규칙(정확히 일치)으로 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasAnalysisPartnerQuestions } from "@/lib/grading-helpers";

const SESSION_ID = "3f1d4b2a-1111-4111-8111-111111111111";
const EXAM_ID = "2f1d4b2a-1111-4111-8111-111111111111";
const INSTRUCTOR_ID = "instructor-1";

let examQuestions: unknown[] = [];

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => ({ id: INSTRUCTOR_ID, role: "instructor" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { sessionRead: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/app-users", () => ({ batchGetUserInfo: async () => new Map() }));
vi.mock("@/lib/demo-completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo-completion")>();
  return { ...actual, recordDemoGradedViewed: vi.fn(async () => undefined) };
});

const session = {
  id: SESSION_ID,
  exam_id: EXAM_ID,
  student_id: "student-1",
  submitted_at: "2026-10-04T00:00:00Z",
  used_clarifications: 0,
  created_at: "2026-10-04T00:00:00Z",
  compressed_session_data: null,
  compression_metadata: null,
  ai_summary: null,
  auto_submitted: false,
  grading_progress: null,
  final_answer: null,
  final_answer_updated_at: null,
};

function resultFor(table: string) {
  if (table === "grades" || table === "submissions" || table === "messages" || table === "paste_logs") {
    return { data: [], error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async () => {
          if (table === "sessions") return { data: session, error: null };
          if (table === "exams") {
            return {
              data: {
                id: EXAM_ID,
                title: "시험",
                code: "ABC123",
                instructor_id: INSTRUCTOR_ID,
                questions: examQuestions,
                rubric: null,
                is_demo: false,
                status: "closed",
                score_weights: null,
                type: "exam",
                deadline: null,
              },
              error: null,
            };
          }
          return resultFor(table);
        },
        maybeSingle: async () => resultFor(table),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(resultFor(table)).then(resolve, reject),
      };
      return query;
    },
  }),
}));

async function gradeQuestions(): Promise<Array<Record<string, unknown>>> {
  const { GET } = await import("../app/api/session/[sessionId]/grade/route");
  const response = await GET(new Request("https://quest-on.app") as never, {
    params: Promise.resolve({ sessionId: SESSION_ID }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { exam: { questions: Array<Record<string, unknown>> } };
  return body.exam.questions;
}

beforeEach(() => {
  examQuestions = [];
});

describe("채점 데이터의 문항 정리 (#564)", () => {
  it("문항의 ai_role 문자열을 그대로 남긴다", async () => {
    examQuestions = [
      { id: "q1", idx: 0, type: "essay", text: "일반 문제" },
      { id: "q2", idx: 1, type: "essay", text: "분석 문제", ai_role: "analysis_partner" },
      { id: "q3", idx: 2, type: "essay", text: "사례 문제", ai_role: "case_author" },
    ];
    const questions = await gradeQuestions();
    expect(questions.map((q) => q.ai_role)).toEqual([undefined, "analysis_partner", "case_author"]);
    // 기존 정리(text → prompt)는 그대로다.
    expect(questions[1]).toMatchObject({ id: "q2", idx: 1, type: "essay", prompt: "분석 문제" });
  });

  it("문자열이 아닌 ai_role 은 내려보내지 않는다", async () => {
    examQuestions = [{ id: "q1", idx: 0, type: "essay", text: "문제", ai_role: { x: 1 } }];
    const [question] = await gradeQuestions();
    expect(question).not.toHaveProperty("ai_role");
  });

  it("내려 준 문항으로 분석 파트너 시험을 가린다", async () => {
    examQuestions = [
      { id: "q1", idx: 0, type: "essay", text: "일반 문제" },
      { id: "q2", idx: 1, type: "essay", text: "분석 문제", ai_role: "analysis_partner" },
    ];
    expect(hasAnalysisPartnerQuestions(await gradeQuestions())).toBe(true);
    examQuestions = [{ id: "q1", idx: 0, type: "essay", text: "일반 문제" }];
    expect(hasAnalysisPartnerQuestions(await gradeQuestions())).toBe(false);
  });
});

describe("hasAnalysisPartnerQuestions", () => {
  it("ai_role 이 정확히 analysis_partner 인 문항이 하나라도 있을 때만 참이다", () => {
    expect(hasAnalysisPartnerQuestions([{ ai_role: "analysis_partner" }])).toBe(true);
    expect(hasAnalysisPartnerQuestions([{}, null, { ai_role: "analysis_partner" }])).toBe(true);
    expect(hasAnalysisPartnerQuestions([{ ai_role: "case_author" }, {}])).toBe(false);
    expect(hasAnalysisPartnerQuestions([{ ai_role: "Analysis_Partner" }, { ai_role: " analysis_partner" }])).toBe(false);
    expect(hasAnalysisPartnerQuestions([])).toBe(false);
    expect(hasAnalysisPartnerQuestions(null)).toBe(false);
    expect(hasAnalysisPartnerQuestions(undefined)).toBe(false);
  });
});
