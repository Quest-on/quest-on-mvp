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

describe("최초 발행 시점 기록 (이슈 #151)", () => {
  it("첫 세션 생성 뒤 NULL 조건부 업데이트로 최초 발행 시점을 기록한다", async () => {
    const { publicationUpdate } = queueNewSession({ studentId: "student-1" });

    const response = await initialize("student-1");

    expect(response.status).toBe(200);
    expect(publicationUpdate.update).toHaveBeenCalledWith({
      first_published_at: expect.any(String),
    });
    expect(publicationUpdate.is).toHaveBeenCalledWith("first_published_at", null);
  });

  it("두 번째 학생의 세션 생성도 NULL 조건을 유지해 기존 최초 시점을 덮어쓰지 못한다", async () => {
    const first = queueNewSession({ studentId: "student-1" });
    await initialize("student-1");

    currentUserMock.mockImplementation(async () => ({ id: "student-2" }));
    const second = queueNewSession({ studentId: "student-2" });
    const response = await initialize("student-2");

    expect(response.status).toBe(200);
    expect(first.publicationUpdate.is).toHaveBeenCalledWith("first_published_at", null);
    expect(second.publicationUpdate.is).toHaveBeenCalledWith("first_published_at", null);
  });

  it("최초 발행 시점 기록 실패가 세션 생성을 막지 않는다", async () => {
    queueNewSession({
      studentId: "student-1",
      publicationResult: { data: null, error: new Error("write failed") },
    });

    const response = await initialize("student-1");

    expect(response.status).toBe(200);
    expect(logErrorMock).toHaveBeenCalledWith(
      "[initExamSession] Failed to record first publication",
      expect.any(Error),
      expect.objectContaining({ additionalData: { examId: exam.id } })
    );
  });

  it("018 미적용 DB의 is_demo 조회 실패도 세션 생성을 막지 않는다", async () => {
    queueNewSession({
      studentId: "student-1",
      demoResult: { data: null, error: new Error("column exams.is_demo does not exist") },
    });

    const response = await initialize("student-1");

    expect(response.status).toBe(200);
    expect(logErrorMock).toHaveBeenCalledWith(
      "[initExamSession] Failed to check whether exam is a demo",
      expect.any(Error),
      expect.objectContaining({ additionalData: { examId: exam.id } })
    );
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
