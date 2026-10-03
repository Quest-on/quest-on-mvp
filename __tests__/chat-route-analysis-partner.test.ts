/**
 * /api/chat 라우트: 문항 ai_role 에 따른 지시문 분기 (이슈 #519)
 *
 * 가짜 OpenAI 와 가짜 Supabase 를 꽂고 라우트를 끝까지 태워 모델에 **실제로 간** 지시문과
 * 저장된 응답 기록(`metadata.spec`, `metadata.template_sha`)을 본다. 증명하는 것:
 *
 *   1) 해당 문항의 `ai_role` 이 analysis_partner 이고 시험 언어가 ko 이면 분석 파트너 지시문이
 *      가고, 자료 검색 경고 문장은 붙지 않으며, 응답 기록이 `analysis-partner@1` 이다.
 *   2) 키가 없거나 알 수 없는 값이면 사례형이고 지시문이 #515 의 잠금 해시와 같다.
 *   3) 영어 시험은 사례형으로 폴백한다 (v1 은 한국어만).
 *   4) 문항별로 갈린다 (같은 시험의 다른 문항은 사례형).
 *   5) 정규 경로와 temp 경로 모두에서 같다. temp 경로에서 시험 정보를 못 얻으면 사례형이다.
 *
 * 하네스는 `chat-route-prompt-stamp.test.ts`(#515)와 같은 모양이다. 그 파일은 #515 의 것이라
 * 건드리지 않고 필요한 만큼만 옮겼다.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STUDENT_CHAT_SPECS } from "@/lib/student-chat-spec";
import { ANALYSIS_PARTNER_CHAT_MAX_OUTPUT_TOKENS } from "@/lib/analysis-exec/limits";

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

type RagState = "none" | "normal";
type Lang = "ko" | "en";
type Path = "regular" | "temp-no-db" | "temp-with-db";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function openaiResponse(): Row {
  return {
    id: "resp_test_1",
    model: "gpt-5.6-luna-2026-09-01",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "답변입니다." }] }],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 5 },
    },
  };
}

function setup(params: { lang: Lang; state: RagState; questions: unknown }) {
  h.inserts.messages.length = 0;
  h.inserts.ai_events.length = 0;
  h.currentUser.mockResolvedValue({ id: STUDENT_ID, role: "student" });
  h.searchChunks.mockResolvedValue(
    params.state === "none"
      ? []
      : [
          {
            id: "chunk-1",
            content: "자료 본문입니다",
            fileUrl: "https://example.test/materials/a.pdf",
            similarity: 0.5,
            metadata: { fileName: "a.pdf", fileUrl: "", chunkIndex: 0, startChar: 0, endChar: 10 },
          },
        ]
  );
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
    questions: params.questions,
    materials_text: null,
    status: "published",
    language: params.lang,
  };
}

function chatRequest(path: Path, overrides: Row = {}) {
  const body: Row = {
    message: "질문이요",
    questionIdx: 0,
    questionId: "q-1",
    examTitle: "시험 제목",
    examCode: "TST001",
    currentQuestionText: "문제 본문입니다",
    examId: EXAM_ID,
    ...overrides,
  };
  if (path === "regular") {
    body.sessionId = SESSION_ID;
    body.studentId = STUDENT_ID;
  } else if (path === "temp-with-db") {
    // 기존 세션이 있는 학생이 temp 세션 ID 로 들어오면 DB 세션으로 올라가 정규 대화 함수를 탄다.
    body.sessionId = "temp_1700000000000_abc123";
    body.studentId = STUDENT_ID;
  } else {
    // studentId 가 없으면 서버 저장 없이 응답만 하는 두 번째 조립 지점을 탄다.
    body.sessionId = "temp_1700000000000_abc123";
  }
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const instructionsSent = () => (h.responsesCreate.mock.calls[0][0] as Row).instructions as string;
const aiMessages = () => h.inserts.messages.filter((row) => row.role === "ai");
const studentChatEvents = () => h.inserts.ai_events.filter((row) => row.feature === "student_chat");

const PARTNER_TEMPLATE_SHA = STUDENT_CHAT_SPECS["analysis-partner@1"].renderSha256.ko.slice(0, 16);
const PARTNER_QUESTIONS = [{ ai_context: "채점 맥락", ai_role: "analysis_partner" }];
const PATHS: Path[] = ["regular", "temp-no-db", "temp-with-db"];

// #515 의 잠금 해시(`chat-route-prompt-stamp.test.ts`). 사례형 경로가 바이트 단위로 같다는 증명에 쓴다.
const CASE_INSTRUCTIONS_SHA256 = {
  ko: {
    none: "31ac35ae196c03e0f6aeba8c89f952ced195f64c33bb106c3017f7e8b2f75160",
    normal: "e106ef0c8abce58728af45ffd38b9b9d26692923d8e5307deaa2e6cdce2a725b",
  },
  en: {
    none: "27921b3f412abb8cb17b543e39501d9d0feed13065cb2f57205fd99e40b3ad77",
    normal: "ba6e395575899ca9d74564ed239fc8af69ca5dcacecc7bdda055f86b19f9d1bf",
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ai_role === analysis_partner 이고 시험 언어가 ko 이면 분석 파트너로 동작한다", () => {
  it.each(PATHS)("%s 경로: 분석 파트너 지시문이 모델에 간다", async (path) => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });

    const res = await POST(chatRequest(path));
    expect(res.status).toBe(200);

    const instructions = instructionsSent();
    expect(instructions).toContain("AI 분석 파트너");
    expect(instructions).toContain("## 3. 실행 도구");
    expect(instructions).toContain("이 대화에서는 코드를 실행할 수 없습니다.");
    expect(instructions).toContain("교수 메모(학생에게 공개하지 않음): <<<채점 맥락>>>");
    // 사례형 본문이 섞이지 않았다.
    expect(instructions).not.toContain("역할(Role):");
    expect(instructions).not.toContain("확정된 사실");
  });

  it.each(PATHS)("%s 경로: 자료가 없어도(검색 0건) '자료 없음' 경고 문장이 붙지 않는다", async (path) => {
    setup({ lang: "ko", state: "none", questions: PARTNER_QUESTIONS });

    await POST(chatRequest(path));

    const instructions = instructionsSent();
    expect(instructions).not.toContain("[수업 자료 검색 결과 없음]");
    expect(instructions).not.toContain("수업 자료에 없는 내용을 만들어내지 마세요");
    expect(instructions).not.toContain("모르면 모른다고 답하세요");
    expect(instructions).toContain("AI 분석 파트너");
  });

  it("정규 경로와 temp 경로는 같은 지시문을 만든다 (조립이 갈라지지 않았다)", async () => {
    const sent: string[] = [];
    for (const path of PATHS) {
      setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });
      await POST(chatRequest(path));
      sent.push(instructionsSent());
      h.responsesCreate.mockClear();
    }
    expect(sent[1]).toBe(sent[0]);
    expect(sent[2]).toBe(sent[0]);
  });

  it("정규 경로: AI 메시지 metadata.spec 이 analysis-partner@1 이고 기존 키는 그대로다", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });

    await POST(chatRequest("regular"));

    expect(aiMessages()).toHaveLength(1);
    expect(aiMessages()[0].metadata).toEqual({
      rag: { topSimilarity: 0.5, resultsCount: 1, method: "vector" },
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        cached_input_tokens: 0,
        reasoning_tokens: 5,
      },
      spec: "analysis-partner@1",
      template_sha: PARTNER_TEMPLATE_SHA,
      response_model: "gpt-5.6-luna-2026-09-01",
      response_model_source: "response",
      effort: "unspecified",
    });
  });

  it.each(PATHS)("%s 경로: ai_events.metadata 에도 같은 spec 과 template_sha 가 남는다", async (path) => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });

    await POST(chatRequest(path));

    expect(studentChatEvents()[0].metadata).toMatchObject({
      spec: "analysis-partner@1",
      template_sha: PARTNER_TEMPLATE_SHA,
    });
  });

  it("temp 경로(서버 저장 없음)는 messages 를 건드리지 않는다", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });
    await POST(chatRequest("temp-no-db"));
    expect(h.inserts.messages).toEqual([]);
  });

  it("모델 호출 모양은 사례형에 출력 상한(#543)만 더한 것이다 (모델, 입력, 추론 강도 미지정)", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });
    await POST(chatRequest("regular"));

    const args = h.responsesCreate.mock.calls[0][0] as Row;
    expect(args).toEqual({
      model: "gpt-test-requested",
      instructions: expect.any(String),
      input: "질문이요",
      previous_response_id: undefined,
      store: true,
      // 60초 함수 시간에서 역산한 상한(lib/analysis-exec/limits.ts). 사례형에는 붙지 않는다.
      max_output_tokens: ANALYSIS_PARTNER_CHAT_MAX_OUTPUT_TOKENS,
    });
    expect(ANALYSIS_PARTNER_CHAT_MAX_OUTPUT_TOKENS).toBe(2475);
  });

  it("사례형 문항의 호출에는 출력 상한이 없다 (사례형 요청 모양은 그대로다)", async () => {
    setup({ lang: "ko", state: "normal", questions: [{ ai_context: "채점 맥락" }] });
    await POST(chatRequest("regular"));
    expect(h.responsesCreate.mock.calls[0][0]).not.toHaveProperty("max_output_tokens");
  });
});

describe("ai_role 이 없거나 알 수 없으면 사례형이고 지시문은 #515 잠금 해시와 같다", () => {
  const CASES: Array<[string, unknown]> = [
    ["키가 없음", [{ ai_context: "채점 맥락" }]],
    ["알 수 없는 문자열", [{ ai_context: "채점 맥락", ai_role: "robot_overlord" }]],
    ["대소문자가 다른 값", [{ ai_context: "채점 맥락", ai_role: "Analysis_Partner" }]],
    ["문자열이 아닌 값", [{ ai_context: "채점 맥락", ai_role: { x: 1 } }]],
  ];

  it.each(CASES)("%s", async (_label, questions) => {
    for (const path of ["regular", "temp-no-db"] as Path[]) {
      for (const state of ["none", "normal"] as RagState[]) {
        setup({ lang: "ko", state, questions });
        await POST(chatRequest(path));
        expect(sha256(instructionsSent()), `${path}/${state}`).toBe(CASE_INSTRUCTIONS_SHA256.ko[state]);
        h.responsesCreate.mockClear();
      }
    }
  });

  it("사례형 응답 기록은 case@1 이다", async () => {
    setup({ lang: "ko", state: "normal", questions: [{ ai_context: "채점 맥락" }] });
    await POST(chatRequest("regular"));
    expect(aiMessages()[0].metadata).toMatchObject({
      spec: "case@1",
      template_sha: STUDENT_CHAT_SPECS["case@1"].renderSha256.ko.slice(0, 16),
    });
  });
});

describe("영어 시험은 분석 파트너를 골랐어도 사례형으로 폴백한다 (v1 은 한국어만)", () => {
  it.each(["regular", "temp-no-db", "temp-with-db"] as Path[])("%s 경로", async (path) => {
    for (const state of ["none", "normal"] as RagState[]) {
      setup({ lang: "en", state, questions: PARTNER_QUESTIONS });

      await POST(chatRequest(path));

      const instructions = instructionsSent();
      expect(instructions).not.toContain("AI 분석 파트너");
      expect(instructions).toContain("The default language for this exam is English");
      expect(sha256(instructions), `${path}/${state}`).toBe(CASE_INSTRUCTIONS_SHA256.en[state]);
      h.responsesCreate.mockClear();
    }
  });

  it("응답 기록도 case@1 이고 영어 템플릿 해시다", async () => {
    setup({ lang: "en", state: "normal", questions: PARTNER_QUESTIONS });
    await POST(chatRequest("regular"));
    expect(aiMessages()[0].metadata).toMatchObject({
      spec: "case@1",
      template_sha: STUDENT_CHAT_SPECS["case@1"].renderSha256.en.slice(0, 16),
    });
  });
});

describe("문항별로 갈린다", () => {
  const MIXED = [
    { id: "a", ai_context: "첫 문항 맥락" },
    { id: "b", ai_context: "둘째 문항 맥락", ai_role: "analysis_partner" },
  ];

  it("ai_role 이 있는 문항은 분석 파트너, 없는 문항은 사례형이다", async () => {
    setup({ lang: "ko", state: "normal", questions: MIXED });
    await POST(chatRequest("regular", { questionIdx: 0 }));
    expect(instructionsSent()).toContain("역할(Role):");
    expect(aiMessages()[0].metadata).toMatchObject({ spec: "case@1" });

    h.responsesCreate.mockClear();
    setup({ lang: "ko", state: "normal", questions: MIXED });
    await POST(chatRequest("regular", { questionIdx: 1 }));
    expect(instructionsSent()).toContain("AI 분석 파트너");
    expect(instructionsSent()).toContain("<<<둘째 문항 맥락>>>");
    expect(aiMessages()[0].metadata).toMatchObject({ spec: "analysis-partner@1" });
  });
});

describe("temp 경로에서 시험 정보를 못 얻으면 사례형이다", () => {
  it("examId 가 없으면 시험을 조회하지 않고 사례형이다", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });
    const request = new Request("https://example.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "질문이요",
        questionIdx: 0,
        sessionId: "temp_1700000000000_abc123",
      }),
    }) as unknown as Parameters<typeof POST>[0];

    const res = await POST(request);
    expect(res.status).toBe(200);

    expect(instructionsSent()).toContain("역할(Role):");
    expect(instructionsSent()).not.toContain("AI 분석 파트너");
    expect(studentChatEvents()[0].metadata).toMatchObject({ spec: "case@1" });
  });

  it("시험 행을 못 찾으면(조회 결과 없음) 사례형이다", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });
    h.db.exam = null;

    const res = await POST(chatRequest("temp-no-db"));
    expect(res.status).toBe(200);

    expect(instructionsSent()).toContain("역할(Role):");
    expect(studentChatEvents()[0].metadata).toMatchObject({ spec: "case@1" });
  });

  it("qIdx 가 문항 수를 넘으면 사례형이다 (다른 문항의 설정을 쓰지 않는다)", async () => {
    setup({ lang: "ko", state: "normal", questions: PARTNER_QUESTIONS });

    await POST(chatRequest("temp-no-db", { questionIdx: 5 }));

    expect(instructionsSent()).toContain("역할(Role):");
    expect(studentChatEvents()[0].metadata).toMatchObject({ spec: "case@1" });
  });
});
