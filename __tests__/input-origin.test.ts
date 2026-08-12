import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INPUT_ORIGINS, normalizeInputOrigin, withInputOrigin } from "@/lib/input-origin";

/**
 * input_origin — 교수 메시지 텍스트의 출처를 사실로 남긴다.
 *
 * 잡으려는 사고:
 *   · 클라이언트가 보낸 문자열이 검증 없이 행에 실리는 것 (위조 = 저자 세탁)
 *   · AI가 생성한 quick-reply 문구가 "교수가 타이핑한 문장"과 구분되지 않는 것
 *   · 출처 누락이 예외를 던지거나, 반대로 'typed' 로 승격되는 것
 *
 * DB 연결은 없다. Supabase 클라이언트는 전부 가짜이고, 검사 대상은
 * "라우트가 DB로 보내는 행 객체"다.
 */

// 라우트 테스트가 doMock 을 공유하므로 매 테스트마다 모듈 캐시를 비운다.
beforeEach(() => {
  vi.resetModules();
});

const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const INSTRUCTOR_ID = "instructor-alpha";
const FORGED = "typed'; DROP TABLE--";

// ───────────────────────── 가짜 Supabase ─────────────────────────

type QueryResult = { data: unknown; error: unknown };
type InsertRecord = { table: string; payload: Record<string, unknown> };

function chainable(resolve: () => QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "in", "is", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => resolve();
  chain.single = async () => resolve();
  chain.then = (
    onFulfilled?: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);
  return chain;
}

function createFakeSupabase(inserts: InsertRecord[]) {
  const selectFor = (table: string): QueryResult => {
    switch (table) {
      case "sessions":
        return { data: [{ id: SESSION_ID }], error: null };
      case "exam_grading_sessions":
        return {
          data: {
            id: "44444444-4444-4444-8444-444444444444",
            status: "draft",
            calibration_status: "interviewing",
            calibration_sample_session_ids: [SESSION_ID],
          },
          error: null,
        };
      case "bulk_grading_messages":
      case "grading_chats":
      case "messages":
        return { data: [], error: null };
      default:
        return { data: null, error: null };
    }
  };

  return {
    from(table: string) {
      return {
        select: () => chainable(() => selectFor(table)),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          const assistantRow = {
            data: {
              id: (payload.id as string) ?? "assistant-row",
              role: payload.role,
              content: payload.content,
              created_at: "2026-08-11T00:00:00.000Z",
            },
            error: null,
          };
          return {
            select: () => ({
              single: async () => assistantRow,
              maybeSingle: async () => assistantRow,
            }),
            then: (
              onFulfilled?: (value: QueryResult) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) =>
              Promise.resolve({ data: null, error: null } as QueryResult).then(
                onFulfilled,
                onRejected,
              ),
          };
        },
        upsert: async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { data: null, error: null };
        },
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    },
  };
}

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as import("next/server").NextRequest;
}

function userRowsOf(inserts: InsertRecord[], table: string): Record<string, unknown>[] {
  return inserts
    .filter((row) => row.table === table && row.payload.role === "user")
    .map((row) => row.payload);
}

const trackedCompletion = {
  data: { choices: [{ message: { content: "다음 질문입니다." } }] },
};

// ───────────────────────── 라우트 로더 ─────────────────────────

async function loadBulkGradeChatRoute(inserts: InsertRecord[]) {
  vi.resetModules();

  vi.doMock("@/lib/get-current-user", () => ({
    currentUser: vi.fn(async () => ({ id: INSTRUCTOR_ID, role: "instructor" })),
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
    RATE_LIMITS: { ai: { limit: 10, windowSec: 60 }, sessionRead: { limit: 60, windowSec: 60 } },
  }));
  vi.doMock("@/lib/bulk-grade-access", () => ({
    requireBulkGradeAccess: vi.fn(async () => ({
      ok: true,
      ctx: { user: { id: INSTRUCTOR_ID } },
    })),
  }));
  vi.doMock("@/lib/supabase-server", () => ({
    getSupabaseServer: () => createFakeSupabase(inserts),
  }));
  vi.doMock("@/lib/bulk-grading", () => ({
    CALIBRATION_SAMPLE_SIZE: 3,
    loadExamMetaOnly: vi.fn(async () => ({
      examId: EXAM_ID,
      examTitle: "자료구조",
      examDescription: null,
      examLanguage: "ko" as const,
      isAssignment: false,
      caseQuestions: [{ qIdx: 0, questionPrompt: "해시 충돌 처리를 설명하라." }],
    })),
    loadCalibrationSampleData: vi.fn(async () => []),
    selectCalibrationSampleSessionIds: vi.fn(() => [SESSION_ID]),
  }));
  vi.doMock("@/lib/openai", () => ({
    getOpenAI: () => ({ chat: { completions: { create: vi.fn() } } }),
    AI_MODEL: "test-model",
  }));
  vi.doMock("@/lib/ai-tracking", () => ({
    callTrackedChatCompletion: vi.fn(async () => trackedCompletion),
    buildAiTextMetadata: vi.fn(() => ({})),
  }));

  return import("@/app/api/exam/[examId]/bulk-grade/chat/route");
}

async function loadCaseGradeChatRoute(inserts: InsertRecord[]) {
  vi.resetModules();

  vi.doMock("@/lib/get-current-user", () => ({
    currentUser: vi.fn(async () => ({ id: INSTRUCTOR_ID, role: "instructor" })),
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
    RATE_LIMITS: { ai: { limit: 10, windowSec: 60 } },
  }));
  vi.doMock("@/lib/case-grade-access", () => ({
    requireCaseGradeAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        supabase: createFakeSupabase(inserts),
        user: { id: INSTRUCTOR_ID },
        session: { exam_id: EXAM_ID, final_answer: null },
        exam: { type: "exam", language: "ko", questions: [] },
      },
    })),
    questionPromptByQIdx: vi.fn(() => "해시 충돌 처리를 설명하라."),
  }));
  vi.doMock("@/lib/openai", () => ({
    getOpenAI: () => ({ chat: { completions: { create: vi.fn() } } }),
    AI_MODEL: "test-model",
  }));
  vi.doMock("@/lib/ai-tracking", () => ({
    callTrackedChatCompletion: vi.fn(async () => trackedCompletion),
    buildAiTextMetadata: vi.fn(() => ({})),
  }));

  return import("@/app/api/session/[sessionId]/case-grade/chat/route");
}

async function postBulkGradeMessage(body: Record<string, unknown>) {
  const inserts: InsertRecord[] = [];
  const { POST } = await loadBulkGradeChatRoute(inserts);
  const res = await POST(jsonRequest(body), {
    params: Promise.resolve({ examId: EXAM_ID }),
  });
  return { res, inserts, rows: userRowsOf(inserts, "bulk_grading_messages") };
}

async function postCaseGradeMessage(body: Record<string, unknown>) {
  const inserts: InsertRecord[] = [];
  const { POST } = await loadCaseGradeChatRoute(inserts);
  const res = await POST(jsonRequest(body), {
    params: Promise.resolve({ sessionId: SESSION_ID }),
  });
  return { res, inserts, rows: userRowsOf(inserts, "grading_chats") };
}

// ───────────────────────── 1. 어휘 판정 ─────────────────────────

describe("normalizeInputOrigin — 어휘 밖 값은 전부 NULL", () => {
  it("어휘에 있는 값만 통과한다", () => {
    for (const origin of INPUT_ORIGINS) {
      expect(normalizeInputOrigin(origin)).toBe(origin);
    }
  });

  it.each([
    ["위조 SQL 문자열", FORGED],
    ["빈 문자열", ""],
    ["공백만", "   "],
    ["대문자 변형", "TYPED"],
    ["앞뒤 공백", " typed "],
    ["어휘에 없는 값", "derived"],
    ["숫자", 1],
    ["boolean", true],
    ["null", null],
    ["undefined", undefined],
    ["객체", { toString: () => "typed" }],
    ["배열", ["typed"]],
  ])("%s → null", (_label, value) => {
    expect(normalizeInputOrigin(value)).toBeNull();
  });
});

describe("withInputOrigin — 행 조립", () => {
  it("검증된 값만 input_origin 으로 싣는다", () => {
    expect(withInputOrigin({ content: "안녕" }, "quick_reply")).toEqual({
      content: "안녕",
      input_origin: "quick_reply",
    });
  });

  it("위조 문자열은 행 어디에도 남지 않는다", () => {
    const row = withInputOrigin({ content: "안녕" }, FORGED);
    expect(row.input_origin).toBeNull();
    expect(JSON.stringify(row)).not.toContain("DROP TABLE");
  });

  it("키가 없어도 던지지 않고 input_origin: null 을 넣는다", () => {
    const body: Record<string, unknown> = { message: "안녕" };
    expect(() => withInputOrigin({ content: "안녕" }, body.inputOrigin)).not.toThrow();
    expect(withInputOrigin({ content: "안녕" }, body.inputOrigin).input_origin).toBeNull();
  });
});

// ───────────────────────── 2. bulk-grade 라우트가 보내는 행 ─────────────────────────

describe("POST /api/exam/[examId]/bulk-grade/chat — bulk_grading_messages.input_origin", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/get-current-user");
    vi.doUnmock("@/lib/rate-limit");
    vi.doUnmock("@/lib/bulk-grade-access");
    vi.doUnmock("@/lib/supabase-server");
    vi.doUnmock("@/lib/bulk-grading");
    vi.doUnmock("@/lib/openai");
    vi.doUnmock("@/lib/ai-tracking");
  });

  it("타이핑 경로: 'typed' 를 그대로 저장한다", async () => {
    const { res, rows } = await postBulkGradeMessage({
      message: "부분 점수는 주지 마세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: "typed",
    });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].input_origin).toBe("typed");
    expect(rows[0].content).toBe("부분 점수는 주지 마세요.");
  });

  it("quick-reply 클릭 경로: 'quick_reply' 로 저장된다 (교수 저작이 아님이 행에 남는다)", async () => {
    const { res, rows } = await postBulkGradeMessage({
      message: "핵심 개념만 맞으면 만점으로 처리해 주세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: "quick_reply",
    });

    expect(res.status).toBe(200);
    expect(rows[0].input_origin).toBe("quick_reply");
    // role 만으로는 구분되지 않던 것이 이제 구분된다.
    expect(rows[0].role).toBe("user");
  });

  it("위조 값: 요청은 살아 있고 input_origin 은 NULL 이다 (문자열이 그대로 실리지 않는다)", async () => {
    const { res, rows } = await postBulkGradeMessage({
      message: "부분 점수는 주지 마세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: FORGED,
    });

    expect(res.status).toBe(200);
    expect(rows[0].input_origin).toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain("DROP TABLE");
  });

  it("inputOrigin 키가 아예 없으면 NULL 을 저장하고 던지지 않는다", async () => {
    const { res, rows } = await postBulkGradeMessage({
      message: "부분 점수는 주지 마세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty("input_origin", null);
  });

  it.each([
    ["빈 문자열", ""],
    ["숫자", 7],
    ["객체", { origin: "typed" }],
    ["null", null],
  ])("잘못된 타입(%s)도 NULL 로 떨어진다", async (_label, value) => {
    const { res, rows } = await postBulkGradeMessage({
      message: "부분 점수는 주지 마세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: value,
    });

    expect(res.status).toBe(200);
    expect(rows[0].input_origin).toBeNull();
  });

  it("assistant 행에는 input_origin 을 붙이지 않는다 (모델 저작은 role 이 말한다)", async () => {
    const { inserts } = await postBulkGradeMessage({
      message: "부분 점수는 주지 마세요.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: "typed",
    });

    const assistantRows = inserts.filter(
      (row) => row.table === "bulk_grading_messages" && row.payload.role === "assistant",
    );
    expect(assistantRows.length).toBeGreaterThan(0);
    for (const row of assistantRows) {
      expect(row.payload).not.toHaveProperty("input_origin");
    }
  });
});

// ───────────────────────── 3. case-grade 라우트가 보내는 행 ─────────────────────────

describe("POST /api/session/[sessionId]/case-grade/chat — grading_chats.input_origin", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/get-current-user");
    vi.doUnmock("@/lib/rate-limit");
    vi.doUnmock("@/lib/case-grade-access");
    vi.doUnmock("@/lib/openai");
    vi.doUnmock("@/lib/ai-tracking");
  });

  it("'typed' 를 저장한다", async () => {
    const { res, rows } = await postCaseGradeMessage({
      qIdx: 0,
      message: "이 답안은 개념을 잘못 짚었습니다.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: "typed",
    });

    expect(res.status).toBe(200);
    expect(rows[0].input_origin).toBe("typed");
  });

  it("위조 값은 NULL 로 떨어진다", async () => {
    const { res, rows } = await postCaseGradeMessage({
      qIdx: 0,
      message: "이 답안은 개념을 잘못 짚었습니다.",
      clientMessageId: CLIENT_MESSAGE_ID,
      inputOrigin: FORGED,
    });

    expect(res.status).toBe(200);
    expect(rows[0].input_origin).toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain("DROP TABLE");
  });

  it("inputOrigin 이 없으면 NULL 이다", async () => {
    const { res, rows } = await postCaseGradeMessage({
      qIdx: 0,
      message: "이 답안은 개념을 잘못 짚었습니다.",
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(res.status).toBe(200);
    expect(rows[0]).toHaveProperty("input_origin", null);
  });
});

// ───────────────────────── 4. 클라이언트 배선 ─────────────────────────

/**
 * 이 저장소의 vitest 환경은 node 이고 DOM 테스트 도구가 없다(의존성 추가 금지).
 * 그래서 "어느 클릭이 어느 출처를 신고하는가"는 소스 배선으로 잠근다.
 * 서버가 그 값을 어떻게 저장하는지는 위 라우트 테스트가 실제로 실행해서 증명한다.
 */
describe("BulkGradingPanel — 어느 경로가 어떤 출처를 신고하는가", () => {
  const src = readFileSync(
    path.join(path.resolve(__dirname, ".."), "components/instructor/BulkGradingPanel.tsx"),
    "utf8",
  );

  function slice(startAnchor: string, endAnchor: string): string {
    const start = src.indexOf(startAnchor);
    const end = src.indexOf(endAnchor, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("quick-reply 칩 클릭은 'quick_reply' 를 신고한다", () => {
    const handler = slice("const handleOptionPick", "const sendMode = resolveSendMode");
    expect(handler).toMatch(/chatMutation\.mutate\(/);
    expect(handler).toMatch(/inputOrigin:\s*"quick_reply"/);
    expect(handler).not.toMatch(/inputOrigin:\s*"typed"/);
  });

  it("작성기 전송은 'typed'(붙여넣기가 섞였으면 'pasted')를 신고한다", () => {
    const sendFn = slice("const send = () => {", "const handleComposerKeyDown");
    expect(sendFn).toMatch(
      /inputOrigin:\s*draftHasPasteRef\.current\s*\?\s*"pasted"\s*:\s*"typed"/,
    );
  });

  it("붙여넣기는 onPaste 로 감지하고 초안이 비면 리셋한다", () => {
    expect(src).toMatch(/onPaste=\{\(e\)\s*=>/);
    expect(src).toMatch(/draftHasPasteRef\.current = true/);
    expect(src).toMatch(/if \(!e\.target\.value\) draftHasPasteRef\.current = false/);
  });

  it("신고값은 요청 본문에 실려 나간다", () => {
    expect(src).toMatch(/body: JSON\.stringify\(\{ message, clientMessageId, inputOrigin \}\)/);
  });

  it("컴포넌트가 쓰는 출처 리터럴은 전부 어휘 안에 있다 (오타는 조용히 NULL 이 된다)", () => {
    const literals = [...src.matchAll(/inputOrigin:\s*(?:[^"]*\?\s*)?"([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    const chained = [...src.matchAll(/\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)].flatMap((m) => [
      m[1],
      m[2],
    ]);
    const used = [...new Set([...literals, ...chained])];

    expect(used.length).toBeGreaterThan(0);
    for (const origin of used) {
      expect(INPUT_ORIGINS).toContain(origin);
    }
  });
});

// ───────────────────────── 5. 마이그레이션 ─────────────────────────

describe("database/031_input_origin.sql", () => {
  const sql = readFileSync(
    path.join(path.resolve(__dirname, ".."), "database/031_input_origin.sql"),
    "utf8",
  );

  it("두 테이블 모두에 nullable 컬럼을 추가한다", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.bulk_grading_messages\s+ADD COLUMN IF NOT EXISTS input_origin text NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.grading_chats\s+ADD COLUMN IF NOT EXISTS input_origin text NULL/,
    );
  });

  it("CHECK 제약의 어휘가 코드 상수와 일치한다", () => {
    const checks = [...sql.matchAll(/CHECK \(input_origin IN \(([^)]*)\)\)/g)];
    expect(checks).toHaveLength(2);
    for (const check of checks) {
      const values = check[1].split(",").map((v) => v.trim().replace(/'/g, ""));
      expect(values).toEqual([...INPUT_ORIGINS]);
    }
  });

  it("백필하지 않는다 (기존 행의 출처는 미상이다)", () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.(bulk_grading_messages|grading_chats)/i);
    expect(sql).not.toMatch(/DEFAULT\s+'typed'/i);
  });

  it("BEGIN/COMMIT 과 주석 롤백 블록을 갖춘다", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql).toMatch(/^-- ALTER TABLE public\.grading_chats DROP COLUMN IF EXISTS input_origin;$/m);
    expect(sql).toMatch(
      /^-- ALTER TABLE public\.bulk_grading_messages DROP COLUMN IF EXISTS input_origin;$/m,
    );
  });
});
