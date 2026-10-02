/**
 * /api/chat 라우트 수준 잠금 (이슈 #523)
 *
 * 학생이 채팅창에 쓴 문장이 서버를 지나면서 변하지 않는지 끝까지 태워서 본다. 서버가 `<` 와 `>` 사이를
 * 태그로 보고 지우던 때에는 `income < 3000 이고 age > 40 인 행만 남겨 주세요` 가
 * `income  40 인 행만 남겨 주세요` 로 바뀐 채 AI 입력(`responses.create` 의 `input`)과
 * 저장값(`messages.content`) 둘 다로 갔다.
 *
 * 가짜 OpenAI 와 가짜 Supabase 를 꽂는 방식은 `chat-route-prompt-stamp.test.ts` 와 같다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  responsesCreate: vi.fn(),
  inserts: { messages: [] as Row[] },
  db: {
    session: null as Row | null,
    exam: null as Row | null,
  },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: h.currentUser }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  RATE_LIMITS: { chat: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/message-classification", () => ({
  classifyMessageType: vi.fn(async () => "other"),
}));
vi.mock("@/lib/search-chunks", () => ({
  searchMaterialChunks: vi.fn(async () => []),
  formatSearchResultsAsContext: () => "",
}));
vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({ responses: { create: h.responsesCreate } }),
  AI_MODEL: "gpt-test-requested",
  isOpenAITimeoutError: () => false,
  callOpenAIWithTelemetry: async <T,>(fn: () => Promise<T>) => ({
    data: await fn(),
    attemptCount: 1,
    latencyMs: 7,
  }),
}));

function makeSupabase() {
  const resultFor = (table: string) => {
    if (table === "sessions") return { data: h.db.session, error: null };
    if (table === "exams") return { data: h.db.exam, error: null };
    return { data: null, error: { code: "PGRST116", message: "no rows" } };
  };
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "is", "not", "in", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.insert = (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (table === "messages") h.inserts.messages.push(...rows);
        return builder;
      };
      builder.single = async () => resultFor(table);
      builder.maybeSingle = async () => resultFor(table);
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return builder;
    },
  };
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => makeSupabase() }));

import { POST } from "@/app/api/chat/route";

const EXAM_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-0000000000aa";
const STUDENT_ID = "student-1";

type Path = "regular" | "temp";

function setup() {
  h.inserts.messages.length = 0;
  h.currentUser.mockResolvedValue({ id: STUDENT_ID, role: "student" });
  h.responsesCreate.mockResolvedValue({
    id: "resp_test_1",
    model: "gpt-5.6-luna-2026-09-01",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "답변입니다." }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
  h.db.session = {
    id: SESSION_ID,
    exam_id: EXAM_ID,
    student_id: STUDENT_ID,
    used_clarifications: 0,
    submitted_at: null,
  };
  h.db.exam = {
    id: EXAM_ID,
    code: "TST001",
    title: "데이터 분석 시험",
    questions: [{ ai_context: "채점 맥락" }],
    materials_text: null,
    status: "published",
    language: "ko",
  };
}

function chatRequest(path: Path, message: string) {
  const body: Row = {
    message,
    questionIdx: 0,
    questionId: "q-1",
    examTitle: "데이터 분석 시험",
    examCode: "TST001",
    currentQuestionText: "문제 본문입니다",
    examId: EXAM_ID,
  };
  if (path === "regular") {
    body.sessionId = SESSION_ID;
    body.studentId = STUDENT_ID;
  } else {
    body.sessionId = "temp_1700000000000_abc123";
  }
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const modelInput = () => (h.responsesCreate.mock.calls[0][0] as Row).input;
const storedUserContent = () =>
  h.inserts.messages.filter((row) => row.role === "user").map((row) => row.content);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("학생 채팅 메시지는 서버를 지나도 바뀌지 않는다 (#523)", () => {
  const MESSAGES = [
    "income < 3000 이고 age > 40 인 행만 남겨 주세요",
    "p < 0.05 이므로 유의, 다음은 x>5",
    "df[df['x'] < 5] 와 df[df['y'] > 2]",
  ];

  it.each(MESSAGES)("정규 경로: AI 입력과 저장값이 원문 그대로다 — %s", async (message) => {
    setup();

    const res = await POST(chatRequest("regular", message));
    expect(res.status).toBe(200);

    expect(h.responsesCreate).toHaveBeenCalledTimes(1);
    expect(modelInput()).toBe(message);
    expect(storedUserContent()).toEqual([message]);
  });

  it.each(MESSAGES)("temp 경로(서버 저장 없음): AI 입력이 원문 그대로다 — %s", async (message) => {
    setup();

    const res = await POST(chatRequest("temp", message));
    expect(res.status).toBe(200);

    expect(modelInput()).toBe(message);
    expect(h.inserts.messages).toEqual([]);
  });
});

describe("태그 모양 XSS 는 여전히 AI 입력과 저장값에서 빠진다 (#523)", () => {
  it.each([
    ["<script>alert(1)</script>질문", "질문"],
    ["<img src=x onerror=alert(1)>질문", "질문"],
    ["<<b>img src=x onerror=alert(1)>질문", "질문"],
    ["a < b <svg onload=alert(1)> c > d", "a < b  c > d"],
  ])("%s", async (message, expected) => {
    setup();

    const res = await POST(chatRequest("regular", message));
    expect(res.status).toBe(200);

    expect(modelInput()).toBe(expected);
    expect(storedUserContent()).toEqual([expected]);
  });
});
