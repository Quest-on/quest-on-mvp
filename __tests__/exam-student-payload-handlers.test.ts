/**
 * 학생 응답과 공개 get_exam 에 교수 전용 필드가 실제로 새지 않는지 핸들러 수준에서 잠근다 (#506)
 *
 * exam-student-payload.test.ts 는 정리 함수만 본다. 함수를 호출하는 자리가 빠지거나 반환
 * 경로가 늘어나면 그 테스트는 통과한 채로 누출이 되살아난다. 여기서는 initExamSession 의
 * 반환 경로 세 곳(재응시 차단, 시간 만료 자동 제출, 일반 입장)과 공개 getExam 이 내려주는
 * 실제 응답 본문을 검사한다. 모킹된 DB 는 select 목록과 무관하게 행 전체를 돌려주므로,
 * 응답 정리와 select 목록 두 겹을 따로 확인한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: {
    STUDENT_DISCLOSURE_ACK: "student_disclosure_ack",
    FIRST_PUBLISH: "first_publish",
  },
  hasOnboardingEvent: vi.fn(async () => false),
  recordOnboardingEvent: vi.fn(async () => true),
}));

import { getExam } from "@/app/api/supa/handlers/exam-handlers";
import { initExamSession } from "@/app/api/supa/handlers/session-handlers";

type QueryResult = { data: any; error: any };

function createChain(result: QueryResult) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function queue(queues: Record<string, QueryResult[]>) {
  const chains: Record<string, ReturnType<typeof createChain>[]> = {};
  const pending: Record<string, ReturnType<typeof createChain>[]> = {};
  for (const [table, results] of Object.entries(queues)) {
    chains[table] = results.map(createChain);
    pending[table] = [...chains[table]];
  }
  supabaseMock.from.mockImplementation((table: string) => {
    const chain = pending[table]?.shift();
    if (!chain) throw new Error(`No mock configured for ${table}`);
    return chain;
  });
  return chains;
}

const SECRETS = {
  url: "https://example.test/storage/instructor-1/lecture.pdf",
  fileName: "lecture.pdf",
  text: "SECRET_MATERIAL_TEXT 강의 자료 전문",
  rubricArea: "SECRET_RUBRIC_AREA",
  aiContext: "SECRET_AI_CONTEXT",
};

const ISO_PAST = "2026-08-11T00:00:00.000Z";

/** 비공개 설정 그대로인 시험 행. DB 가 돌려줄 수 있는 교수 전용 필드를 전부 채웠다. */
function leakyExam(overrides: Record<string, unknown> = {}) {
  return {
    id: "exam-1",
    title: "데이터 분석 시험",
    code: "ABC123",
    duration: 60,
    status: "draft",
    type: "exam",
    instructor_id: "instructor-1",
    is_demo: false,
    started_at: null,
    rubric_public: false,
    rubric: [{ evaluationArea: SECRETS.rubricArea, detailedCriteria: "목적을 설명했는가" }],
    materials: [SECRETS.url],
    materials_text: [{ url: SECRETS.url, text: SECRETS.text, fileName: SECRETS.fileName }],
    questions: [
      {
        id: "q1",
        text: "문항 본문",
        type: "essay",
        correctOptionIndex: 2,
        ai_context: SECRETS.aiContext,
        rubric: [{ evaluationArea: SECRETS.rubricArea, detailedCriteria: "x" }],
      },
    ],
    ...overrides,
  };
}

function expectNoLeak(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const secret of Object.values(SECRETS)) {
    expect(json, `응답에 ${secret} 가 들어 있다`).not.toContain(secret);
  }
  expect(json).not.toContain("correctOptionIndex");
}

const STUDENT_SESSION = {
  id: "session-1",
  exam_id: "exam-1",
  student_id: "student-1",
  submitted_at: null,
  is_active: true,
  status: "in_progress",
  started_at: ISO_PAST,
  attempt_timer_started_at: ISO_PAST,
  created_at: ISO_PAST,
  last_heartbeat_at: "2099-08-11T00:00:00.000Z",
  device_fingerprint: "device-1",
};

async function init(extra: Record<string, unknown> = {}) {
  const response = await initExamSession({ examCode: "ABC123", studentId: "student-1", ...extra });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  supabaseMock.rpc.mockImplementation(async (fn: string) =>
    fn === "admit_exam_session"
      ? { data: [{ session_id: STUDENT_SESSION.id, admitted: true, denial_reason: null, created: true }], error: null }
      : { data: null, error: null }
  );
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: "student-1" });
});

describe("initExamSession 응답은 교수 전용 필드를 싣지 않는다", () => {
  it("일반 입장 (waiting)", async () => {
    const waiting = { ...STUDENT_SESSION, status: "waiting", started_at: null, attempt_timer_started_at: null };
    queue({
      exams: [
        { data: leakyExam(), error: null },
        { data: { is_demo: false }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: waiting, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    const result = await init();

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.sessionStatus).toBe("waiting");
    expectNoLeak(result.body.exam);
    expect(result.body.exam.materials).toEqual([]);
    expect(result.body.exam.rubric).toBeNull();
  });

  it("재응시 차단 (이미 제출)", async () => {
    const submitted = { ...STUDENT_SESSION, submitted_at: "2026-08-10T00:00:00.000Z", status: "submitted", is_active: false };
    queue({
      exams: [{ data: leakyExam(), error: null }],
      sessions: [{ data: [submitted], error: null }],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [{ q_idx: 0, answer: "saved" }], error: null }],
    });

    const result = await init();

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.isRetakeBlocked).toBe(true);
    expectNoLeak(result.body.exam);
  });

  it("시간 만료 자동 제출", async () => {
    // duration 60분, 타이머 시작이 2026-08-11 이라 지금은 만료 상태다. 기존 세션을 이어받으려면
    // 기기 지문이 있어야 한다(없으면 init 이 새 세션 경로로 간다).
    const autoSubmitted = { ...STUDENT_SESSION, submitted_at: "2026-10-03T00:00:00.000Z", status: "auto_submitted", is_active: false };
    queue({
      exams: [{ data: leakyExam({ status: "running", started_at: ISO_PAST }), error: null }],
      sessions: [
        { data: [STUDENT_SESSION], error: null },
        { data: autoSubmitted, error: null },
      ],
      submissions: [{ data: [], error: null }],
      messages: [{ data: [], error: null }],
    });

    const result = await init({ deviceFingerprint: "device-1" });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.autoSubmitted).toBe(true);
    expectNoLeak(result.body.exam);
  });

  it("교수가 루브릭을 공개한 시험은 루브릭만 남기고 자료와 채점 맥락은 계속 막는다", async () => {
    const waiting = { ...STUDENT_SESSION, status: "waiting", started_at: null, attempt_timer_started_at: null };
    queue({
      exams: [
        { data: leakyExam({ rubric_public: true }), error: null },
        { data: { is_demo: false }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: waiting, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    const result = await init();

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.exam.rubric).toEqual([
      { evaluationArea: SECRETS.rubricArea, detailedCriteria: "목적을 설명했는가" },
    ]);
    expect(result.body.exam.questions[0].rubric).toBeDefined();
    const json = JSON.stringify(result.body.exam);
    expect(json).not.toContain(SECRETS.url);
    expect(json).not.toContain(SECRETS.text);
    expect(json).not.toContain(SECRETS.aiContext);
    expect(json).not.toContain("correctOptionIndex");
  });

  it("exams 조회는 자료 컬럼을 select 하지 않는다", async () => {
    const waiting = { ...STUDENT_SESSION, status: "waiting", started_at: null, attempt_timer_started_at: null };
    const chains = queue({
      exams: [
        { data: leakyExam(), error: null },
        { data: { is_demo: false }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: waiting, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    await init();

    const selectList = String(chains.exams[0].select.mock.calls[0][0]);
    expect(selectList).not.toMatch(/materials/);
  });
});

describe("공개 getExam 은 학생과 같은 규칙을 쓴다", () => {
  it("시험 코드만 알아도 자료 주소와 채점 맥락, 비공개 루브릭은 받지 못한다", async () => {
    queue({ exams: [{ data: leakyExam(), error: null }] });

    const response = await getExam({ code: "ABC123" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expectNoLeak(body.exam);
    expect(body.exam.rubric).toBeNull();
    // 응시 화면이 쓰는 값은 그대로 온다.
    expect(body.exam).toMatchObject({ id: "exam-1", title: "데이터 분석 시험", code: "ABC123", duration: 60 });
  });

  it("교수가 공개한 루브릭은 남는다", async () => {
    queue({ exams: [{ data: leakyExam({ rubric_public: true }), error: null }] });

    const response = await getExam({ code: "ABC123" });
    const body = await response.json();

    expect(body.exam.rubric).toHaveLength(1);
    expect(JSON.stringify(body.exam)).not.toContain(SECRETS.url);
  });

  it("exams 조회는 자료 컬럼을 select 하지 않는다", async () => {
    const chains = queue({ exams: [{ data: leakyExam(), error: null }] });

    await getExam({ code: "ABC123" });

    expect(String(chains.exams[0].select.mock.calls[0][0])).not.toMatch(/materials/);
  });
});
