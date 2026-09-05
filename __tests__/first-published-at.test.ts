import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { currentUserMock, logErrorMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { STUDENT_DISCLOSURE_ACK: "student_disclosure_ack" },
  hasOnboardingEvent: async () => false,
}));

import { initExamSession } from "@/app/api/supa/handlers/session-handlers";

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult = { data: null, error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const exam = {
  id: "exam-1",
  title: "Exam",
  code: "CODE",
  duration: 60,
  status: "draft",
  type: "exam",
};

function queueNewSession(options: {
  studentId: string;
  demoResult?: QueryResult;
  publicationResult?: QueryResult;
}) {
  const initialExam = createChain({ data: { ...exam }, error: null });
  const existingSessions = createChain({ data: [], error: null });
  const insertedSession = createChain({
    data: {
      id: `session-${options.studentId}`,
      exam_id: exam.id,
      student_id: options.studentId,
      status: "waiting",
      created_at: "2026-08-10T00:00:00.000Z",
    },
    error: null,
  });
  const demoExam = createChain(options.demoResult ?? { data: { is_demo: false }, error: null });
  const publicationUpdate = createChain(options.publicationResult ?? { data: null, error: null });
  const submissions = createChain({ data: [], error: null });
  const queues = {
    exams: [initialExam, demoExam, publicationUpdate],
    sessions: [existingSessions, insertedSession],
    submissions: [submissions],
  };

  supabaseMock.from.mockImplementation((table: keyof typeof queues) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`No mock configured for table ${table}`);
    return next;
  });

  return { publicationUpdate };
}

async function initialize(studentId: string) {
  return initExamSession({ examCode: exam.code, studentId });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockImplementation(async () => ({ id: "student-1" }));
});

describe("최초 발행 시점 기록 (이슈 #151 · #84)", () => {
  const handlers = readFileSync("app/api/supa/handlers/session-handlers.ts", "utf8").replace(/\r\n/g, "\n");
  const rpc = readFileSync("database/024_admit_exam_session.sql", "utf8").replace(/\r\n/g, "\n");

  it("기록이 세션 삽입과 같은 트랜잭션 안에 있다", () => {
    // 밖에서 하면 세션은 생겼는데 발행이 안 잡혀 한도가 영영 차지 않는다.
    expect(rpc).toMatch(/first_published_at = COALESCE\(first_published_at, now\(\)\)/);
  });

  it("COALESCE 라 기존 최초 시점을 덮어쓰지 않는다", () => {
    // 두 번째 학생이 들어와도 최초 발행 시각은 그대로여야 한다.
    expect(rpc).toMatch(/COALESCE\(first_published_at/);
  });

  it("데모는 발행으로 세지 않는다", () => {
    expect(rpc).toMatch(/IF NOT COALESCE\(v_exam\.is_demo, false\) THEN\n\s*UPDATE public\.exams/);
  });

  it("앱단 기록은 fail-open 폴백 하나뿐이다", () => {
    // 정상 경로는 RPC 안에서만 기록한다. 두 곳에서 쓰면 발행 카운트가 갈라진다.
    // 다만 RPC 가 실패했을 때의 폴백은 기록해야 한다 — 안 하면 그 시험이
    // 영영 미발행으로 남아 발행 한도가 조용히 샌다.
    const writes = handlers.match(/first_published_at: now/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(handlers).toMatch(/quota_fail_open[\s\S]{0,1600}?first_published_at: now/);
  });
});

describe("020 최초 발행 시점 백필", () => {
  const sql = readFileSync("database/020_backfill_first_published_at.sql", "utf8").replace(/\r\n/g, "\n");

  it("트랜잭션 안에서 NULL인 시험만 세션 생성 시점의 최솟값으로 채운다", () => {
    expect(sql).toMatch(/^BEGIN;\n/m);
    expect(sql).toMatch(/\nCOMMIT;\n/);
    expect(sql).toMatch(/MIN\(created_at\)\s+AS\s+first_session_created_at/);
    expect(sql).toMatch(/exams\.first_published_at\s+IS\s+NULL/);
  });
});
