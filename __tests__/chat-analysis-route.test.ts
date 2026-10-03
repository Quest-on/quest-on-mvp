/**
 * /api/chat/analysis 라우트 (이슈 #545)
 *
 * 가짜 Supabase 와 가짜 OpenAI(fetch)를 꽂고 라우트를 끝까지 태운다. 실제 OpenAI 는 부르지 않는다.
 * 증명하는 것:
 *   1) 켜지는 조건이 아니면(분석 파트너 아님, 공개 데이터 없음, temp 세션) 아무것도 저장하지 않고 409 다.
 *   2) 인증, 세션 소유권.
 *   3) 첫 턴: 파일 업로드, 명시 컨테이너, foreground stream 요청 모양, 셀과 그림 저장, 메타데이터 모양,
 *      sandbox 링크 제거, ai_events 한 번(student_chat_analysis), SSE 진행 이벤트.
 *   4) 만료 복구: 새 컨테이너 + 이전 셀 코드 재실행 입력 + 화면 안내.
 *   5) 잔액 소진: 재시도 없음, 학생 안내 코드, 서버 로그 error.
 *   6) 셀 상한: 스트림 중단, 실패 턴으로 기록(response_id 없음).
 *   7) 문항 간 연결: 대화는 문항마다 따로지만 컨테이너는 세션에 하나라, 새 문항의 첫 턴에 앞 문항의 성공 셀 코드를
 *      developer 블록으로 알린다. 같은 문항의 이어지는 턴은 블록 없이 기존 대화를 잇고, 만료면 복구 문구가 우선한다.
 *   8) 리뷰 반영: 같은 문항에서 중단된 요청이 실행한 셀을 다음 턴에 알린다. 만료 복구는 복원 파일을 올려 한 줄로
 *      실행하게 하고(못 올리면 코드 다시 실행), 복원 결과를 기록해 덜 끝났으면 다음 턴에 다시 복원하며, 원래 셀의 출처로
 *      다음 복원을 만든다. 연결이 끊겨도 턴이 끝까지 기록되도록 `after()` 에 맡긴다. 보안 확인(닫힌 시험, 속도 제한,
 *      studentId 대조)을 테스트로 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SseParser } from "@/lib/analysis-exec/sse";
import { STUDENT_CHAT_SPECS } from "@/lib/student-chat-spec";
import { ANALYSIS_MAX_OUTPUT_TOKENS } from "@/lib/analysis-exec/limits";
import {
  INTERRUPTED_CODE_HEADER,
  LINKED_CODE_HEADER,
  REPLAY_FILE_NAME,
  REPLAY_INSTRUCTION_HEADER,
  REPLAY_MARKER,
} from "@/lib/analysis-exec/container";
import { checkRateLimitAsync } from "@/lib/rate-limit";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  /** `after()` 에 맡긴 작업. 연결이 끊겨도 턴이 끝까지 도는지 기다려 본다. */
  afterTasks: [] as Array<unknown>,
  logError: vi.fn(),
  visible: [] as Array<{ url: string; fileName: string; extension: string }>,
  inserts: { messages: [] as Row[], ai_events: [] as Row[] },
  uploads: [] as Array<{ bucket: string; path: string; contentType?: string }>,
  materialsSelects: 0,
  materialsSelectCols: "",
  materialsError: null as { code: string; message: string } | null,
  db: {
    session: null as Row | null,
    exam: null as Row | null,
    aiMessages: [] as Row[],
    prevResponseId: null as string | null,
    /** 이전 응답이 속한 문항. null 이면 어느 문항을 물어도 돌려준다. 숫자면 그 문항(q_idx 조건)만. */
    prevResponseQIdx: null as number | null,
  },
  openai: {
    calls: [] as Array<{ method: string; path: string; body: unknown }>,
    containerStatus: "running" as string,
    /** 다음 컨테이너 생성 한 번을 404 로 실패시킨다(같은 파일 id 로 다시 만들 수 없는 경우). */
    failNextContainerCreate: false,
    /** 컨테이너 파일 올리기(복원 파일)를 실패시킨다. */
    failContainerFileUpload: false,
    /** 컨테이너에 올린 파일(이름, 내용). */
    containerFiles: [] as Array<{ containerId: string; name: string; text: string }>,
    responses: [] as Array<() => Response>,
  },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: h.currentUser }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (task: unknown) => {
    h.afterTasks.push(task);
  },
}));
vi.mock("@/lib/logger", () => ({ logError: h.logError, logInfo: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  RATE_LIMITS: { chat: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/message-classification", () => ({ classifyMessageType: vi.fn(async () => "calculation") }));
// 공개 자료 판정만 바꾸고 나머지 내보내기(상수 등)는 실제 모듈 것을 쓴다.
vi.mock("@/lib/student-materials", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // 실제 헬퍼처럼 두 컬럼을 함께 읽었을 때만 공개 자료가 있다.
  // material_names(URL → 원래 이름)가 있으면 fileName 에 원래 이름을 넣는다(#544 계약).
  getStudentVisibleMaterials: (exam: { student_materials?: unknown; material_names?: Record<string, string> }) =>
    Array.isArray(exam?.student_materials)
      ? h.visible.map((v) => ({ ...v, fileName: exam.material_names?.[v.url] ?? v.fileName }))
      : [],
}));
vi.mock("@/lib/openai", () => ({
  AI_MODEL: "gpt-test-requested",
  isOpenAITimeoutError: () => false,
  callOpenAIWithTelemetry: async <T,>(fn: () => Promise<T>) => ({ data: await fn(), attemptCount: 1, latencyMs: 1 }),
}));

function makeSupabase() {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: {
      from(bucket: string) {
        return {
          download: vi.fn(async () => ({ data: new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]), error: null })),
          upload: vi.fn(async (path: string, _body: unknown, opts?: { contentType?: string }) => {
            h.uploads.push({ bucket, path, contentType: opts?.contentType });
            return { data: { path }, error: null };
          }),
          createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null })),
        };
      },
    },
    from(table: string) {
      const state: { select?: string; insert?: Row[]; eq: Record<string, unknown> } = { eq: {} };
      const builder: Record<string, unknown> = {};
      for (const m of ["neq", "is", "not", "in", "order", "limit"]) builder[m] = () => builder;
      builder.eq = (column: string, value: unknown) => {
        state.eq[column] = value;
        return builder;
      };
      builder.select = (cols?: string) => {
        state.select = cols ?? "*";
        return builder;
      };
      builder.insert = (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        state.insert = rows;
        if (table === "messages") h.inserts.messages.push(...rows);
        if (table === "ai_events") h.inserts.ai_events.push(...rows);
        return builder;
      };
      const single = async () => {
        if (state.insert) return { data: { id: state.insert[0].id, created_at: "2026-10-03T05:00:00.000Z" }, error: null };
        if (table === "sessions") return { data: h.db.session, error: null };
        if (table === "exams") {
          if (state.select?.includes("student_materials")) {
            h.materialsSelects += 1;
            h.materialsSelectCols = state.select;
            if (h.materialsError) return { data: null, error: h.materialsError };
            return {
              data: {
                materials: [],
                student_materials: [],
                // 원래 이름은 material_names(#544)에 있다. 텍스트 추출 기록의 이름은 원래 이름이 없을 때만 쓴다.
                material_names: { [DATA_URL]: "하냥센스_시험용_dataset.xlsx" },
                materials_text: [{ url: DATA_URL, fileName: "추출 기록 이름.xlsx", text: "..." }],
              },
              error: null,
            };
          }
          return { data: h.db.exam, error: null };
        }
        if (table === "messages" && state.select === "response_id") {
          // q_idx 조건 없이 물으면(문항을 가리지 않으면) 가장 최근 응답을 돌려준다.
          const sameQuestion =
            state.eq.q_idx === undefined || h.db.prevResponseQIdx === null || state.eq.q_idx === h.db.prevResponseQIdx;
          return { data: h.db.prevResponseId && sameQuestion ? { response_id: h.db.prevResponseId } : null, error: null };
        }
        return { data: null, error: null };
      };
      builder.single = single;
      builder.maybeSingle = single;
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "messages" && state.select?.includes("metadata") && !state.insert) {
          return Promise.resolve({ data: h.db.aiMessages, error: null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => makeSupabase() }));

import { POST } from "@/app/api/chat/analysis/route";

const SID = "00000000-0000-4000-8000-0000000000aa";
const EXAM_ID = "00000000-0000-4000-8000-000000000001";
const STUDENT = "student-1";
const DATA_URL = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-x/2026-10-03_0f8e.xlsx";
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const enc = new TextEncoder();
function sseResponse(events: Array<Record<string, unknown>>): Response {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(text));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const ci = (id: string, outputs: unknown[] = [], code = `print('${id}')`) => ({
  type: "code_interpreter_call",
  id,
  status: "completed",
  code,
  outputs,
});

function turnEvents(cells: number, opts: { withImage?: boolean; text?: string } = {}) {
  const text = opts.text ?? "결과입니다. ![그림](sandbox:/mnt/data/plot.png)";
  const ev: Array<Record<string, unknown>> = [{ type: "response.created", response: { id: "resp_1", model: "gpt-x" } }];
  const items = [];
  for (let i = 1; i <= cells; i++) {
    const outputs = [{ type: "logs", logs: `셀 ${i}\n` }, ...(opts.withImage && i === 1 ? [{ type: "image", url: `data:image/png;base64,${PNG_B64}` }] : [])];
    ev.push({ type: "response.output_item.added", item: { ...ci(`c${i}`), status: "in_progress", outputs: [] } });
    ev.push({ type: "response.output_item.done", item: ci(`c${i}`, outputs, i === 1 ? "df = pd.read_excel(path)" : `step${i}()`) });
    items.push(ci(`c${i}`, outputs));
  }
  ev.push({ type: "response.output_item.added", item: { type: "message", id: "m" } });
  ev.push({ type: "response.output_text.delta", delta: text });
  ev.push({
    type: "response.completed",
    response: {
      id: "resp_1",
      model: "gpt-x-2026",
      output: [...items, { type: "message", content: [{ type: "output_text", text, annotations: [] }] }],
      usage: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 10 } },
    },
  });
  return ev;
}

const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/v1/, "");
  const method = init?.method ?? "GET";
  let body: unknown = null;
  if (typeof init?.body === "string") body = JSON.parse(init.body);
  h.openai.calls.push({ method, path, body });
  const containerFileUpload = /^\/containers\/([^/]+)\/files$/.exec(path);
  if (method === "POST" && containerFileUpload) {
    if (h.openai.failContainerFileUpload) return jsonResponse(500, { error: { message: "upload failed" } });
    const file = (init?.body as FormData).get("file") as File;
    h.openai.containerFiles.push({ containerId: containerFileUpload[1], name: file.name, text: await file.text() });
    return jsonResponse(200, { id: "cfile_replay", object: "container.file", path: `/mnt/data/cf9-${file.name}` });
  }
  if (method === "POST" && path === "/files") return jsonResponse(200, { id: "file-up1" });
  if (method === "POST" && path === "/containers" && h.openai.failNextContainerCreate) {
    h.openai.failNextContainerCreate = false;
    return jsonResponse(404, { error: { message: "File not found", type: "invalid_request_error" } });
  }
  if (method === "POST" && path === "/containers") return jsonResponse(200, { id: `cntr_${h.openai.calls.filter((c) => c.path === "/containers").length}`, status: "running" });
  if (method === "GET" && /^\/containers\/[^/]+\/files$/.test(path)) {
    return jsonResponse(200, { data: [{ id: "cfile_1", path: "/mnt/data/file-up1-a.xlsx" }] });
  }
  if (method === "GET" && /^\/containers\/[^/]+$/.test(path)) return jsonResponse(200, { id: path.split("/")[2], status: h.openai.containerStatus });
  if (method === "POST" && path === "/responses") {
    const next = h.openai.responses.shift();
    if (!next) throw new Error("unexpected /responses call");
    return next();
  }
  throw new Error(`unexpected OpenAI call ${method} ${path}`);
});

function request(overrides: Row = {}) {
  return new Request("https://example.test/api/chat/analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "데이터를 점검해 주세요",
      sessionId: SID,
      questionIdx: 0,
      questionId: "q-1",
      examTitle: "모의시험",
      examCode: "TST001",
      examId: EXAM_ID,
      studentId: STUDENT,
      currentQuestionText: "문제 본문",
      ...overrides,
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

async function readEvents(res: Response) {
  const parser = new SseParser();
  const text = await res.text();
  return [...parser.push(text), ...parser.flush()].map((e) => ({ event: e.event, data: JSON.parse(e.data) as Row }));
}

const aiMessages = () => h.inserts.messages.filter((r) => r.role === "ai");
/** 컨테이너에 올린 마지막 복원 파일이 다시 실행할 셀 코드들. */
const replayedCodes = () => {
  const file = h.openai.containerFiles.at(-1);
  if (!file) return [];
  return [...file.text.matchAll(/\("Q\d+-C\d+", "([A-Za-z0-9+/=]+)"\)/g)].map((m) => Buffer.from(m[1], "base64").toString("utf8"));
};
const userMessages = () => h.inserts.messages.filter((r) => r.role === "user");
const responseCalls = () => h.openai.calls.filter((c) => c.path === "/responses");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.test/v1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  h.inserts.messages.length = 0;
  h.inserts.ai_events.length = 0;
  h.uploads.length = 0;
  h.materialsSelects = 0;
  h.materialsError = null;
  h.openai.calls.length = 0;
  h.openai.responses.length = 0;
  h.openai.containerStatus = "running";
  h.openai.failNextContainerCreate = false;
  h.openai.failContainerFileUpload = false;
  h.openai.containerFiles.length = 0;
  h.afterTasks.length = 0;
  vi.mocked(checkRateLimitAsync).mockResolvedValue({ allowed: true } as never);
  h.currentUser.mockResolvedValue({ id: STUDENT, role: "student" });
  // 에픽 A 헬퍼의 fileName 은 URL 마지막 조각(날짜_uuid.확장자)이다.
  h.visible = [{ url: DATA_URL, fileName: "2026-10-03_0f8e.xlsx", extension: "xlsx" }];
  h.db.session = { id: SID, exam_id: EXAM_ID, student_id: STUDENT, submitted_at: null };
  h.db.exam = {
    id: EXAM_ID,
    code: "TST001",
    title: "모의시험",
    status: "running",
    language: "ko",
    questions: [{ id: "q-1", ai_context: "교수 메모", ai_role: "analysis_partner" }],
  };
  h.db.aiMessages = [];
  h.db.prevResponseId = null;
  h.db.prevResponseQIdx = null;
});

describe("켜지는 조건이 아니면 아무것도 저장하지 않고 409", () => {
  it.each([
    ["분석 파트너가 아님", () => (h.db.exam!.questions = [{ id: "q-1" }]), "not_analysis_partner"],
    ["공개 자료가 pdf 뿐", () => (h.visible = [{ url: "https://x/c.pdf", fileName: "c.pdf", extension: "pdf" }]), "no_data_files"],
    ["공개 자료 없음", () => (h.visible = []), "no_data_files"],
    ["영어 시험(분석 파트너는 한국어만)", () => (h.db.exam!.language = "en"), "not_analysis_partner"],
  ])("%s", async (_label, arrange, reason) => {
    arrange();
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "ANALYSIS_UNAVAILABLE", details: { reason } });
    expect(h.inserts.messages).toEqual([]);
    expect(h.openai.calls).toEqual([]);
  });

  it("분석 파트너가 아니면 공개 자료 컬럼을 읽지 않는다(라우트가 먼저 거른다)", async () => {
    h.db.exam!.questions = [{ id: "q-1" }];
    expect((await POST(request())).status).toBe(409);
    expect(h.materialsSelects).toBe(0);
  });

  it("공개 자료 컬럼이 아직 없는 DB(42703)는 공개 자료 없음(409)이고, 그 밖의 조회 오류는 503 이다", async () => {
    h.materialsError = { code: "42703", message: "column exams.student_materials does not exist" };
    const missing = await POST(request());
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ details: { reason: "no_data_files" } });

    h.materialsError = { code: "08006", message: "connection failure" };
    const transient = await POST(request());
    expect(transient.status).toBe(503);
    expect(h.inserts.messages).toEqual([]);
  });

  it("temp 세션은 temp_session 이다", async () => {
    const res = await POST(request({ sessionId: "temp_1700000000000_abc" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ details: { reason: "temp_session" } });
  });
});

describe("인증과 소유권", () => {
  it("로그인하지 않으면 401", async () => {
    h.currentUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
  });

  it("다른 학생의 세션이면 403", async () => {
    h.db.session = { ...h.db.session!, student_id: "someone-else" };
    expect((await POST(request({ studentId: undefined }))).status).toBe(403);
    expect(h.openai.calls).toEqual([]);
  });

  it("제출한 세션이면 403", async () => {
    h.db.session = { ...h.db.session!, submitted_at: "2026-10-03T00:00:00Z" };
    expect((await POST(request())).status).toBe(403);
  });
});

describe("첫 분석 턴", () => {
  it("파일을 올리고 명시 컨테이너를 만들어 foreground stream 으로 실행하고, 셀과 그림을 기록한다", async () => {
    h.openai.responses.push(() => sseResponse(turnEvents(2, { withImage: true })));
    const res = await POST(request());
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readEvents(res);

    // OpenAI 호출 순서: 파일 업로드 → 컨테이너 생성 → 파일 목록 → 응답 스트림
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files",
      "POST /containers",
      "GET /containers/cntr_1/files",
      "POST /responses",
    ]);
    expect(h.openai.calls[1].body).toMatchObject({ file_ids: ["file-up1"], memory_limit: "1g" });

    const body = responseCalls()[0].body as Row;
    expect(body).toMatchObject({
      model: "gpt-test-requested",
      input: "데이터를 점검해 주세요",
      store: true,
      stream: true,
      tool_choice: "auto",
      tools: [{ type: "code_interpreter", container: "cntr_1" }],
      include: ["code_interpreter_call.outputs"],
      max_output_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
    });
    expect(body).not.toHaveProperty("background");
    expect(body).not.toHaveProperty("previous_response_id");
    const instructions = body.instructions as string;
    expect(instructions).toContain("/mnt/data/file-up1-a.xlsx");
    expect(instructions).toContain("pandas.read_excel");
    expect(instructions).toContain("NanumGothic");
    expect(instructions).toContain("교수 메모(학생에게 공개하지 않음): <<<교수 메모>>>");
    // 원래 파일 이름은 material_names 에서 온다(URL 조각도, 추출 기록 이름도 아니다).
    expect(h.materialsSelectCols).toContain("material_names");
    expect(instructions).toContain("(원래 파일 이름: <<<하냥센스_시험용_dataset.xlsx>>>)");
    expect(instructions).not.toContain("2026-10-03_0f8e");
    expect(instructions).not.toContain("추출 기록 이름");

    // 진행 이벤트
    expect(events.filter((e) => e.event === "status").map((e) => e.data)).toEqual([
      { phase: "preparing" },
      { phase: "running", cell: 1 },
      { phase: "running", cell: 2 },
      { phase: "writing" },
    ]);
    const done = events.find((e) => e.event === "done")!.data.message as Row;
    expect(done.content).toBe("결과입니다.");
    expect(done.timestamp).toBe("2026-10-03T05:00:00.000Z");

    // 저장: 학생 메시지와 AI 메시지
    expect(userMessages()).toHaveLength(1);
    expect(userMessages()[0]).toMatchObject({ session_id: SID, q_idx: 0, content: "데이터를 점검해 주세요", message_type: "calculation" });
    expect(aiMessages()).toHaveLength(1);
    const ai = aiMessages()[0];
    const messageId = ai.id as string;
    expect(messageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ai).toMatchObject({ session_id: SID, q_idx: 0, role: "ai", content: "결과입니다.", response_id: "resp_1", tokens_used: 1200 });
    expect(String(ai.content)).not.toContain("sandbox:");
    const metadata = ai.metadata as Row;
    expect(Object.keys(metadata).sort()).toEqual(
      ["analysis", "effort", "rag", "response_model", "response_model_source", "spec", "template_sha", "tools", "usage"].sort()
    );
    expect(metadata).toMatchObject({
      rag: { topSimilarity: null, resultsCount: 0, method: "none" },
      spec: "analysis-partner@2",
      template_sha: STUDENT_CHAT_SPECS["analysis-partner@2"].toolRenderSha256.hosted_python.ko.slice(0, 16),
      tools: "hosted_python",
      effort: "unspecified",
      response_model: "gpt-x-2026",
      response_model_source: "response",
    });
    const analysis = metadata.analysis as Row;
    expect(analysis).toMatchObject({
      v: 1,
      container_id: "cntr_1",
      files: [{ name: "하냥센스_시험용_dataset.xlsx", path: "/mnt/data/file-up1-a.xlsx", file_id: "file-up1", source: DATA_URL }],
      outcome: "completed",
      notices: [],
      cited_figures: [],
    });
    expect(analysis.cells).toEqual([
      {
        index: 1,
        status: "completed",
        code: "df = pd.read_excel(path)",
        logs: "셀 1\n",
        figures: [{ path: `${SID}/${messageId}/1.png`, mime: "image/png", bytes: expect.any(Number), sha256: expect.any(String) }],
      },
      { index: 2, status: "completed", code: "step2()", logs: "셀 2\n", figures: [] },
    ]);

    // 그림은 비공개 버킷에 경로만
    expect(h.uploads).toEqual([{ bucket: "analysis-outputs", path: `${SID}/${messageId}/1.png`, contentType: "image/png" }]);

    // 화면용 기록에는 서버 전용 값이 없다
    const clientTurn = done.analysis as Row;
    expect(JSON.stringify(clientTurn)).not.toContain("cntr_1");
    expect(JSON.stringify(clientTurn)).not.toContain("file-up1");
    expect((clientTurn.cells as Row[])[0].figures).toEqual([
      { url: `/api/session/${SID}/analysis/figures/${messageId}/1.png`, name: "1.png" },
    ]);

    // ai_events 정확히 한 번
    expect(h.inserts.ai_events).toHaveLength(1);
    expect(h.inserts.ai_events[0]).toMatchObject({
      feature: "student_chat_analysis",
      route: "/api/chat/analysis",
      status: "success",
      session_id: SID,
      response_id: "resp_1",
      input_tokens: 1000,
    });
    expect(h.inserts.ai_events[0].metadata).toMatchObject({
      spec: "analysis-partner@2",
      tools: "hosted_python",
      analysis_outcome: "completed",
      cells: 2,
      figures: 1,
      container_restarted: false,
    });
  });

  it("이전 응답이 있으면 previous_response_id 로 잇는다", async () => {
    h.db.prevResponseId = "resp_prev";
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    expect(responseCalls()[0].body).toMatchObject({ previous_response_id: "resp_prev" });
  });
});

function previousRecord(code = "df = pd.read_excel('/mnt/data/file-keep-a.xlsx')") {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    q_idx: 0,
    created_at: "2026-10-03T04:00:00.000Z",
    metadata: {
      analysis: {
        v: 1,
        container_id: "cntr_old",
        files: [{ name: "a.xlsx", path: "/mnt/data/file-keep-a.xlsx", file_id: "file-keep", source: DATA_URL }],
        cells: [
          { index: 1, status: "completed", code, logs: "", figures: [] },
          { index: 2, status: "failed", code: "boom()", logs: "", figures: [] },
        ],
        cited_figures: [],
        outcome: "completed",
        notices: [],
        elapsed_ms: 1,
      },
    },
  };
}

describe("만료 복구", () => {
  it("살아 있는 컨테이너는 조회만 하고 그대로 쓴다", async () => {
    h.db.aiMessages = [previousRecord()];
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /containers/cntr_old", "POST /responses"]);
    expect(responseCalls()[0].body).toMatchObject({ input: "데이터를 점검해 주세요", tools: [{ container: "cntr_old" }] });
  });

  it("조회가 expired 면 같은 파일로 새 컨테이너를 만들고 이전 성공 셀 코드를 다시 실행하게 하며 화면에 알린다", async () => {
    h.db.aiMessages = [previousRecord()];
    h.openai.containerStatus = "expired";
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const events = await readEvents(await POST(request()));

    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /containers/cntr_old",
      "POST /containers",
      "POST /containers/cntr_1/files",
      "POST /responses",
    ]);
    expect(h.openai.calls[1].body).toMatchObject({ file_ids: ["file-keep"] });
    const input = responseCalls()[0].body as Row;
    expect(input.input).toEqual([
      { role: "developer", content: expect.stringContaining("[이전 분석 코드(환경이 초기화되어 다시 실행 필요)]") },
      { role: "user", content: "데이터를 점검해 주세요" },
    ]);
    const replay = ((input.input as Row[])[0].content as string);
    expect(replay).toContain("df = pd.read_excel('/mnt/data/file-keep-a.xlsx')");
    expect(replay).not.toContain("boom()");
    expect(events.filter((e) => e.event === "status").map((e) => e.data.phase)).toContain("restarting");

    const analysis = (aiMessages()[0].metadata as Row).analysis as Row;
    expect(analysis).toMatchObject({ container_id: "cntr_1", notices: ["environment_restarted"], replayed_cells: 1 });
    // 모델이 복원 셀을 실행하지 않았다(이 가짜 응답에는 복원 셀이 없다). 덜 끝난 복원으로 기록해 다음 턴에 다시 한다.
    expect(analysis.restore).toEqual({
      refs: [{ m: "00000000-0000-4000-8000-0000000000c1", i: 1 }],
      mode: "file",
      status: "incomplete",
    });
    const done = events.find((e) => e.event === "done")!.data.message as Row;
    expect((done.analysis as Row).notices).toEqual(["environment_restarted"]);
    expect(JSON.stringify(done.analysis)).not.toContain("refs");
  });

  it("조회와 호출 사이에 만료되면(400 Container is expired) 한 번 복구해 다시 돈다", async () => {
    h.db.aiMessages = [previousRecord()];
    h.openai.responses.push(() => jsonResponse(400, { error: { message: "Container is expired.", type: "invalid_request_error" } }));
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const events = await readEvents(await POST(request()));
    expect(responseCalls()).toHaveLength(2);
    expect(responseCalls()[1].body).toMatchObject({ tools: [{ container: "cntr_1" }] });
    expect(((responseCalls()[1].body as Row).input as Row[])[0]).toMatchObject({ role: "developer" });
    expect(events.some((e) => e.event === "done")).toBe(true);
    expect(userMessages()).toHaveLength(1);
  });
});

describe("문항 간 연결", () => {
  const cell = (index: number, code: string, status = "completed", extra: Row = {}) => ({
    index,
    status,
    code,
    logs: "",
    figures: [],
    ...extra,
  });
  function record(params: { n: number; qIdx: number; cells: Row[]; outcome?: string; container?: string }) {
    return {
      id: `00000000-0000-4000-8000-0000000001${String(params.n).padStart(2, "0")}`,
      q_idx: params.qIdx,
      created_at: `2026-10-03T04:${String(params.n).padStart(2, "0")}:00.000Z`,
      metadata: {
        analysis: {
          v: 1,
          container_id: params.container ?? "cntr_old",
          files: [{ name: "a.xlsx", path: "/mnt/data/file-keep-a.xlsx", file_id: "file-keep", source: DATA_URL }],
          cells: params.cells,
          cited_figures: [],
          outcome: params.outcome ?? "completed",
          notices: [],
          elapsed_ms: 1,
        },
      },
    };
  }
  const READ = "df = pd.read_excel('/mnt/data/file-keep-a.xlsx')";
  const CLEAN = "df_clean = df[(z.abs() < 3).all(axis=1)]";
  const q1Record = record({
    n: 1,
    qIdx: 0,
    cells: [cell(1, READ), cell(2, "boom()", "failed"), cell(3, "partial(", "completed", { code_truncated: true }), cell(4, CLEAN)],
  });
  const askQ2 = () => request({ questionIdx: 1, questionId: "q-2", currentQuestionText: "문제 2 본문", message: "K-means 로 군집을 나눠 주세요" });
  const developerOf = (call: { body: unknown }) => {
    const input = (call.body as Row).input;
    return Array.isArray(input) ? (input as Row[]).filter((m) => m.role === "developer").map((m) => String(m.content)) : [];
  };
  const storedAnalysis = () => (aiMessages()[0].metadata as Row).analysis as Row;

  beforeEach(() => {
    h.db.exam!.questions = [
      { id: "q-1", ai_context: "교수 메모", ai_role: "analysis_partner" },
      { id: "q-2", ai_context: "교수 메모 2", ai_role: "analysis_partner" },
    ];
  });

  it("첫 문항의 첫 턴에는 블록이 없다", async () => {
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    expect(responseCalls()[0].body).toMatchObject({ input: "데이터를 점검해 주세요" });
    expect(storedAnalysis()).not.toHaveProperty("linked_cells");
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ linked_cells: 0, replayed_cells: 0 });
  });

  it("두 번째 문항의 첫 턴은 대화를 새로 시작하고, 앞 문항이 같은 컨테이너에서 실행한 성공 셀을 문항 번호와 함께 받는다", async () => {
    h.db.aiMessages = [q1Record];
    // 문제 1 의 대화가 있어도 문제 2 는 그 대화를 잇지 않는다(q_idx 별 대화).
    h.db.prevResponseId = "resp_q1";
    h.db.prevResponseQIdx = 0;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const events = await readEvents(await POST(askQ2()));

    // 컨테이너는 그대로 쓴다(변수가 남아 있다).
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /containers/cntr_old", "POST /responses"]);
    const body = responseCalls()[0].body as Row;
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).toMatchObject({ tools: [{ type: "code_interpreter", container: "cntr_old" }] });
    expect(body.input).toEqual([
      { role: "developer", content: expect.any(String) },
      { role: "user", content: "K-means 로 군집을 나눠 주세요" },
    ]);
    const [block] = developerOf(responseCalls()[0]);
    expect(block.startsWith(`${LINKED_CODE_HEADER}\n지금 풀고 있는 문제는 문제 2입니다.`)).toBe(true);
    expect(block).toContain(`# 문제 1 셀 1\n${READ}\n\n# 문제 1 셀 2\n${CLEAN}`);
    // 실패한 셀과 저장 상한에 잘린 셀은 넣지 않는다.
    expect(block).not.toContain("boom()");
    expect(block).not.toContain("partial(");
    expect(block).not.toContain(REPLAY_INSTRUCTION_HEADER);
    // 지시문(도구 있음 3절)에 앞 문항 처리를 이어 쓰기 전에 확인하는 규칙이 있다.
    expect(body.instructions as string).toContain(
      "앞 문항에서 실행한 분석 코드가 입력에 주어지면, 앞 문항의 처리(제외한 행, 변환과 표준화 방식 등)를 이 문항에 이어 쓰기 전에"
    );

    expect(userMessages()[0]).toMatchObject({ q_idx: 1 });
    expect(aiMessages()[0]).toMatchObject({ q_idx: 1, response_id: "resp_1" });
    expect(storedAnalysis()).toMatchObject({ container_id: "cntr_old", notices: [], linked_cells: 2 });
    expect(storedAnalysis()).not.toHaveProperty("replayed_cells");
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ linked_cells: 2, replayed_cells: 0, container_restarted: false });
    // 화면 안내는 없다(복구가 아니다).
    expect(events.filter((e) => e.event === "status").map((e) => e.data.phase)).not.toContain("restarting");
  });

  it("같은 문항의 두 번째 턴은 기존 대화를 잇고 블록을 붙이지 않는다", async () => {
    h.db.aiMessages = [q1Record, record({ n: 2, qIdx: 1, cells: [cell(1, "km = KMeans(4).fit(X)")] })];
    h.db.prevResponseId = "resp_q2";
    h.db.prevResponseQIdx = 1;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(askQ2()));
    expect(responseCalls()[0].body).toMatchObject({ previous_response_id: "resp_q2", input: "K-means 로 군집을 나눠 주세요" });
    expect(storedAnalysis()).not.toHaveProperty("linked_cells");
  });

  it("다른 문항에 갔다가 돌아오면 그 사이 다른 문항에서 실행한 셀만 받는다", async () => {
    h.db.aiMessages = [
      q1Record,
      record({ n: 2, qIdx: 1, cells: [cell(1, "km = KMeans(4).fit(X)")] }),
      record({ n: 3, qIdx: 0, cells: [cell(1, "df_clean = df[mask_iqr]")] }),
    ];
    h.db.prevResponseId = "resp_q2";
    h.db.prevResponseQIdx = 1;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(askQ2()));
    expect(responseCalls()[0].body).toMatchObject({ previous_response_id: "resp_q2" });
    const [block] = developerOf(responseCalls()[0]);
    expect(block).toContain("# 문제 1 셀 1\ndf_clean = df[mask_iqr]\n```");
    expect(block).not.toContain(CLEAN);
    expect(storedAnalysis()).toMatchObject({ linked_cells: 1 });
  });

  it("컨테이너가 만료됐는데 문항도 바뀌었으면 복구 문구가 우선하고 연결 블록은 붙이지 않는다", async () => {
    h.db.aiMessages = [q1Record];
    h.openai.containerStatus = "expired";
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const events = await readEvents(await POST(askQ2()));
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /containers/cntr_old",
      "POST /containers",
      "POST /containers/cntr_1/files",
      "POST /responses",
    ]);
    const blocks = developerOf(responseCalls()[0]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startsWith(REPLAY_INSTRUCTION_HEADER)).toBe(true);
    expect(blocks[0]).not.toContain(LINKED_CODE_HEADER);
    expect(blocks[0]).toContain("지금 풀고 있는 문제는 문제 2입니다. 다른 번호가 붙은 셀은 앞 문항에서 실행한 코드입니다.");
    expect(blocks[0]).toContain(`# 문제 1 셀 1\n${READ}\n\n# 문제 1 셀 2\n${CLEAN}`);
    expect(blocks[0]).not.toContain("boom()");
    expect(storedAnalysis()).toMatchObject({ container_id: "cntr_1", notices: ["environment_restarted"], replayed_cells: 2 });
    expect(storedAnalysis()).not.toHaveProperty("linked_cells");
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ linked_cells: 0, replayed_cells: 2, container_restarted: true });
    expect(events.filter((e) => e.event === "status").map((e) => e.data.phase)).toContain("restarting");
  });

  it("만료 뒤 파일을 다시 올려 경로가 바뀌면 복구 코드 안의 앞 문항 경로도 새 경로로 바꿔 넣는다", async () => {
    h.db.aiMessages = [q1Record];
    h.openai.containerStatus = "expired";
    h.openai.failNextContainerCreate = true;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(askQ2()));
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /containers/cntr_old",
      "POST /containers",
      "POST /files",
      "POST /containers",
      "GET /containers/cntr_2/files",
      "POST /containers/cntr_2/files",
      "POST /responses",
    ]);
    const [block] = developerOf(responseCalls()[0]);
    expect(block).toContain("# 문제 1 셀 1\ndf = pd.read_excel('/mnt/data/file-up1-a.xlsx')");
    expect(block).not.toContain("file-keep");
    // 복원 파일 안의 코드도 새 경로로 바뀌어 있다.
    expect(replayedCodes()).toEqual(["df = pd.read_excel('/mnt/data/file-up1-a.xlsx')", CLEAN]);
  });

  it("앞 문항 코드가 4만 자를 넘으면 앞에서부터 넣고, 넣지 못한 셀 수를 알린다", async () => {
    const big = (tag: string) => `# ${tag}\n${"x = 1\n".repeat(2_495)}`; // 셀 하나 약 1만 5천 자
    h.db.aiMessages = [record({ n: 1, qIdx: 0, cells: [cell(1, big("A")), cell(2, big("B")), cell(3, big("C"))] })];
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(askQ2()));
    const [block] = developerOf(responseCalls()[0]);
    expect(block).toContain("# 문제 1 셀 2\n# B");
    expect(block).not.toContain("# C");
    expect(block).toContain("길이 제한으로 마지막 셀 1개의 코드는 넣지 못했습니다.");
    expect(storedAnalysis()).toMatchObject({ linked_cells: 2 });
  });
});

describe("리뷰 반영: 중단된 요청과 만료 복구", () => {
  const cell = (index: number, code: string, status = "completed", extra: Row = {}) => ({
    index,
    status,
    code,
    logs: "",
    figures: [],
    ...extra,
  });
  function record(params: {
    n: number;
    qIdx: number;
    cells: Row[];
    outcome?: string;
    container?: string;
    restore?: Row;
  }) {
    return {
      id: `00000000-0000-4000-8000-0000000002${String(params.n).padStart(2, "0")}`,
      q_idx: params.qIdx,
      created_at: `2026-10-04T04:${String(params.n).padStart(2, "0")}:00.000Z`,
      metadata: {
        analysis: {
          v: 1,
          container_id: params.container ?? "cntr_old",
          files: [{ name: "a.xlsx", path: "/mnt/data/file-keep-a.xlsx", file_id: "file-keep", source: DATA_URL }],
          cells: params.cells,
          cited_figures: [],
          outcome: params.outcome ?? "completed",
          notices: [],
          ...(params.restore ? { restore: params.restore } : {}),
          elapsed_ms: 1,
        },
      },
    };
  }
  const idOf = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
  const READ = "df = pd.read_excel('/mnt/data/file-keep-a.xlsx')";
  const developerOf = (call: { body: unknown }) => {
    const input = (call.body as Row).input;
    return Array.isArray(input) ? (input as Row[]).filter((m) => m.role === "developer").map((m) => String(m.content)) : [];
  };
  const stored = () => (aiMessages()[0].metadata as Row).analysis as Row;
  /** 첫 셀이 복원 파일을 실행하고 결과 줄을 출력하는 응답. */
  function replayingTurn(result: string) {
    const replay = {
      type: "code_interpreter_call",
      id: "c_replay",
      status: "completed",
      code: `exec(open("/mnt/data/cf9-${REPLAY_FILE_NAME}").read())`,
      outputs: [{ type: "logs", logs: result }],
    };
    return sseResponse([
      { type: "response.created", response: { id: "resp_r", model: "gpt-x" } },
      { type: "response.output_item.added", item: { ...replay, status: "in_progress", outputs: [] } },
      { type: "response.output_item.done", item: replay },
      { type: "response.output_item.added", item: { type: "message", id: "m" } },
      { type: "response.output_text.delta", delta: "군집별 고객 수입니다." },
      {
        type: "response.completed",
        response: {
          id: "resp_r",
          model: "gpt-x",
          output: [replay, { type: "message", content: [{ type: "output_text", text: "군집별 고객 수입니다.", annotations: [] }] }],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        },
      },
    ]);
  }

  it("같은 문항에서 시간 상한으로 중단된 요청이 실행한 셀을 다음 턴에 알리고, 대화는 마지막 성공 응답에서 잇는다", async () => {
    h.db.aiMessages = [
      record({ n: 1, qIdx: 0, cells: [cell(1, READ)] }),
      record({
        n: 2,
        qIdx: 0,
        outcome: "time_limit",
        cells: [cell(1, "mask = iqr_mask(df)"), cell(2, "df = df[~mask]"), cell(3, "slow()", "incomplete")],
      }),
    ];
    h.db.prevResponseId = "resp_t1";
    h.db.prevResponseQIdx = 0;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request({ message: "IQR 1.5배로 이상치를 제거해 주세요" })));

    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /containers/cntr_old", "POST /responses"]);
    const body = responseCalls()[0].body as Row;
    expect(body).toMatchObject({ previous_response_id: "resp_t1" });
    const blocks = developerOf(responseCalls()[0]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startsWith(`${INTERRUPTED_CODE_HEADER}\n지금 풀고 있는 문제는 문제 1입니다.`)).toBe(true);
    expect(blocks[0]).toContain("# 문제 1 셀 1\nmask = iqr_mask(df)\n\n# 문제 1 셀 2\ndf = df[~mask]");
    expect(blocks[0]).not.toContain("slow()");
    expect(blocks[0]).not.toContain(READ);
    expect(stored()).toMatchObject({ interrupted_cells: 2 });
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ interrupted_cells: 2, linked_cells: 0 });
  });

  it("복원 파일을 실행한 셀의 결과로 복원 성공을 기록하고, 그 셀을 복원 셀로 표시한다", async () => {
    h.db.aiMessages = [record({ n: 1, qIdx: 0, cells: [cell(1, READ), cell(2, "boom()", "failed")] })];
    h.openai.containerStatus = "expired";
    h.openai.responses.push(() => replayingTurn(`${REPLAY_MARKER} ok=1 failed=0\n`));
    const events = await readEvents(await POST(request({ message: "군집별 고객 수를 다시 보여 주세요" })));

    expect(h.openai.containerFiles).toHaveLength(1);
    expect(h.openai.containerFiles[0]).toMatchObject({ containerId: "cntr_1", name: REPLAY_FILE_NAME });
    expect(replayedCodes()).toEqual([READ]);
    const [block] = developerOf(responseCalls()[0]);
    expect(block).toContain(`exec(open("/mnt/data/cf9-${REPLAY_FILE_NAME}").read())`);
    expect(block).toContain("코드를 다시 쓰지 않고 이 한 줄만 실행합니다.");
    expect(stored().restore).toEqual({
      refs: [{ m: idOf(1), i: 1 }],
      mode: "file",
      status: "ok",
      ok_cells: 1,
      failed_cells: 0,
    });
    expect((stored().cells as Row[])[0]).toMatchObject({ index: 1, replay: true });
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ restore_mode: "file", restore_status: "ok", replayed_cells: 1 });
    const done = events.find((e) => e.event === "done")!.data.message as Row;
    expect(((done.analysis as Row).cells as Row[])[0]).toMatchObject({ replay: true });
  });

  it("복원 중 실패한 셀이 있으면 partial 로 남기고(다시 복원하지 않음), 결과 줄이 없으면 incomplete 다", async () => {
    h.db.aiMessages = [record({ n: 1, qIdx: 0, cells: [cell(1, READ), cell(2, "x = df['없는 열']")] })];
    h.openai.containerStatus = "expired";
    h.openai.responses.push(() => replayingTurn(`${REPLAY_MARKER} ok=1 failed=1\n${REPLAY_MARKER}_ERROR Q1-C2 KeyError: '없는 열'\n`));
    await readEvents(await POST(request()));
    expect(stored().restore).toMatchObject({ mode: "file", status: "partial", ok_cells: 1, failed_cells: 1 });

    h.inserts.messages.length = 0;
    h.inserts.ai_events.length = 0;
    h.openai.calls.length = 0;
    h.openai.responses.push(() => replayingTurn("Traceback (most recent call last):\nFileNotFoundError"));
    await readEvents(await POST(request()));
    expect(stored().restore).toMatchObject({ mode: "file", status: "incomplete" });
  });

  it("복원 파일을 올리지 못하면 모델이 코드를 다시 실행하는 지시로 물러나고 inline 으로 기록한다", async () => {
    h.db.aiMessages = [record({ n: 1, qIdx: 0, cells: [cell(1, READ)] })];
    h.openai.containerStatus = "expired";
    h.openai.failContainerFileUpload = true;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    const [block] = developerOf(responseCalls()[0]);
    expect(block.startsWith(REPLAY_INSTRUCTION_HEADER)).toBe(true);
    expect(block).toContain("아래 코드를 python 도구로 순서대로 다시 실행해 이전 상태를 복원하세요.");
    expect(block).not.toContain("exec(open(");
    expect(stored().restore).toMatchObject({ mode: "inline", status: "ok", refs: [{ m: idOf(1), i: 1 }] });
    expect(h.logError.mock.calls.some((c) => String(c[0]).includes("falling back to inline replay"))).toBe(true);
  });

  it("지난 턴의 복원이 덜 끝났으면 컨테이너가 살아 있어도 새 컨테이너로 다시 복원한다(원래 셀과 그 뒤 셀로)", async () => {
    h.db.aiMessages = [
      record({ n: 1, qIdx: 0, container: "cntr_a", cells: [cell(1, READ), cell(2, "df = df[~mask]")] }),
      record({
        n: 2,
        qIdx: 0,
        container: "cntr_b",
        outcome: "client_cancelled",
        cells: [cell(1, `exec(open("/mnt/data/x-${REPLAY_FILE_NAME}").read())`, "failed", { replay: true }), cell(2, "X = scale(df)")],
        restore: { refs: [{ m: idOf(1), i: 1 }, { m: idOf(1), i: 2 }], mode: "file", status: "incomplete" },
      }),
    ];
    h.openai.containerStatus = "running";
    h.openai.responses.push(() => replayingTurn(`${REPLAY_MARKER} ok=3 failed=0\n`));
    const events = await readEvents(await POST(request()));

    // 살아 있는 컨테이너라도 조회 없이 새로 만든다(같은 파일 id).
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /containers",
      "POST /containers/cntr_1/files",
      "POST /responses",
    ]);
    expect(replayedCodes()).toEqual([READ, "df = df[~mask]", "X = scale(df)"]);
    expect(stored().restore).toMatchObject({
      refs: [
        { m: idOf(1), i: 1 },
        { m: idOf(1), i: 2 },
        { m: idOf(2), i: 2 },
      ],
      status: "ok",
      attempt: 2,
    });
    expect(stored().notices).toEqual(["environment_restarted"]);
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ restore_retry: true, restore_attempt: 2 });
    expect(events.filter((e) => e.event === "status").map((e) => e.data.phase)).toContain("restarting");
  });

  it("다시 복원도 덜 끝나면 더는 복원하지 않고 학생에게 필요한 단계를 다시 요청하라고 알린다(기록에 남김)", async () => {
    h.db.aiMessages = [
      record({ n: 1, qIdx: 0, container: "cntr_a", cells: [cell(1, READ)] }),
      record({
        n: 2,
        qIdx: 0,
        container: "cntr_b",
        outcome: "time_limit",
        cells: [cell(1, `exec(open("/mnt/data/x-${REPLAY_FILE_NAME}").read())`, "incomplete", { replay: true })],
        restore: { refs: [{ m: idOf(1), i: 1 }], mode: "file", status: "incomplete" },
      }),
    ];
    // 다시 복원한 턴에서도 모델이 복원 셀을 끝까지 돌리지 못했다(결과 줄 없음).
    h.openai.responses.push(() => replayingTurn("Traceback (most recent call last):\nTimeoutError"));
    const events = await readEvents(await POST(request()));
    expect(stored().restore).toMatchObject({ status: "incomplete", attempt: 2 });
    expect(stored().notices).toEqual(["environment_restarted", "restore_abandoned"]);
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ restore_abandoned: true, restore_attempt: 2 });
    const done = events.find((e) => e.event === "done")!.data.message as Row;
    expect((done.analysis as Row).notices).toEqual(["environment_restarted", "restore_abandoned"]);

    // 그다음 턴은 다시 복원하지 않고 지금 컨테이너를 그대로 쓴다.
    h.db.aiMessages = [...h.db.aiMessages, ...aiMessages()];
    h.inserts.messages.length = 0;
    h.inserts.ai_events.length = 0;
    h.openai.calls.length = 0;
    h.openai.containerFiles.length = 0;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /containers/cntr_1", "POST /responses"]);
    expect(developerOf(responseCalls()[0]).some((b) => b.startsWith(REPLAY_INSTRUCTION_HEADER))).toBe(false);
    expect(stored()).not.toHaveProperty("restore");
    expect(h.inserts.ai_events[0].metadata).toMatchObject({ restore_retry: false });
  });

  it("만료 복원 뒤 새 문항의 첫 턴은 복원 전 다른 문항의 셀도 연결 블록으로 받는다(재검토 5.1)", async () => {
    h.db.exam!.questions = [
      { id: "q-1", ai_role: "analysis_partner" },
      { id: "q-2", ai_role: "analysis_partner" },
      { id: "q-3", ai_role: "analysis_partner" },
    ];
    h.db.aiMessages = [
      record({ n: 1, qIdx: 0, container: "cntr_c1", cells: [cell(1, READ)] }),
      record({ n: 2, qIdx: 1, container: "cntr_c1", cells: [cell(1, "df = df[~iqr_mask]")] }),
      record({
        n: 3,
        qIdx: 1,
        container: "cntr_c2",
        cells: [
          cell(1, `exec(open("/mnt/data/x-${REPLAY_FILE_NAME}").read())`, "completed", { replay: true }),
          cell(2, "km = KMeans(4).fit(X)"),
        ],
        restore: { refs: [{ m: idOf(1), i: 1 }, { m: idOf(2), i: 1 }], mode: "file", status: "ok" },
      }),
    ];
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request({ questionIdx: 2, questionId: "q-3" })));
    expect(h.openai.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /containers/cntr_c2", "POST /responses"]);
    const [block] = developerOf(responseCalls()[0]);
    expect(block.startsWith(LINKED_CODE_HEADER)).toBe(true);
    expect(block).toContain(`# 문제 1 셀 1\n${READ}\n\n# 문제 2 셀 1\ndf = df[~iqr_mask]\n\n# 문제 2 셀 2\nkm = KMeans(4).fit(X)`);
    expect(block).not.toContain("exec(open(");
    expect(stored()).toMatchObject({ linked_cells: 3 });
  });

  it("만료 복원 뒤에도 같은 문항에서 중단된 요청의 셀(복원 전 실행)을 다음 턴에 알린다", async () => {
    h.db.aiMessages = [
      record({ n: 1, qIdx: 0, container: "cntr_c1", cells: [cell(1, READ)] }),
      record({ n: 2, qIdx: 0, container: "cntr_c1", outcome: "time_limit", cells: [cell(1, "df = df[~iqr_mask]")] }),
      record({
        n: 3,
        qIdx: 1,
        container: "cntr_c2",
        cells: [cell(1, `exec(open("/mnt/data/x-${REPLAY_FILE_NAME}").read())`, "completed", { replay: true })],
        restore: { refs: [{ m: idOf(1), i: 1 }, { m: idOf(2), i: 1 }], mode: "file", status: "ok" },
      }),
    ];
    h.db.prevResponseId = "resp_t1";
    h.db.prevResponseQIdx = 0;
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    await readEvents(await POST(request()));
    const blocks = developerOf(responseCalls()[0]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startsWith(INTERRUPTED_CODE_HEADER)).toBe(true);
    expect(blocks[0]).toContain("# 문제 1 셀 1\ndf = df[~iqr_mask]");
    expect(stored()).toMatchObject({ interrupted_cells: 1 });
  });

  it("두 번째 만료에서도 복원 셀이나 잘린 합본이 아니라 원래 셀로 복원 파일을 만든다", async () => {
    h.db.aiMessages = [
      record({
        n: 1,
        qIdx: 0,
        container: "cntr_a",
        cells: [cell(1, READ), cell(2, "df = df[~mask]"), cell(3, "X = scale(df)"), cell(4, "km = KMeans(4).fit(X)")],
      }),
      record({
        n: 2,
        qIdx: 1,
        container: "cntr_b",
        cells: [
          cell(1, `exec(open("/mnt/data/x-${REPLAY_FILE_NAME}").read())`, "completed", { replay: true }),
          cell(2, "merged" + "z".repeat(40), "completed", { code_truncated: true }),
          cell(3, "profile = df.groupby(km.labels_).mean()"),
        ],
        restore: {
          refs: [1, 2, 3, 4].map((i) => ({ m: idOf(1), i })),
          mode: "file",
          status: "ok",
          ok_cells: 4,
          failed_cells: 0,
        },
      }),
    ];
    h.openai.containerStatus = "expired";
    h.openai.responses.push(() => replayingTurn(`${REPLAY_MARKER} ok=5 failed=0\n`));
    await readEvents(await POST(request({ questionIdx: 0 })));
    expect(replayedCodes()).toEqual([
      READ,
      "df = df[~mask]",
      "X = scale(df)",
      "km = KMeans(4).fit(X)",
      "profile = df.groupby(km.labels_).mean()",
    ]);
  });

  it("호출 중 만료 복구는 한 번뿐이다(두 번째도 만료면 더 돌지 않는다)", async () => {
    h.db.aiMessages = [record({ n: 1, qIdx: 0, cells: [cell(1, READ)] })];
    const expired = () => jsonResponse(400, { error: { message: "Container is expired.", type: "invalid_request_error" } });
    h.openai.responses.push(expired, expired, expired);
    const events = await readEvents(await POST(request()));
    expect(responseCalls()).toHaveLength(2);
    expect(events.at(-1)?.event).toBe("error");
    expect(h.inserts.ai_events).toHaveLength(1);
  });
});

describe("리뷰 반영: 보안 확인과 연결 끊김 뒤 기록", () => {
  it("닫힌 시험이면 403 이고 아무것도 부르지 않는다", async () => {
    h.db.exam = { ...h.db.exam!, status: "closed" };
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "EXAM_CLOSED" });
    expect(h.openai.calls).toEqual([]);
    expect(h.inserts.messages).toEqual([]);
  });

  it("속도 제한에 걸리면 429 이고 아무것도 부르지 않는다", async () => {
    vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({ allowed: false } as never);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(vi.mocked(checkRateLimitAsync).mock.calls[0][0]).toBe(`chat-analysis:${STUDENT}`);
    expect(h.openai.calls).toEqual([]);
  });

  it("요청의 studentId 가 로그인 사용자와 다르면 세션이 본인 것이어도 403 이다", async () => {
    const res = await POST(request({ studentId: "someone-else" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "FORBIDDEN" });
    expect(h.openai.calls).toEqual([]);
    expect(h.inserts.messages).toEqual([]);
  });

  it("파일 인용 그림은 이 턴의 컨테이너 것만 내려받는다(다른 컨테이너를 가리키는 인용은 무시)", async () => {
    const text = "그림입니다.";
    h.openai.responses.push(() =>
      sseResponse([
        { type: "response.created", response: { id: "resp_c", model: "gpt-x" } },
        { type: "response.output_text.delta", delta: text },
        {
          type: "response.completed",
          response: {
            id: "resp_c",
            model: "gpt-x",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text,
                    annotations: [
                      { type: "container_file_citation", container_id: "cntr_other", file_id: "cfile_x", filename: "a.png" },
                    ],
                  },
                ],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ])
    );
    await readEvents(await POST(request()));
    expect(h.openai.calls.some((c) => c.path.includes("cntr_other"))).toBe(false);
    expect(aiMessages()).toHaveLength(1);
  });

  it("턴을 after() 에 맡겨, 학생이 연결을 끊어도 턴이 끝까지 돌고 ai_events 를 남긴다", async () => {
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const res = await POST(request());
    expect(h.afterTasks).toHaveLength(1);
    expect(h.afterTasks[0]).toBeInstanceOf(Promise);
    await res.body!.cancel();
    await h.afterTasks[0];
    expect(h.inserts.ai_events).toHaveLength(1);
  });
});

describe("오류와 상한", () => {
  it("잔액 소진은 재시도하지 않고 quota_exhausted 를 보내며 서버 로그에 남긴다", async () => {
    h.openai.responses.push(() =>
      jsonResponse(429, { error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "credit_balance_exhausted" } }, {
        "retry-after": "1",
      })
    );
    const events = await readEvents(await POST(request()));
    expect(responseCalls()).toHaveLength(1);
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "quota_exhausted" } });
    expect(aiMessages()).toEqual([]);
    expect(h.inserts.ai_events).toHaveLength(1);
    expect(h.inserts.ai_events[0]).toMatchObject({ status: "error", error_code: "credit_balance_exhausted" });
    expect(h.logError.mock.calls.some((c) => String(c[0]).includes("credit exhausted"))).toBe(true);
  });

  it("셀이 12개를 넘으면 중단하고 실패 턴으로 기록한다(실행한 셀은 남고 이어 쓰지 않는다)", async () => {
    h.openai.responses.push(() => sseResponse(turnEvents(13)));
    const events = await readEvents(await POST(request()));
    const last = events.at(-1)!;
    expect(last.event).toBe("error");
    expect(last.data.code).toBe("limit_exceeded");
    expect(aiMessages()).toHaveLength(1);
    expect(aiMessages()[0].response_id).toBeNull();
    const analysis = (aiMessages()[0].metadata as Row).analysis as Row;
    expect(analysis.outcome).toBe("cell_limit");
    expect(analysis.cells).toHaveLength(12);
    expect(((last.data.message as Row).analysis as Row).outcome).toBe("cell_limit");
    expect(h.inserts.ai_events[0]).toMatchObject({ status: "error", error_code: "analysis_cell_limit" });
  });

  it("컨테이너를 준비하지 못하면 아무것도 저장하지 않고 tool_unavailable 이다", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse(500, { error: { message: "files down" } }));
    const events = await readEvents(await POST(request()));
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "tool_unavailable" } });
    expect(h.inserts.messages).toEqual([]);
    expect(h.inserts.ai_events).toHaveLength(1);
  });
});

describe("ai_events 는 정확히 한 번", () => {
  it("화면 전송이 마지막 단계에서 실패해도(예외) 이벤트를 두 번 쓰지 않는다", async () => {
    const { runAnalysisTurn } = await import("@/lib/analysis-exec/turn-runner");
    h.openai.responses.push(() => sseResponse(turnEvents(1)));
    const sent: string[] = [];
    await runAnalysisTurn(
      {
        supabase: makeSupabase() as never,
        http: { apiKey: "test-key-not-real", baseUrl: "https://api.openai.test/v1" },
        model: "gpt-test-requested",
        userId: STUDENT,
        sessionId: SID,
        examId: EXAM_ID,
        qIdx: 0,
        message: "데이터를 점검해 주세요",
        examCode: "TST001",
        dataSources: [{ url: DATA_URL, fileName: "a.xlsx", extension: "xlsx" }],
        startedAtMs: Date.now(),
        clientSignal: new AbortController().signal,
      },
      (event) => {
        sent.push(event.event);
        if (event.event === "done") throw new Error("client stream closed");
      }
    );
    expect(sent).toContain("done");
    expect(sent.at(-1)).toBe("error");
    expect(h.inserts.ai_events).toHaveLength(1);
    expect(h.inserts.ai_events[0]).toMatchObject({ status: "success" });
  });
});

describe("준비 중 연결 끊김", () => {
  it("컨테이너 준비 중에 학생이 끊어도 ai_events 를 한 번 남기고 아무것도 저장하지 않는다", async () => {
    const { runAnalysisTurn } = await import("@/lib/analysis-exec/turn-runner");
    const client = new AbortController();
    // 파일 업로드 도중 끊긴다.
    fetchMock.mockImplementationOnce(async () => {
      client.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await runAnalysisTurn(
      {
        supabase: makeSupabase() as never,
        http: { apiKey: "test-key-not-real", baseUrl: "https://api.openai.test/v1" },
        model: "gpt-test-requested",
        userId: STUDENT,
        sessionId: SID,
        examId: EXAM_ID,
        qIdx: 0,
        message: "데이터를 점검해 주세요",
        examCode: "TST001",
        dataSources: [{ url: DATA_URL, fileName: "a.xlsx", extension: "xlsx" }],
        startedAtMs: Date.now(),
        clientSignal: client.signal,
      },
      () => undefined
    );
    expect(h.inserts.messages).toEqual([]);
    expect(h.inserts.ai_events).toHaveLength(1);
    expect(h.inserts.ai_events[0]).toMatchObject({ status: "client_cancelled", feature: "student_chat_analysis" });
  });
});
