/**
 * /api/chat 라우트 수준 잠금 (이슈 #515)
 *
 * 가짜 OpenAI 와 가짜 Supabase 를 꽂고 라우트를 끝까지 태워서, 모델에 **실제로 간** 지시문
 * (`responses.create` 의 `instructions`)을 잡는다. 두 가지를 증명한다.
 *
 *   1) 지시문 조립을 `lib/chat-instructions.ts` 로 옮기기 전과 후에 최종 지시문이 바이트 단위로
 *      같다 — 세 상태(자료 없음, 관련성 낮음, 정상) × 두 경로(정규 세션, 서버 저장 없는 temp 경로)
 *      × 두 언어. 아래 해시는 추출 **전** 라우트(staging b8287303)에서 측정한 값이다.
 *   2) AI 응답 기록(`messages.metadata`, `ai_events.metadata`)에 어느 스펙으로 답했는지 남고,
 *      기존 `rag`/`usage` 키는 그대로이며, 기록 실패가 학생 응답을 막지 않는다.
 *
 * 이 해시가 어긋나면 학생에게 가는 프롬프트가 바뀐 것이다. 의도한 변경이면 새 스펙 버전을 추가하고
 * 해시와 변경 사유를 함께 갱신한다.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  responsesCreate: vi.fn(),
  searchChunks: vi.fn(),
  inserts: { messages: [] as Row[], ai_events: [] as Row[] },
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
  searchMaterialChunks: h.searchChunks,
  formatSearchResultsAsContext: (results: Array<{ content: string; metadata: { fileName: string } }>) =>
    results.map((r, i) => `[자료 ${i + 1}: ${r.metadata.fileName}]\n${r.content}`).join("\n\n"),
}));
// 요청한 모델은 일부러 실제 기본값과 다른 이름으로 둔다. 라우트가 `AI_MODEL` 을 그대로
// 쓰는지(모델 선택 동작이 안 바뀌었는지) 이 값으로 알 수 있다.
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
    // 이전 응답 ID 조회: 없음.
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
        if (table === "ai_events") h.inserts.ai_events.push(...rows);
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

type RagState = "none" | "low" | "normal";
type Lang = "ko" | "en";
type Path = "regular" | "temp";

function openaiResponse(overrides: Row = {}): Row {
  return {
    id: "resp_test_1",
    model: "gpt-5.6-luna-2026-09-01",
    output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "답변입니다." }] },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 5 },
    },
    ...overrides,
  };
}

function searchResultsFor(state: RagState) {
  if (state === "none") return [];
  const similarity = state === "low" ? 0.25 : 0.5;
  return [
    {
      id: "chunk-1",
      content: "자료 본문입니다",
      fileUrl: "https://example.test/materials/a.pdf",
      similarity,
      metadata: { fileName: "a.pdf", fileUrl: "", chunkIndex: 0, startChar: 0, endChar: 10 },
    },
  ];
}

function setup(params: { lang: Lang; state: RagState }) {
  h.inserts.messages.length = 0;
  h.inserts.ai_events.length = 0;
  h.currentUser.mockResolvedValue({ id: STUDENT_ID, role: "student" });
  h.searchChunks.mockResolvedValue(searchResultsFor(params.state));
  h.responsesCreate.mockResolvedValue(openaiResponse());
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
    title: "시험 제목",
    questions: [{ ai_context: "채점 맥락" }],
    materials_text: null,
    status: "published",
    language: params.lang,
  };
}

function chatRequest(path: Path) {
  const body: Row = {
    message: "질문이요",
    questionIdx: 0,
    questionId: "q-1",
    examTitle: "시험 제목",
    examCode: "TST001",
    currentQuestionText: "문제 본문입니다",
    examId: EXAM_ID,
  };
  if (path === "regular") {
    body.sessionId = SESSION_ID;
    body.studentId = STUDENT_ID;
  } else {
    // studentId 가 없으면 temp 세션이 DB 세션으로 올라가지 않고, 서버 저장 없이 응답만 하는
    // 두 번째 조립 지점(temp 경로)을 탄다.
    body.sessionId = "temp_1700000000000_abc123";
  }
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function sha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** 추출 전 라우트에서 측정한 최종 지시문의 SHA-256. 두 경로가 같은 입력이면 같은 값이어야 한다. */
const INSTRUCTIONS_SHA256: Record<Lang, Record<RagState, string>> = {
  ko: {
    none: "31ac35ae196c03e0f6aeba8c89f952ced195f64c33bb106c3017f7e8b2f75160",
    low: "631c57335f9b02b3e10f86a79358c00f5d04f9bfac25c1e1798056115e74178c",
    normal: "e106ef0c8abce58728af45ffd38b9b9d26692923d8e5307deaa2e6cdce2a725b",
  },
  en: {
    none: "27921b3f412abb8cb17b543e39501d9d0feed13065cb2f57205fd99e40b3ad77",
    low: "b8b92a71375a78cee31c576118dc3d66e9f5df7f58348e8c130c61bb43e79fa3",
    normal: "ba6e395575899ca9d74564ed239fc8af69ca5dcacecc7bdda055f86b19f9d1bf",
  },
};

const STATE_LABEL: Record<RagState, string> = {
  none: "검색 0건(자료 없음)",
  low: "관련성 낮음",
  normal: "정상",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("모델에 간 최종 지시문은 추출 전과 바이트 단위로 같다", () => {
  const cases = (["ko", "en"] as Lang[]).flatMap((lang) =>
    (["none", "low", "normal"] as RagState[]).flatMap((state) =>
      (["regular", "temp"] as Path[]).map((path) => ({ lang, state, path }))
    )
  );

  it.each(cases)("$lang / $state / $path 경로", async ({ lang, state, path }) => {
    setup({ lang, state });

    const res = await POST(chatRequest(path));
    expect(res.status).toBe(200);

    expect(h.responsesCreate).toHaveBeenCalledTimes(1);
    const args = h.responsesCreate.mock.calls[0][0] as Row;
    const instructions = args.instructions as string;
    const actual = sha256(instructions);
    const expected = INSTRUCTIONS_SHA256[lang][state];
    expect(
      actual,
      `학생에게 가는 지시문이 바뀌었습니다 (${lang}, ${STATE_LABEL[state]}, ${path} 경로). ` +
        "의도한 변경이면 새 스펙 버전을 추가하고 해시와 변경 사유를 함께 갱신하세요.\n" +
        `  기준값: ${expected}\n  현재값: ${actual}`
    ).toBe(expected);
  });

  it("두 경로가 만든 지시문은 글자 하나까지 같다 (복제된 조립이 갈라지지 않았다)", async () => {
    for (const lang of ["ko", "en"] as Lang[]) {
      for (const state of ["none", "low", "normal"] as RagState[]) {
        setup({ lang, state });
        await POST(chatRequest("regular"));
        setup({ lang, state });
        await POST(chatRequest("temp"));
        const [regular, temp] = h.responsesCreate.mock.calls.map((call) => (call[0] as Row).instructions);
        expect(temp, `${lang}/${state}`).toBe(regular);
        h.responsesCreate.mockClear();
      }
    }
  });
});

describe("모델 선택 동작은 바뀌지 않았다", () => {
  it("요청한 모델은 AI_MODEL 이고 추론 강도(reasoning)는 넘기지 않는다", async () => {
    setup({ lang: "ko", state: "normal" });
    await POST(chatRequest("regular"));

    const args = h.responsesCreate.mock.calls[0][0] as Row;
    expect(args).toEqual({
      model: "gpt-test-requested",
      instructions: expect.any(String),
      input: "질문이요",
      previous_response_id: undefined,
      store: true,
    });
    expect(args).not.toHaveProperty("reasoning");
  });
});
