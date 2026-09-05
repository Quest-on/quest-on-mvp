import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "3f1d4b2a-1111-4111-8111-111111111111";
const EXAM_ID = "2f1d4b2a-1111-4111-8111-111111111111";
const INSTRUCTOR_ID = "instructor-1";

let sessionUser: { id: string; role: string } | null = {
  id: INSTRUCTOR_ID,
  role: "instructor",
};
let isDemo = true;
let isDemoLookupError: Error | null = null;
let gradeRows: Array<Record<string, unknown>> = [{ id: "grade-1", q_idx: 0, score: 90 }];

const recordOnboardingEvent = vi.fn(async () => true);
const hasOnboardingEvent = vi.fn(async () => false);
const recordDemoGradedViewed = vi.fn(async () => undefined);
const isDemoCompleted = vi.fn(async () => false);

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => sessionUser,
}));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { DEMO_GRADED_VIEWED: "demo_graded_viewed" },
  recordOnboardingEvent,
  hasOnboardingEvent,
}));
// 기록함수만 스터브하고 판정함수(hasViewableGradingResult)는 실제 구현을 쓴다.
// 판정까지 목하면 라우트가 "어떤 신호로 완주를 판정하는가" 를 검증하지 못한다.
vi.mock("@/lib/demo-completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo-completion")>();
  return { ...actual, recordDemoGradedViewed, isDemoCompleted };
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { sessionRead: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/app-users", () => ({
  batchGetUserInfo: async () => new Map(),
}));

// ai_summary 는 테스트마다 바뀐다. CASE 데모의 AI 채점 결과가 여기 들어가고,
// 그게 완주 판정의 두 신호 중 하나다 (#335).
let aiSummary: unknown = null;

const session = {
  id: SESSION_ID,
  exam_id: EXAM_ID,
  student_id: "student-1",
  submitted_at: "2026-08-10T00:00:00Z",
  used_clarifications: 0,
  created_at: "2026-08-10T00:00:00Z",
  compressed_session_data: null,
  compression_metadata: null,
  get ai_summary() {
    return aiSummary;
  },
  auto_submitted: false,
  grading_progress: null,
  final_answer: null,
  final_answer_updated_at: null,
};
const exam = {
  id: EXAM_ID,
  instructor_id: INSTRUCTOR_ID,
  questions: [{ idx: 0, type: "essay", prompt: "답변" }],
  status: "closed",
  score_weights: null,
};

function resultFor(table: string, selectFields: string) {
  if (table === "grades") return { data: gradeRows, error: null };
  if (table === "submissions" || table === "messages" || table === "paste_logs") {
    return { data: [], error: null };
  }
  if (table === "session_quiz_attempts") return { data: null, error: null };
  if (table === "exams" && selectFields === "is_demo") {
    return { data: isDemo ? { is_demo: true } : { is_demo: false }, error: isDemoLookupError };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      let selectFields = "";
      const query = {
        select: (fields: string) => {
          selectFields = fields;
          return query;
        },
        eq: () => query,
        order: () => query,
        single: async () => {
          if (table === "sessions") return { data: session, error: null };
          if (table === "exams") return { data: exam, error: null };
          return resultFor(table, selectFields);
        },
        maybeSingle: async () => resultFor(table, selectFields),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(resultFor(table, selectFields)).then(resolve, reject),
      };
      return query;
    },
  }),
}));

async function actualDemoCompletion() {
  return vi.importActual<typeof import("@/lib/demo-completion")>("@/lib/demo-completion");
}

async function callGrade() {
  const { GET } = await import("../app/api/session/[sessionId]/grade/route");
  const response = await GET(new Request("https://quest-on.app") as never, {
    params: Promise.resolve({ sessionId: SESSION_ID }),
  });
  return { status: response.status, body: await response.json() };
}

async function callStatus() {
  const { GET } = await import("../app/api/onboarding/demo/status/route");
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: INSTRUCTOR_ID, role: "instructor" };
  isDemo = true;
  isDemoLookupError = null;
  gradeRows = [{ id: "grade-1", q_idx: 0, score: 90 }];
  aiSummary = null;
  recordDemoGradedViewed.mockResolvedValue(undefined);
  isDemoCompleted.mockResolvedValue(false);
});

describe("데모 완주 판정 (AC-7)", () => {
  it("채점 결과가 있는 데모 조회는 demo_graded_viewed를 기록한다", async () => {
    const { recordDemoGradedViewed: record } = await actualDemoCompletion();

    await record({ userId: INSTRUCTOR_ID, examId: EXAM_ID, hasGradedResult: true });

    expect(recordOnboardingEvent).toHaveBeenCalledWith({
      userId: INSTRUCTOR_ID,
      role: "instructor",
      event: "demo_graded_viewed",
      examId: EXAM_ID,
    });
  });

  it("채점 결과가 없는 데모 조회는 기록하지 않는다", async () => {
    const { recordDemoGradedViewed: record } = await actualDemoCompletion();

    await record({ userId: INSTRUCTOR_ID, examId: EXAM_ID, hasGradedResult: false });

    expect(recordOnboardingEvent).not.toHaveBeenCalled();
  });

  it("데모가 아닌 시험 조회는 기록하지 않는다", async () => {
    isDemo = false;
    const { recordDemoGradedViewed: record } = await actualDemoCompletion();

    await record({ userId: INSTRUCTOR_ID, examId: EXAM_ID, hasGradedResult: true });

    expect(recordOnboardingEvent).not.toHaveBeenCalled();
  });

  it("018 미적용으로 is_demo 조회가 실패해도 기록하지 않고 예외를 내지 않는다", async () => {
    isDemoLookupError = new Error("column exams.is_demo does not exist");
    const { recordDemoGradedViewed: record } = await actualDemoCompletion();

    await expect(record({ userId: INSTRUCTOR_ID, examId: EXAM_ID, hasGradedResult: true })).resolves.toBeUndefined();
    expect(recordOnboardingEvent).not.toHaveBeenCalled();
  });

  it("채점 결과 열람은 시험 소유자와 실제 grade 존재 여부로 계측한다", async () => {
    const result = await callGrade();

    expect(result.status).toBe(200);
    expect(recordDemoGradedViewed).toHaveBeenCalledWith({
      userId: INSTRUCTOR_ID,
      examId: EXAM_ID,
      hasGradedResult: true,
    });
  }, 10_000);

  it("채점 결과가 없으면 grade 조회 훅도 완주로 기록하지 않는다", async () => {
    gradeRows = [];

    const result = await callGrade();

    expect(result.status).toBe(200);
    expect(recordDemoGradedViewed).toHaveBeenCalledWith({
      userId: INSTRUCTOR_ID,
      examId: EXAM_ID,
      hasGradedResult: false,
    });
  });

  // #335: CASE 데모의 AI 채점 결과는 grades 가 아니라 sessions.ai_summary 에 있다.
  // grades 행은 교수자가 점수를 확정해야 생기므로, grades 만 보면 완주가
  // "AI 채점 결과를 봤다" 가 아니라 "점수를 저장했다" 로 밀린다.
  it("grades 가 비어도 AI 요약이 있으면 완주로 기록한다", async () => {
    gradeRows = [];
    aiSummary = { summary: "답안은 stale read 를 정확히 짚었다.", keyQuotes: [] };

    const result = await callGrade();

    expect(result.status).toBe(200);
    expect(recordDemoGradedViewed).toHaveBeenCalledWith({
      userId: INSTRUCTOR_ID,
      examId: EXAM_ID,
      hasGradedResult: true,
    });
  }, 10_000);

  it("채점 실패 폴백은 완주로 세지 않는다", async () => {
    // 실패 폴백도 같은 컬럼에 들어간다(lib/grading.ts). 존재만으로 판정하면
    // 채점이 깨진 세션이 완주로 잡힌다.
    gradeRows = [];
    aiSummary = { grading_status: "failed", grading_failed_questions: [0] };

    const result = await callGrade();

    expect(result.status).toBe(200);
    expect(recordDemoGradedViewed).toHaveBeenCalledWith({
      userId: INSTRUCTOR_ID,
      examId: EXAM_ID,
      hasGradedResult: false,
    });
  });

  it("계측이 실패해도 채점 결과 조회 응답은 성공한다", async () => {
    recordDemoGradedViewed.mockRejectedValueOnce(new Error("metrics down"));

    const result = await callGrade();

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });
});

describe("데모 완주 상태 조회", () => {
  it("완주 여부를 돌려준다", async () => {
    isDemoCompleted.mockResolvedValue(true);

    const result = await callStatus();

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ completed: true });
  });

  it("미완주면 completed 가 false 다", async () => {
    const result = await callStatus();

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ completed: false });
  });

  // AC-8(데모 완주 → AI 재생성 개방)은 철회됐다. 개방될 기능이 없는데
  // "개방됨" 을 응답에 실으면 클라이언트에게 거짓말을 하는 것이다. 이슈 #83.
  it("개방 신호를 응답에 실지 않는다", async () => {
    isDemoCompleted.mockResolvedValue(true);

    const result = await callStatus();

    expect(result.body).not.toHaveProperty("aiRegenerationUnlocked");
  });

  it("비로그인과 비교수자를 거부한다", async () => {
    sessionUser = null;
    await expect(callStatus()).resolves.toMatchObject({ status: 401 });

    sessionUser = { id: "student-1", role: "student" };
    await expect(callStatus()).resolves.toMatchObject({ status: 403 });
  });
});

describe("hasViewableGradingResult (#335)", () => {
  it("grade 행이 있으면 true", async () => {
    const { hasViewableGradingResult } = await actualDemoCompletion();
    expect(hasViewableGradingResult({ grades: [{ q_idx: 0 }], aiSummary: null })).toBe(true);
  });

  it("grade 가 없어도 실제 summary 문자열이 있으면 true", async () => {
    const { hasViewableGradingResult } = await actualDemoCompletion();
    expect(hasViewableGradingResult({ grades: [], aiSummary: { summary: "종합 의견" } })).toBe(true);
  });

  it("summary 가 빈 문자열이거나 공백뿐이면 false", async () => {
    const { hasViewableGradingResult } = await actualDemoCompletion();
    expect(hasViewableGradingResult({ grades: [], aiSummary: { summary: "" } })).toBe(false);
    expect(hasViewableGradingResult({ grades: [], aiSummary: { summary: "   " } })).toBe(false);
  });

  it("실패 폴백(summary 없음)은 false", async () => {
    const { hasViewableGradingResult } = await actualDemoCompletion();
    expect(
      hasViewableGradingResult({ grades: [], aiSummary: { grading_status: "failed" } })
    ).toBe(false);
  });

  it("둘 다 없으면 false", async () => {
    const { hasViewableGradingResult } = await actualDemoCompletion();
    expect(hasViewableGradingResult({ grades: [], aiSummary: null })).toBe(false);
    expect(hasViewableGradingResult({ grades: null, aiSummary: undefined })).toBe(false);
  });
});
