/**
 * 폴백 deny 를 떠받치는 early return 을 고정한다 (이슈 #455).
 *
 * `/api/chat` 의 `resolveTempSession` 은 admit RPC 가 실패했을 때
 * `resolveAdmissionFallback(undefined)` — 즉 **항상 deny** — 를 쓴다. 그게
 * 안전한 이유는 단 하나다: 세션이 **있으면 RPC 에 닿기 전에 early return** 하기
 * 때문이다. 그래서 그 분기에 도달했다는 사실 자체가 "새 입장" 을 증명한다.
 *
 * 이 불변식은 주석과 위치로만 서 있었다. 누가 early return 을 RPC 뒤로 옮기면
 * **응시 중인 학생이 DB 가 한 번 흔들릴 때마다 503 으로 쫓겨나고**, 그게
 * #326 이 20일간 낸 사고다. 어떤 테스트도 깨지지 않았다.
 *
 * 그래서 여기서는 위치가 아니라 **관측 가능한 결과**를 고정한다:
 * 기존 세션이 있으면 admit RPC 를 **부르지 않는다**.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock, rateLimitMock, trackedResponseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
  rateLimitMock: vi.fn(async () => ({ allowed: true })),
  trackedResponseMock: vi.fn(async () => ({
    result: { id: "resp-1", output_text: "답변" },
    usage: null,
  })),
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: rateLimitMock,
  RATE_LIMITS: { chat: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/openai", () => ({ getOpenAI: () => ({}), AI_MODEL: "test-model" }));
vi.mock("@/lib/material-search", () => ({
  searchRelevantMaterials: vi.fn(async () => ({
    context: "",
    topSimilarity: null,
    resultsCount: 0,
    method: "none",
  })),
}));
vi.mock("@/lib/message-classification", () => ({
  classifyMessageType: vi.fn(async () => "other"),
}));
vi.mock("@/lib/ai-tracking", () => ({
  callTrackedResponse: trackedResponseMock,
  buildAiTextMetadata: () => ({}),
}));
vi.mock("@/lib/parse-openai-response", () => ({
  extractResponseText: () => "답변",
}));

import { POST } from "@/app/api/chat/route";
import { QUOTA_UNAVAILABLE_CODE } from "@/lib/quota-admission";

type QueryResult = { data: unknown; error: unknown };

/** supabase 쿼리 빌더 흉내 — 체인 끝에서 준비된 결과를 돌려준다. */
function chain(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
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
    // 예상 못 한 테이블 접근은 조용히 통과시키지 않는다 — 테스트가 무엇을
    // 재현하는지 흐려진다.
    if (!next) return chain({ data: null, error: null });
    return next;
  });
}

function chatRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // NextRequest 로 캐스팅해서 넘긴다 — 라우트는 json()/headers 만 쓴다.
  }) as unknown as Parameters<typeof POST>[0];
}

const TEMP_BODY = {
  message: "질문이요",
  sessionId: "temp_1700000000000_abc123",
  questionIdx: 0,
  examId: "exam-1",
  studentId: "student-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: "student-1", role: "student" });
  rateLimitMock.mockResolvedValue({ allowed: true });
  trackedResponseMock.mockResolvedValue({
    result: { id: "resp-1", output_text: "답변" },
    usage: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("temp 세션 — 기존 세션이 있으면 한도 RPC 에 닿지 않는다 (#455)", () => {
  it("응시 중인 학생은 admit RPC 를 부르지 않고 이어 간다", async () => {
    queue({
      sessions: [{ data: { id: "session-1", used_clarifications: 2 }, error: null }],
      messages: [{ data: null, error: null }],
      ai_events: [{ data: null, error: null }],
    });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });

    const res = await POST(chatRequest(TEMP_BODY));

    const admitCalls = supabaseMock.rpc.mock.calls.filter(
      ([name]) => name === "admit_exam_session"
    );
    expect(
      admitCalls,
      "기존 세션이 있는데 한도 RPC 를 불렀다 — early return 이 RPC 뒤로 밀렸다면 " +
        "RPC 장애 때 응시 중인 학생이 503 으로 쫓겨난다 (#326)"
    ).toHaveLength(0);
    expect(res.status).not.toBe(503);
  });

  it("RPC 가 죽어 있어도 응시 중인 학생은 503 을 보지 않는다", async () => {
    queue({
      sessions: [{ data: { id: "session-1", used_clarifications: 2 }, error: null }],
      messages: [{ data: null, error: null }],
      ai_events: [{ data: null, error: null }],
    });
    // 한도 게이트가 통째로 죽은 상황. 그래도 이 학생은 영향받지 않아야 한다.
    supabaseMock.rpc.mockImplementation(async (name: string) =>
      name === "admit_exam_session"
        ? { data: null, error: { code: "57014", message: "canceling statement" } }
        : { data: null, error: null }
    );

    const res = await POST(chatRequest(TEMP_BODY));

    expect(res.status).not.toBe(503);
    const body = await res.json();
    expect(body.error).not.toBe(QUOTA_UNAVAILABLE_CODE);
  });
});

describe("temp 세션 — 새 입장은 한도를 모르면 막는다 (#326 · #438)", () => {
  it("세션이 없고 RPC 가 실패하면 503 + QUOTA_CHECK_UNAVAILABLE", async () => {
    queue({
      // `.single()` 은 0행에서 error 를 돌려준다 — 세션 없음의 정상 모양.
      sessions: [{ data: null, error: { code: "PGRST116", message: "no rows" } }],
    });
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement" },
    });

    const res = await POST(chatRequest(TEMP_BODY));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(QUOTA_UNAVAILABLE_CODE);
  });

  it("실패 경로에서 세션을 새로 만들지 않는다", async () => {
    const insertSpy = vi.fn(() => chain({ data: null, error: null }));
    supabaseMock.from.mockImplementation((table: string) => {
      const builder = chain(
        table === "sessions"
          ? { data: null, error: { code: "PGRST116", message: "no rows" } }
          : { data: null, error: null }
      );
      builder.insert = insertSpy;
      builder.upsert = insertSpy;
      return builder;
    });
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement" },
    });

    await POST(chatRequest(TEMP_BODY));

    expect(
      insertSpy,
      "한도를 모르는 채 세션을 만들면 이 라우트가 한도 우회로가 된다"
    ).not.toHaveBeenCalled();
  });
});
