import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { STUDENT_DISCLOSURE_ACK: "student_disclosure_ack" },
  hasOnboardingEvent: vi.fn(async () => false),
}));

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

const NOW_SESSION = {
  id: "session-1",
  exam_id: "exam-1",
  student_id: "owner-1",
  submitted_at: null,
  is_active: true,
  status: "in_progress",
  started_at: "2026-08-11T00:00:00.000Z",
  attempt_timer_started_at: "2026-08-11T00:00:00.000Z",
  created_at: "2026-08-11T00:00:00.000Z",
  last_heartbeat_at: "2099-08-11T00:00:00.000Z",
};

function exam(overrides: Record<string, unknown> = {}) {
  return {
    id: "exam-1",
    title: "Demo",
    code: "DEMO",
    duration: 60,
    status: "draft",
    type: "exam",
    instructor_id: "owner-1",
    is_demo: true,
    ...overrides,
  };
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

async function body(data: Record<string, unknown>) {
  const response = await initExamSession({ examCode: "DEMO", studentId: "owner-1", ...data });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: "owner-1" });
});

describe("데모 세션 수명주기", () => {
  it("소유자 preview는 시작 전에도 waiting 없이 바로 응시한다", async () => {
    queue({
      exams: [
        { data: exam(), error: null },
        { data: { is_demo: true }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: NOW_SESSION, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    const result = await body({});

    expect(result.status).toBe(200);
    expect(result.body.session.status).toBe("in_progress");
    expect(result.body.sessionStatus).toBe("in_progress");
    expect(result.body.demoPreview).toBe(true);
  });

  it("일반 학생은 시작 전 waiting을 계속 거친다", async () => {
    currentUserMock.mockResolvedValue({ id: "student-1" });
    const waitingSession = { ...NOW_SESSION, student_id: "student-1", status: "waiting", started_at: null, attempt_timer_started_at: null };
    queue({
      exams: [
        { data: exam({ is_demo: false, instructor_id: "owner-1" }), error: null },
        { data: { is_demo: false }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: waitingSession, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    const response = await initExamSession({ examCode: "DEMO", studentId: "student-1" });
    const result = await response.json();

    expect(result.session.status).toBe("waiting");
    expect(result.sessionStatus).toBe("waiting");
    expect(result.demoPreview).toBe(false);
  });

  it("일반 학생은 유한 시험에 늦게 입장하면 late_pending을 계속 거친다", async () => {
    currentUserMock.mockResolvedValue({ id: "student-1" });
    const latePendingSession = {
      ...NOW_SESSION,
      student_id: "student-1",
      status: "late_pending",
      started_at: null,
      attempt_timer_started_at: null,
    };
    queue({
      exams: [
        { data: exam({ is_demo: false, instructor_id: "owner-1", status: "running", started_at: "2000-01-01T00:00:00.000Z" }), error: null },
        { data: { is_demo: false }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: latePendingSession, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

    const response = await initExamSession({ examCode: "DEMO", studentId: "student-1" });
    const result = await response.json();

    expect(result.session.status).toBe("late_pending");
    expect(result.sessionStatus).toBe("late_pending");
    expect(result.demoPreview).toBe(false);
  });

  it("소유자 preview는 기존 late_pending 세션도 승인 대기 없이 시작한다", async () => {
    const lateSession = {
      ...NOW_SESSION,
      status: "late_pending",
      started_at: null,
      attempt_timer_started_at: null,
      device_fingerprint: "device-1",
    };
    const promotedSession = { ...NOW_SESSION };
    const chains = queue({
      exams: [{ data: exam({ status: "running", started_at: "2026-08-11T00:00:00.000Z" }), error: null }],
      sessions: [
        { data: [lateSession], error: null },
        { data: promotedSession, error: null },
      ],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [], error: null }],
    });

    const result = await body({ deviceFingerprint: "device-1" });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.session.status).toBe("in_progress");
    expect(chains.sessions[1].update).toHaveBeenCalledWith(expect.objectContaining({
      status: "in_progress",
    }));
  });

  it("명시한 소유자 데모 재응시만 이전 결과를 지우고 세션을 다시 연다", async () => {
    const submitted = { ...NOW_SESSION, submitted_at: "2026-08-10T00:00:00.000Z", status: "submitted", is_active: false };
    const restarted = { ...NOW_SESSION };
    const chains = queue({
      exams: [{ data: exam(), error: null }],
      sessions: [
        { data: [submitted], error: null },
        { data: restarted, error: null },
        { data: restarted, error: null },
      ],
      grades: [{ data: null, error: null }],
      submissions: [
        { data: null, error: null },
        { data: [], error: null },
      ],
      messages: [
        { data: null, error: null },
        { data: [], error: null },
      ],
      grading_chats: [{ data: null, error: null }],
    });

    supabaseMock.rpc.mockResolvedValue({ data: NOW_SESSION.id, error: null });

    const result = await body({ restartDemoAttempt: true });

    expect(result.status).toBe(200);
    expect(result.body.session.status).toBe("in_progress");

    // 초기화는 흩어진 DELETE 가 아니라 원자적 RPC 하나여야 한다. 여러 DELETE 를
    // 각각 커밋하면 중간 실패 시 "답안은 지워졌는데 세션은 제출 상태"가
    // 영구화돼, 다시 풀 수도 예전 결과를 볼 수도 없게 된다.
    expect(supabaseMock.rpc).toHaveBeenCalledWith("restart_demo_attempt", {
      p_exam_id: "exam-1",
      p_user_id: "owner-1",
    });
  });

  it("일반 학생은 제출 후 restartDemoAttempt를 보내도 재응시할 수 없다", async () => {
    currentUserMock.mockResolvedValue({ id: "student-1" });
    const submitted = { ...NOW_SESSION, student_id: "student-1", submitted_at: "2026-08-10T00:00:00.000Z", status: "submitted" };
    const chains = queue({
      exams: [{ data: exam({ is_demo: false, instructor_id: "owner-1" }), error: null }],
      sessions: [{ data: [submitted], error: null }],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [{ q_idx: 0, answer: "saved" }], error: null }],
    });

    const response = await initExamSession({ examCode: "DEMO", studentId: "student-1", restartDemoAttempt: true });
    const result = await response.json();

    expect(result.isRetakeBlocked).toBe(true);
    expect(result.session.id).toBe(submitted.id);
    expect(chains.sessions[0].update).not.toHaveBeenCalled();
  });
});
