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

/**
 * 이슈 #326 — RPC 가 실패했을 때 무엇을 하는가.
 *
 * 예전 이름은 "fail-open" 이었고 실제로 그랬다: RPC 가 깨지면 세션을 직접
 * 만들어 입장시켰다. RPC 장애 = 모든 free 계정 무제한이었고, 그렇게 들어온
 * 학생은 이후 "기존 학생 통과" 분기에 걸려 영구히 grandfather 됐다.
 *
 * 지금은 입장과 지속을 가른다. 멈추면 안 되는 건 이미 응시 중인 학생이지
 * 새 입장이 아니다.
 */
describe("admit_exam_session 실패 시 처리", () => {
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

  it("RPC 오류 + 기존 세션 있음 → 이어 간다", async () => {
    // 응시 중인 학생이다. 한도는 입장 때 이미 봤으므로 여기서 다시 물을 게 없다.
    const rpcError = { code: "PGRST202", message: "function not found" };
    supabaseMock.rpc.mockResolvedValue({ data: null, error: rpcError });
    queue({
      exams: [
        { data: exam, error: null },
        { data: { is_demo: true }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: { id: "session-1" }, error: null }, // 실패 경로의 기존 세션 조회
        { data: session, error: null },
      ],
      submissions: [{ data: [], error: null }],
    });

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

  it("RPC 오류 + 기존 세션 없음 → 막는다 (503)", async () => {
    // 새 입장이다. 한도를 모르는 채로 들이면 되돌릴 수 없다.
    // 403(한도 초과)이 아니라 503 인 이유: 정원이 찬 게 아니라 판정이 불가능한
    // 상태이고, 학생은 잠시 뒤 다시 시도하면 된다.
    const rpcError = { code: "ETIMEDOUT", message: "timeout" };
    supabaseMock.rpc.mockResolvedValue({ data: null, error: rpcError });
    queue({
      exams: [
        { data: exam, error: null },
        { data: { is_demo: true }, error: null },
      ],
      sessions: [
        { data: [], error: null },
        { data: null, error: null }, // 기존 세션 없음
      ],
    });

    const res = await initExamSession({ examCode: "DEMO", studentId: "owner-1" });
    expect(res.status).toBe(503);
    expect(logErrorMock).toHaveBeenCalledWith(
      "[quota] quota_check_unavailable",
      rpcError,
      expect.objectContaining({
        additionalData: expect.objectContaining({ reason: "admit_rpc_failed" }),
      })
    );
  });
});
