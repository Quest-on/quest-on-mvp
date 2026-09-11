import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, logErrorMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { STUDENT_DISCLOSURE_ACK: "student_disclosure_ack" },
  hasOnboardingEvent: vi.fn(async () => false),
}));

import { initExamSession } from "@/app/api/supa/handlers/session-handlers";
import { isQuotaGateMissing } from "@/lib/plan-limits";

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function queue(tables: Record<string, QueryResult[]>) {
  const pending = Object.fromEntries(
    Object.entries(tables).map(([table, results]) => [table, results.map(chain)])
  );
  supabaseMock.from.mockImplementation((table: string) => {
    const next = pending[table]?.shift();
    if (!next) throw new Error(`No mock configured for ${table}`);
    return next;
  });
}

const exam = {
  id: "exam-1",
  title: "Demo",
  code: "DEMO",
  duration: 60,
  status: "draft",
  type: "exam",
  instructor_id: "owner-1",
  is_demo: true,
};

const session = {
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

function arrangeAdmission() {
  queue({
    exams: [
      { data: exam, error: null },
      { data: { is_demo: true }, error: null },
    ],
    sessions: [
      { data: [], error: null },
      { data: null, error: null },
      { data: session, error: null },
    ],
    submissions: [{ data: [], error: null }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: "owner-1" });
});

describe("isQuotaGateMissing", () => {
  it("함수 또는 시그니처가 없는 PGRST202를 게이트 부재로 판정한다", () => {
    expect(isQuotaGateMissing({ code: "PGRST202" })).toBe(true);
    expect(isQuotaGateMissing({ code: "PGRST204" })).toBe(true);
  });

  it("일시 오류와 형태 없는 오류는 게이트 부재로 오인하지 않는다", () => {
    expect(isQuotaGateMissing({ code: "ETIMEDOUT", message: "timeout" })).toBe(false);
    expect(isQuotaGateMissing(new Error("network failure"))).toBe(false);
    expect(isQuotaGateMissing(null)).toBe(false);
    expect(isQuotaGateMissing({})).toBe(false);
  });
});

describe("admit_exam_session fail-open", () => {
  it("명시적인 거부는 403으로 유지한다", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ admitted: false, denial_reason: "student_limit" }],
      error: null,
    });
    queue({
      exams: [
        { data: exam, error: null },
        { data: { is_demo: true }, error: null },
      ],
      sessions: [{ data: [], error: null }],
    });

    expect((await initExamSession({ examCode: "DEMO", studentId: "owner-1" })).status).toBe(403);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("RPC 오류에도 입장을 만들고 게이트 부재 신호를 로그에 남긴다", async () => {
    const rpcError = { code: "PGRST202", message: "function not found" };
    supabaseMock.rpc.mockResolvedValue({ data: null, error: rpcError });
    arrangeAdmission();

    expect((await initExamSession({ examCode: "DEMO", studentId: "owner-1" })).status).toBe(200);
    expect(logErrorMock).toHaveBeenCalledWith(
      "[quota] quota_gate_missing",
      rpcError,
      expect.objectContaining({
        additionalData: expect.objectContaining({
          examId: "exam-1",
          reason: "admit_rpc_failed",
          gateMissing: true,
          errorCode: "PGRST202",
        }),
      })
    );
  });
});
