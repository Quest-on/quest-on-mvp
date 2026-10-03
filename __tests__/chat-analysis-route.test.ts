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
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SseParser } from "@/lib/analysis-exec/sse";
import { STUDENT_CHAT_SPECS } from "@/lib/student-chat-spec";
import { ANALYSIS_MAX_OUTPUT_TOKENS } from "@/lib/analysis-exec/limits";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  logError: vi.fn(),
  visible: [] as Array<{ url: string; fileName: string; extension: string }>,
  inserts: { messages: [] as Row[], ai_events: [] as Row[] },
  uploads: [] as Array<{ bucket: string; path: string; contentType?: string }>,
  materialsSelects: 0,
  db: {
    session: null as Row | null,
    exam: null as Row | null,
    aiMessages: [] as Row[],
    prevResponseId: null as string | null,
  },
  openai: {
    calls: [] as Array<{ method: string; path: string; body: unknown }>,
    containerStatus: "running" as string,
    responses: [] as Array<() => Response>,
  },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: h.currentUser }));
vi.mock("@/lib/logger", () => ({ logError: h.logError, logInfo: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  RATE_LIMITS: { chat: { limit: 30, windowSec: 60 } },
}));
vi.mock("@/lib/message-classification", () => ({ classifyMessageType: vi.fn(async () => "calculation") }));
vi.mock("@/lib/student-materials", () => ({ getStudentVisibleMaterials: () => h.visible }));
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
      const state: { select?: string; insert?: Row[] } = {};
      const builder: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "is", "not", "in", "order", "limit"]) builder[m] = () => builder;
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
            return {
              data: {
                materials: [],
                student_materials: [],
                // 업로드 URL 에는 원래 이름이 없고, 텍스트 추출 기록에 있다.
                materials_text: [{ url: DATA_URL, fileName: "하냥센스_시험용_dataset.xlsx", text: "..." }],
              },
              error: null,
            };
          }
          return { data: h.db.exam, error: null };
        }
        if (table === "messages" && state.select === "response_id") {
          return { data: h.db.prevResponseId ? { response_id: h.db.prevResponseId } : null, error: null };
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
const DATA_URL = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-x/2026/a.xlsx";
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
  if (method === "POST" && path === "/files") return jsonResponse(200, { id: "file-up1" });
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
  h.openai.calls.length = 0;
  h.openai.responses.length = 0;
  h.openai.containerStatus = "running";
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
    // 원래 파일 이름은 텍스트 추출 기록에서 온다(URL 조각이 아니다).
    expect(instructions).toContain("(원래 파일 이름: <<<하냥센스_시험용_dataset.xlsx>>>)");
    expect(instructions).not.toContain("2026-10-03_0f8e");

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
    const done = events.find((e) => e.event === "done")!.data.message as Row;
    expect((done.analysis as Row).notices).toEqual(["environment_restarted"]);
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
