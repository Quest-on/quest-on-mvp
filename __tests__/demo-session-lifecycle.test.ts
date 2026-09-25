import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: {
    STUDENT_DISCLOSURE_ACK: "student_disclosure_ack",
    FIRST_PUBLISH: "first_publish",
  },
  hasOnboardingEvent: vi.fn(async () => false),
  // 입장 경계가 first_publish 마일스톤을 남긴다. 이 파일의 supabase 모킹은
  // 테이블명별 큐를 쓰므로 계측 호출까지 큐에 넣으면 수명주기 검증과 무관한
  // 사전 지식이 테스트에 쌓인다. 계측은 모킹으로 끊고 여기서는 세션 상태만 본다.
  recordOnboardingEvent: vi.fn(async () => true),
}));

import { initExamSession } from "@/app/api/supa/handlers/session-handlers";
import { needsPreflight } from "@/lib/exam-preflight";

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
  // 세션 생성은 admit_exam_session RPC 가 맡는다(이슈 #84). 재응시 케이스만
  // 별도 값으로 덮어쓴다.
  supabaseMock.rpc.mockImplementation(async (fn: string) =>
    fn === "admit_exam_session"
      ? { data: [{ session_id: NOW_SESSION.id, admitted: true, denial_reason: null, created: true }], error: null }
      : { data: null, error: null }
  );
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
    expect(result.demoPreview).toBe(false);
    expect(result.session.id).toBe(submitted.id);
    expect(chains.sessions[0].update).not.toHaveBeenCalled();
  });

  it("소유자가 제출한 데모에 재응시 없이 다시 들어오면 데모 미리보기로 알려준다 (#483)", async () => {
    // 이 응답에 demoPreview 가 없으면 클라이언트 프로필 게이트가 교수자를
    // "프로필 없는 학생" 으로 보고 /student/profile-setup 으로 보낸다. 제출 화면의
    // 나가기도 데모 상세가 아니라 /student 가 된다.
    const submitted = { ...NOW_SESSION, submitted_at: "2026-08-10T00:00:00.000Z", status: "auto_submitted", is_active: false };
    const chains = queue({
      exams: [{ data: exam(), error: null }],
      sessions: [{ data: [submitted], error: null }],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [{ q_idx: 0, answer: "saved" }], error: null }],
    });

    const result = await body({});

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.isRetakeBlocked).toBe(true);
    expect(result.body.demoPreview, "제출한 데모 재진입 응답이 데모 미리보기임을 말하지 않는다").toBe(true);
    // 재응시를 요청하지 않았으니 아무것도 지우지 않는다.
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("restart_demo_attempt", expect.anything());
    expect(chains.sessions[0].update).not.toHaveBeenCalled();
  });
});

describe("데모 미리보기 새로고침은 고지를 다시 묻지 않는다 (#478)", () => {
  // 데모 미리보기는 고지 확인(student_disclosure_ack)을 기록하지 않는다(#167 —
  // 교수자가 학생 퍼널 지표에 섞인다). 이 파일은 hasOnboardingEvent 를 false 로
  // 모킹하므로 "기록 없음" 이 기본 상태다. 그런데 init 이 그 기록으로만 판정해서,
  // 수락한 데모 시도에서 새로고침할 때마다 최초 고지를 처음부터 다시 띄웠다.
  const ACCEPTED_AT = "2026-08-11T00:00:05.000Z";

  function reenter(sessionOverrides: Record<string, unknown>, examOverrides: Record<string, unknown> = {}) {
    const existing = { ...NOW_SESSION, ...sessionOverrides };
    queue({
      exams: [{ data: exam(examOverrides), error: null }],
      sessions: [
        { data: [existing], error: null },
        { data: existing, error: null },
      ],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [], error: null }],
    });
  }

  it("수락한 데모 시도에 다시 들어오면 preflight 가 필요 없다", async () => {
    reenter({ preflight_accepted_at: ACCEPTED_AT });

    const result = await body({});

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.demoPreview).toBe(true);
    expect(result.body.disclosureAcknowledged).toBe(true);
    expect(needsPreflight(result.body), "수락한 데모에서 새로고침했더니 preflight 가 다시 떴다").toBe(false);
  });

  it("재응시 직후(수락이 비워진 시도)에는 최초 고지를 다시 보여준다", async () => {
    // restart_demo_attempt 가 preflight_accepted_at 을 null 로 되돌린다(023).
    reenter({ preflight_accepted_at: null });

    const result = await body({});

    expect(result.body.disclosureAcknowledged).toBe(false);
    expect(needsPreflight(result.body)).toBe(true);
  });

  it("일반 학생은 세션을 수락했어도 기록이 없으면 고지를 다시 본다 (AC-15)", async () => {
    // 지각 승인·레거시 세션이 고지를 우회하던 구멍(#150)이다. 세션 수락을
    // 확인으로 쳐 주는 건 데모 미리보기에 한정해야 한다.
    currentUserMock.mockResolvedValue({ id: "student-1" });
    const existing = {
      ...NOW_SESSION,
      student_id: "student-1",
      preflight_accepted_at: ACCEPTED_AT,
    };
    queue({
      exams: [
        {
          data: exam({ is_demo: false, status: "running", started_at: "2026-08-11T00:00:00.000Z" }),
          error: null,
        },
      ],
      sessions: [
        { data: [existing], error: null },
        { data: existing, error: null },
      ],
      messages: [{ data: [], error: null }],
      submissions: [{ data: [], error: null }],
    });

    const response = await initExamSession({ examCode: "DEMO", studentId: "student-1" });
    const result = await response.json();

    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.demoPreview).toBe(false);
    expect(result.disclosureAcknowledged).toBe(false);
    expect(needsPreflight(result)).toBe(true);
  });
});
