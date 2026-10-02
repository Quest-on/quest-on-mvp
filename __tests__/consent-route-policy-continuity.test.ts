/**
 * 동의 연속성 예외 `ownsInProgressSession` 회귀 (#531).
 *
 * 스테이징과 운영 DB 에는 `sessions.exam_id → exams.id` 외래키가 없다. 그런데 이 함수는
 * `sessions` 에서 `exams!inner(code)` 를 임베드해 조회했고, 그 조회가 항상 `PGRST200` 으로
 * 실패해 함수가 언제나 false 를 돌려줬다(`!error && !!data`). 동의를 마치지 못한 학생은 이미
 * 진행 중인 시험에서도 연속성 예외를 받지 못하고, enforce 에서 428 로 끊겼다.
 *
 * 이 파일의 DB 는 FK 가 없는 PostgREST 의 관찰 가능한 동작을 흉내 낸다(#525 의
 * `submit-exam-session-lookup.test.ts` 와 같은 방식). 마지막 절의 "모킹 DB 자체 점검"이 그
 * 동작을 고정한다 — 모킹이 느슨하면 위의 단언들이 공허하게 통과한다.
 *   - select 에 적은 컬럼만 돌려준다. 모르는 컬럼이면 42703.
 *   - 임베드(`관계(...)`)는 FK 가 없는 DB 처럼 PGRST200. 임베드 없이 `exams.code` 로 거는
 *     필터도 같은 오류다.
 *   - `.eq`/`.in` 필터를 실제로 적용한다. `.maybeSingle()` 은 행이 둘 이상이면 PGRST116.
 *   - uuid 컬럼에 uuid 모양이 아닌 값으로 거는 필터는 22P02.
 *
 * 함수는 false 가 "안전한 쪽"이다(연속성 예외를 주지 않는다). 그래서 false 를 기대하는
 * 단언은 구현이 항상 false 를 돌려주던 때에도 통과한다. 그걸 막는 건 true 를 기대하는
 * 단언과, 조회 모양(임베드 없음, 필터)·오류 로그 단언이다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseMock, logErrorMock, logInfoMock, evaluateConsentGateMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn(),
  evaluateConsentGateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock, logInfo: logInfoMock }));
vi.mock("@/lib/consent-gate", () => ({ evaluateConsentGate: evaluateConsentGateMock }));

import { assertConsentOrRespond, ownsInProgressSession } from "@/lib/consent-route-policy";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
type DbError = { code: string; message: string; details?: string | null; hint?: string | null };
type Filter = { op: "eq" | "in"; column: string; value: unknown };
type QueryLog = { table: string; columns: string; filters: Filter[] };

// prisma/schema.prisma 의 sessions·exams 컬럼. 여기에 없는 컬럼을 읽으면 42703 이다.
const TABLE_COLUMNS: Record<string, string[]> = {
  sessions: [
    "id", "exam_id", "student_id", "used_clarifications", "created_at", "submitted_at",
    "compressed_session_data", "compression_metadata", "ai_summary", "grading_progress",
    "status", "started_at", "attempt_timer_started_at", "auto_submitted",
    "preflight_accepted_at", "late_entry_approved_at", "late_entry_denied_at", "is_active",
    "last_heartbeat_at", "device_fingerprint", "final_answer", "final_answer_updated_at",
  ],
  exams: [
    "id", "title", "code", "description", "duration", "questions", "status", "instructor_id",
    "student_count", "created_at", "updated_at", "materials", "rubric", "open_at", "close_at",
    "started_at", "allow_draft_in_waiting", "allow_chat_in_waiting", "chat_weight",
    "score_weights", "rubric_public", "materials_text", "rag_status", "type", "deadline",
    "assignment_prompt", "initial_state", "canvas_config", "grades_released", "language",
    "is_demo", "first_published_at",
  ],
};
// uuid 타입 컬럼. student_id 는 text 다.
const UUID_COLUMNS: Record<string, string[]> = { sessions: ["id", "exam_id"], exams: ["id"] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 스테이징 service role 이 실제로 받은 오류와 같은 모양이다. */
function embedError(table: string, relation: string): DbError {
  return {
    code: "PGRST200",
    details: `Searched for a foreign key relationship between '${table}' and '${relation}' in the schema 'public', but no matches were found.`,
    hint: null,
    message: `Could not find a relationship between '${table}' and '${relation}' in the schema cache`,
  };
}
function columnError(table: string, column: string): DbError {
  return { code: "42703", details: null, hint: null, message: `column ${table}.${column} does not exist` };
}
function invalidUuid(value: unknown): DbError {
  return { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${String(value)}"` };
}
function multipleRows(count: number): DbError {
  return {
    code: "PGRST116",
    details: `The result contains ${count} rows`,
    hint: null,
    message: "JSON object requested, multiple (or no) rows returned",
  };
}
const TIMEOUT: DbError = { code: "57014", details: null, hint: null, message: "canceling statement due to statement timeout" };

// select 문자열 안의 `관계(...)` 또는 `관계!inner(...)` 임베드.
const EMBED = /\b[a-z_]+\s*(?:!\w+)?\s*\(/i;

/** 괄호 안의 쉼표는 나누지 않는 select 문자열 분해. */
function splitSelect(columns: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

type Mode = "list" | "maybeSingle";

function execute(table: string, query: QueryLog, rows: Row[], mode: Mode): Result {
  const known = TABLE_COLUMNS[table];
  const parts = splitSelect(query.columns);

  for (const part of parts) {
    if (part.includes("(")) {
      const relation = part.match(/^(\w+)/)?.[1] ?? part;
      return { data: null, error: embedError(table, relation) };
    }
    if (part !== "*" && !known.includes(part)) return { data: null, error: columnError(table, part) };
  }
  for (const { column, value } of query.filters) {
    // `exams.code` 같은 임베드 리소스 필터. FK 가 없으면 관계를 찾지 못한다.
    if (column.includes(".")) return { data: null, error: embedError(table, column.split(".")[0]) };
    if (!known.includes(column)) return { data: null, error: columnError(table, column) };
    if (UUID_COLUMNS[table].includes(column)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item !== "string" || !UUID.test(item)) return { data: null, error: invalidUuid(item) };
      }
    }
  }

  const matched = rows.filter((row) =>
    query.filters.every(({ op, column, value }) =>
      op === "eq" ? row[column] === value : (value as unknown[]).includes(row[column]),
    ),
  );
  const wanted = parts.includes("*") ? known : parts;
  const project = (row: Row) => Object.fromEntries(wanted.map((column) => [column, column in row ? row[column] : null]));

  if (mode === "list") return { data: matched.map(project), error: null };
  if (matched.length > 1) return { data: null, error: multipleRows(matched.length) };
  return { data: matched.length === 1 ? project(matched[0]) : null, error: null };
}

const STUDENT = "student-1";
const OTHER_STUDENT = "student-2";

const EXAM_A = "11111111-1111-4111-8111-111111111111";
const EXAM_B = "22222222-2222-4222-8222-222222222222";
const EXAM_GONE = "33333333-3333-4333-8333-333333333333";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_ORPHAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SESSION_DUP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CODE_A = "ALPHA1";
const CODE_B = "BRAVO2";

const examRow = (overrides: Row = {}): Row => ({ id: EXAM_A, code: CODE_A, ...overrides });
const sessionRow = (overrides: Row = {}): Row => ({
  id: SESSION_A,
  exam_id: EXAM_A,
  student_id: STUDENT,
  status: "in_progress",
  submitted_at: null,
  ...overrides,
});

/**
 * 기본 DB: 시험 A, B. 본인의 시험 A 진행 중 세션, 본인의 시험 B 제출된 세션(같은 학생의 다른 시험,
 * 미끼), 다른 학생의 시험 A 진행 중 세션(미끼).
 */
const defaultExams = (): Row[] => [examRow(), examRow({ id: EXAM_B, code: CODE_B })];
const defaultSessions = (): Row[] => [
  sessionRow(),
  sessionRow({ id: SESSION_B, exam_id: EXAM_B, status: "submitted", submitted_at: "2026-10-01T00:00:00Z" }),
  sessionRow({ id: SESSION_OTHER, student_id: OTHER_STUDENT }),
];

/** 모킹 DB 를 설치하고 실행된 조회(테이블, select 문자열, 필터)를 돌려준다. */
function installDb(
  options: { sessions?: Row[]; exams?: Row[]; sessionsError?: DbError; examsError?: DbError } = {},
) {
  const queries: QueryLog[] = [];
  const data: Record<string, Row[]> = {
    sessions: options.sessions ?? defaultSessions(),
    exams: options.exams ?? defaultExams(),
  };
  const injected: Record<string, DbError | undefined> = { sessions: options.sessionsError, exams: options.examsError };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "sessions" && table !== "exams") throw new Error(`No mock configured for table ${table}`);
    const query: QueryLog = { table, columns: "", filters: [] };
    queries.push(query);
    const run = (mode: Mode): Result =>
      injected[table] ? { data: null, error: injected[table] } : execute(table, query, data[table], mode);
    const builder = {
      select: vi.fn((columns: string) => {
        query.columns = columns;
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push({ op: "eq", column, value });
        return builder;
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        query.filters.push({ op: "in", column, value });
        return builder;
      }),
      maybeSingle: vi.fn(async (): Promise<Result> => run("maybeSingle")),
      // `await query` 로 목록을 받는 형태(postgrest 빌더는 thenable 이다).
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run("list")).then(resolve, reject),
    };
    return builder;
  });

  return queries;
}

const only = (queries: QueryLog[], table: string) => queries.filter((query) => query.table === table);
const owns = (pathname: string, body?: Record<string, unknown>) => ownsInProgressSession(STUDENT, pathname, body);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("ownsInProgressSession (#531) — FK 가 없는 DB", () => {
  describe("(a) sessionId 로 요청한다", () => {
    it("본인의 in_progress 세션이면 true (body.sessionId)", async () => {
      installDb();
      await expect(owns("/api/supa", { action: "submit_exam", sessionId: SESSION_A })).resolves.toBe(true);
    });

    it("본인의 in_progress 세션이면 true (경로의 sessionId: GET /api/session/{id})", async () => {
      installDb();
      await expect(owns(`/api/session/${SESSION_A}`)).resolves.toBe(true);
    });

    it("본인의 in_progress 세션이면 true (경로의 sessionId: 학생 deadline-auto-submit)", async () => {
      installDb();
      await expect(owns(`/api/student/session/${SESSION_A}/deadline-auto-submit`)).resolves.toBe(true);
    });

    it("다른 학생의 in_progress 세션이면 false", async () => {
      installDb();
      await expect(owns("/api/supa", { sessionId: SESSION_OTHER })).resolves.toBe(false);
    });

    it("제출된 세션이면 false", async () => {
      installDb();
      await expect(owns("/api/supa", { sessionId: SESSION_B })).resolves.toBe(false);
    });

    it.each(["not_joined", "joined", "waiting", "submitted", "auto_submitted", "locked"])(
      "status 가 %s 이면 false",
      async (status) => {
        installDb({ sessions: [sessionRow({ status })] });
        await expect(owns("/api/supa", { sessionId: SESSION_A })).resolves.toBe(false);
      },
    );

    it("status 가 null 이어도 false", async () => {
      installDb({ sessions: [sessionRow({ status: null })] });
      await expect(owns("/api/supa", { sessionId: SESSION_A })).resolves.toBe(false);
    });

    it("없는 세션이면 false", async () => {
      installDb();
      await expect(owns("/api/supa", { sessionId: "99999999-9999-4999-8999-999999999999" })).resolves.toBe(false);
    });

    it("세션의 시험 행이 없으면(고아 세션) false — 기존 inner join 과 같다", async () => {
      installDb({ sessions: [sessionRow({ id: SESSION_ORPHAN, exam_id: EXAM_GONE })] });
      await expect(owns("/api/supa", { sessionId: SESSION_ORPHAN })).resolves.toBe(false);
    });
  });

  describe("(b) examId 로 요청한다", () => {
    it("본인이 그 시험에 in_progress 세션이 있으면 true", async () => {
      installDb();
      await expect(owns("/api/supa", { action: "save_draft", examId: EXAM_A })).resolves.toBe(true);
    });

    it("그 시험의 본인 세션이 이미 제출됐으면 false (같은 학생의 다른 시험 세션이 in_progress 여도)", async () => {
      installDb({
        sessions: [
          sessionRow({ status: "submitted", submitted_at: "2026-10-01T00:00:00Z" }),
          sessionRow({ id: SESSION_B, exam_id: EXAM_B }),
        ],
      });
      await expect(owns("/api/supa", { examId: EXAM_A })).resolves.toBe(false);
    });

    it("그 시험에 세션이 없으면 false", async () => {
      installDb({ sessions: [sessionRow({ id: SESSION_B, exam_id: EXAM_B })] });
      await expect(owns("/api/supa", { examId: EXAM_A })).resolves.toBe(false);
    });

    it("다른 학생의 세션만 있으면 false", async () => {
      installDb({ sessions: [sessionRow({ student_id: OTHER_STUDENT })] });
      await expect(owns("/api/supa", { examId: EXAM_A })).resolves.toBe(false);
    });

    it("sessionId 와 examId 를 함께 주면 둘 다 맞아야 true", async () => {
      installDb();
      await expect(owns("/api/supa", { sessionId: SESSION_A, examId: EXAM_A })).resolves.toBe(true);
      await expect(owns("/api/supa", { sessionId: SESSION_A, examId: EXAM_B })).resolves.toBe(false);
    });

    it("시험 행이 없는 examId 면 false (고아 세션)", async () => {
      installDb({ sessions: [sessionRow({ exam_id: EXAM_GONE })] });
      await expect(owns("/api/supa", { examId: EXAM_GONE })).resolves.toBe(false);
    });
  });

  describe("(c) examCode 로 요청한다", () => {
    it("시험 코드가 본인 in_progress 세션의 시험과 일치하면 true (페이지 경로 /exam/{code})", async () => {
      installDb();
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(true);
    });

    it("시험 코드가 일치하면 true (과제 페이지 /assignment/{code})", async () => {
      installDb();
      await expect(owns(`/assignment/${CODE_A}`)).resolves.toBe(true);
    });

    it("시험 코드가 일치하면 true (body.examCode)", async () => {
      installDb();
      await expect(owns("/api/supa", { action: "create_or_get_session", examCode: CODE_A })).resolves.toBe(true);
    });

    it("다른 시험의 코드면 false — 같은 학생의 다른 시험 세션이 in_progress 여도 그 코드의 시험이 아니다", async () => {
      // 본인은 시험 A 만 진행 중이다. 시험 B 의 코드로 요청하면 예외가 없어야 한다.
      installDb();
      await expect(owns(`/exam/${CODE_B}`)).resolves.toBe(false);
    });

    it("본인이 시험 B 에 in_progress 세션이 있으면 B 의 코드는 true, A 의 코드는 시험 A 세션에 달렸다", async () => {
      installDb({ sessions: [sessionRow({ id: SESSION_B, exam_id: EXAM_B })] });
      await expect(owns(`/exam/${CODE_B}`)).resolves.toBe(true);
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
    });

    it("같은 학생이 두 시험 모두 in_progress 여도 요청한 코드의 시험으로 판정한다(둘 다 true)", async () => {
      // sessions 를 먼저 읽고 나중에 코드를 대조하면 학생의 in_progress 세션이 둘이라 maybeSingle 이
      // 다중 행 오류를 내고 false 가 된다. 기존 필터(`exams.code`)는 코드의 시험으로 좁혀 읽었다.
      installDb({ sessions: [sessionRow(), sessionRow({ id: SESSION_B, exam_id: EXAM_B })] });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(true);
      await expect(owns(`/exam/${CODE_B}`)).resolves.toBe(true);
    });

    it("없는 시험 코드면 false", async () => {
      installDb();
      await expect(owns("/exam/NOPE00")).resolves.toBe(false);
    });

    it("시험 코드의 시험에 본인 세션이 없으면 false (다른 학생 세션만 있다)", async () => {
      installDb({ sessions: [sessionRow({ student_id: OTHER_STUDENT })] });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
    });

    it("시험 코드의 시험에 본인 세션이 제출됐으면 false", async () => {
      installDb({ sessions: [sessionRow({ status: "submitted", submitted_at: "2026-10-01T00:00:00Z" })] });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
    });

    it("sessionId 와 examCode 를 함께 주면 코드가 세션의 시험과 일치할 때만 true", async () => {
      installDb({ sessions: [sessionRow(), sessionRow({ id: SESSION_B, exam_id: EXAM_B })] });
      await expect(owns("/api/supa", { sessionId: SESSION_A, examCode: CODE_A })).resolves.toBe(true);
      // 세션은 본인의 진행 중 세션이지만 코드는 다른 시험의 것이다.
      await expect(owns("/api/supa", { sessionId: SESSION_A, examCode: CODE_B })).resolves.toBe(false);
    });

    it("examId 와 examCode 를 함께 주면 둘이 같은 시험일 때만 true", async () => {
      installDb({ sessions: [sessionRow(), sessionRow({ id: SESSION_B, exam_id: EXAM_B })] });
      await expect(owns("/api/supa", { examId: EXAM_A, examCode: CODE_A })).resolves.toBe(true);
      await expect(owns("/api/supa", { examId: EXAM_A, examCode: CODE_B })).resolves.toBe(false);
    });

    it("코드가 같은 시험이 둘이어도(코드 유니크가 DB 에 없을 때) 본인 세션이 있는 쪽이면 true", async () => {
      installDb({
        exams: [examRow(), examRow({ id: EXAM_B, code: CODE_A })],
        sessions: [sessionRow({ id: SESSION_B, exam_id: EXAM_B })],
      });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(true);
    });
  });

  describe("(d) 조회 오류와 행 없음을 구분한다", () => {
    it("행 없음은 오류 로그 없이 false", async () => {
      installDb({ sessions: [] });
      await expect(owns("/api/supa", { sessionId: SESSION_A })).resolves.toBe(false);
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
      await expect(owns("/exam/NOPE00")).resolves.toBe(false);
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it("sessions 조회 오류는 logError 로 남기고 false (fail-closed)", async () => {
      installDb({ sessionsError: TIMEOUT });
      await expect(owns("/api/supa", { sessionId: SESSION_A })).resolves.toBe(false);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock.mock.calls[0][1]).toBe(TIMEOUT);
    });

    it("exams 조회 오류(코드 → id)는 logError 로 남기고 false", async () => {
      installDb({ examsError: TIMEOUT });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock.mock.calls[0][1]).toBe(TIMEOUT);
    });

    it("exams 조회 오류(세션의 시험 존재 확인)도 logError 로 남기고 false", async () => {
      installDb({ examsError: TIMEOUT });
      await expect(owns("/api/supa", { sessionId: SESSION_A })).resolves.toBe(false);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock.mock.calls[0][1]).toBe(TIMEOUT);
    });

    it("오류는 true 로 읽히지 않는다 — 본인 세션이 있는 DB 에서 조회만 실패시켜도 false", async () => {
      installDb({ sessionsError: TIMEOUT });
      await expect(owns(`/exam/${CODE_A}`)).resolves.toBe(false);
      await expect(owns("/api/supa", { examId: EXAM_A })).resolves.toBe(false);
    });

    it("같은 학생·같은 시험에 in_progress 세션이 둘이면 기존 maybeSingle 처럼 false 이고 이상 징후로 남긴다", async () => {
      installDb({ sessions: [sessionRow(), sessionRow({ id: SESSION_DUP })] });
      await expect(owns("/api/supa", { examId: EXAM_A })).resolves.toBe(false);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect((logErrorMock.mock.calls[0][1] as DbError).code).toBe("PGRST116");
    });

    it("uuid 모양이 아닌 sessionId·examId 는 오류 로그 없이 false (클라이언트 입력이라 로그를 채우지 않는다)", async () => {
      installDb();
      await expect(owns("/api/supa", { sessionId: "not-a-uuid" })).resolves.toBe(false);
      await expect(owns("/api/supa", { examId: "not-a-uuid" })).resolves.toBe(false);
      expect(logErrorMock).not.toHaveBeenCalled();
    });
  });

  describe("(e) 입력이 모두 없으면 false", () => {
    it.each([
      ["body 없음", "/api/chat", undefined],
      ["빈 body", "/api/supa", {}],
      ["문자열이 아닌 값", "/api/supa", { sessionId: 1, examCode: null, examId: {} }],
      ["빈 문자열", "/api/supa", { sessionId: "", examCode: "", examId: "" }],
      ["식별자가 없는 경로", "/exam", undefined],
    ])("%s", async (_name, pathname, body) => {
      installDb();
      await expect(owns(pathname, body as Record<string, unknown> | undefined)).resolves.toBe(false);
      // DB 를 읽지도 않는다.
      expect(supabaseMock.from).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });
  });

  describe("조회 모양", () => {
    it("어떤 입력 조합에서도 select 문자열에 PostgREST 임베드가 없고 `exams.` 필터도 없다", async () => {
      const inputs: Array<[string, Record<string, unknown> | undefined]> = [
        ["/api/supa", { sessionId: SESSION_A }],
        ["/api/supa", { examId: EXAM_A }],
        ["/api/supa", { examCode: CODE_A }],
        ["/api/supa", { sessionId: SESSION_A, examId: EXAM_A, examCode: CODE_A }],
        [`/exam/${CODE_A}`, undefined],
        [`/api/session/${SESSION_A}`, undefined],
      ];
      for (const [pathname, body] of inputs) {
        supabaseMock.from.mockReset();
        const queries = installDb();
        await owns(pathname, body);
        expect(queries.length).toBeGreaterThan(0);
        for (const query of queries) {
          expect(query.columns, `${pathname} ${JSON.stringify(body)}`).not.toMatch(EMBED);
          expect(query.filters.some((filter) => filter.column.includes("."))).toBe(false);
        }
      }
    });

    it("sessions 조회는 항상 student_id 와 status=in_progress 로 건다", async () => {
      const queries = installDb();
      await owns("/api/supa", { sessionId: SESSION_A, examId: EXAM_A });
      await owns(`/exam/${CODE_A}`);

      const sessionQueries = only(queries, "sessions");
      expect(sessionQueries).toHaveLength(2);
      for (const query of sessionQueries) {
        expect(query.filters).toContainEqual({ op: "eq", column: "student_id", value: STUDENT });
        expect(query.filters).toContainEqual({ op: "eq", column: "status", value: "in_progress" });
        expect(splitSelect(query.columns)).toEqual(expect.arrayContaining(["id", "exam_id"]));
      }
    });

    it("sessionId·examId 를 있는 그대로 필터로 건다", async () => {
      const queries = installDb();
      await owns("/api/supa", { sessionId: SESSION_A, examId: EXAM_A });

      const [query] = only(queries, "sessions");
      expect(query.filters).toContainEqual({ op: "eq", column: "id", value: SESSION_A });
      expect(query.filters).toContainEqual({ op: "eq", column: "exam_id", value: EXAM_A });
    });

    it("examCode 가 있으면 exams 에서 code 로 id 만 읽고, 그 id 로 sessions 를 좁힌다", async () => {
      const queries = installDb();
      await owns(`/exam/${CODE_A}`);

      const [examQuery] = only(queries, "exams");
      expect(splitSelect(examQuery.columns)).toEqual(["id"]);
      expect(examQuery.filters).toEqual([{ op: "eq", column: "code", value: CODE_A }]);
      const [sessionQuery] = only(queries, "sessions");
      expect(sessionQuery.filters).toContainEqual({ op: "in", column: "exam_id", value: [EXAM_A] });
    });
  });
});

describe("assertConsentOrRespond — 동의 미완료 학생의 연속성 (#531)", () => {
  const INCOMPLETE = { complete: false, reason: "missing", currentRelease: null, missingKeys: [] };
  const decisions = () => logInfoMock.mock.calls.map((call) => (call[1] as { payload: { decision: string } }).payload.decision);

  beforeEach(() => {
    evaluateConsentGateMock.mockResolvedValue(INCOMPLETE);
  });

  it("enforce: 본인의 in_progress 세션에 대한 submit_exam 은 428 이 아니라 통과(allow_continuity)", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    installDb();

    const response = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", {
      action: "submit_exam",
      sessionId: SESSION_A,
      examId: EXAM_A,
    });

    expect(response).toBeNull();
    expect(decisions()).toEqual(["allow_continuity"]);
  });

  it.each(["save_draft", "session_heartbeat", "get_session_messages", "save_final_answer"])(
    "enforce: %s 도 본인의 in_progress 세션이면 통과",
    async (action) => {
      vi.stubEnv("CONSENT_GATE_MODE", "enforce");
      installDb();
      await expect(assertConsentOrRespond(STUDENT, "/api/supa", "POST", { action, sessionId: SESSION_A })).resolves.toBeNull();
    },
  );

  it("enforce: 다른 학생의 세션이면 428 CONSENT_REQUIRED", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    installDb();

    const response = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", {
      action: "submit_exam",
      sessionId: SESSION_OTHER,
      examId: EXAM_A,
    });

    expect(response?.status).toBe(428);
    await expect(response?.json()).resolves.toEqual({ error: "CONSENT_REQUIRED", redirect: "/onboarding" });
    expect(decisions()).toEqual(["block"]);
  });

  it("enforce: 진행 중인 세션이 없는 새 시작(init_exam_session)은 428 — 연속성이 아니다", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    installDb({ sessions: [] });

    const response = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", {
      action: "init_exam_session",
      examCode: CODE_A,
    });

    expect(response?.status).toBe(428);
  });

  it("enforce: 세션 조회가 DB 오류로 실패하면 428 (연속성 예외를 주지 않는다, fail-closed)", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    installDb({ sessionsError: TIMEOUT });

    const response = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", {
      action: "submit_exam",
      sessionId: SESSION_A,
    });

    expect(response?.status).toBe(428);
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });

  it("enforce: 연속성 경로가 아닌 액션은 본인의 in_progress 세션이 있어도 428", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    installDb();

    const response = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", {
      action: "get_instructor_exams",
      sessionId: SESSION_A,
    });

    expect(response?.status).toBe(428);
  });

  it.each(["shadow", "prompt"])("%s: API 를 막지 않고, 연속성 판정은 로그의 decision 에만 드러난다", async (mode) => {
    vi.stubEnv("CONSENT_GATE_MODE", mode);
    installDb();

    const own = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", { action: "submit_exam", sessionId: SESSION_A });
    const other = await assertConsentOrRespond(STUDENT, "/api/supa", "POST", { action: "submit_exam", sessionId: SESSION_OTHER });

    expect(own).toBeNull();
    expect(other).toBeNull();
    expect(decisions()).toEqual(["allow_continuity", "allow"]);
  });

  it("off: 게이트도 DB 도 읽지 않고 통과", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "off");
    installDb();

    await expect(assertConsentOrRespond(STUDENT, "/api/supa", "POST", { action: "submit_exam", sessionId: SESSION_A })).resolves.toBeNull();
    expect(evaluateConsentGateMock).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("동의를 마친 학생은 연속성 판정(DB 조회) 없이 통과", async () => {
    vi.stubEnv("CONSENT_GATE_MODE", "enforce");
    evaluateConsentGateMock.mockResolvedValue({ complete: true, currentRelease: {} });
    installDb();

    await expect(assertConsentOrRespond(STUDENT, "/api/supa", "POST", { action: "submit_exam", sessionId: SESSION_OTHER })).resolves.toBeNull();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe("모킹 DB 자체 점검 — 위 단언이 공허하지 않게 동작을 고정한다", () => {
  type MockBuilder = {
    select: (columns: string) => MockBuilder;
    eq: (column: string, value: unknown) => MockBuilder;
    in: (column: string, value: unknown[]) => MockBuilder;
    maybeSingle: () => Promise<Result>;
  } & PromiseLike<Result>;
  const run = (table: string, build: (builder: MockBuilder) => MockBuilder | Promise<Result>): Promise<Result> => {
    installDb();
    return Promise.resolve(build(supabaseMock.from(table) as MockBuilder));
  };

  it("sessions→exams 임베드는 PGRST200 이다 (이 이슈의 원인 조회)", async () => {
    const { data, error } = await run("sessions", (b) =>
      b.select("id, exam_id, exams!inner(code)").eq("student_id", STUDENT).eq("status", "in_progress").eq("exams.code", CODE_A).maybeSingle(),
    );
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "PGRST200" });
  });

  it("임베드 없이 `exams.code` 로 거는 필터도 FK 가 없으면 PGRST200 이다", async () => {
    const { error } = await run("sessions", (b) => b.select("id, exam_id").eq("exams.code", CODE_A).maybeSingle());
    expect(error).toMatchObject({ code: "PGRST200" });
  });

  it("모르는 컬럼은 42703 이다", async () => {
    const select = await run("sessions", (b) => b.select("id, nope").maybeSingle());
    expect(select.error).toMatchObject({ code: "42703" });
    const filter = await run("exams", (b) => b.select("id").eq("nope", "x"));
    expect(filter.error).toMatchObject({ code: "42703" });
  });

  it("select 에 적은 컬럼만 돌려준다", async () => {
    const { data } = await run("sessions", (b) => b.select("id, exam_id").eq("id", SESSION_A).maybeSingle());
    expect(data).toEqual({ id: SESSION_A, exam_id: EXAM_A });
  });

  it("`.eq` 와 `.in` 필터를 실제로 적용한다", async () => {
    const eq = await run("sessions", (b) => b.select("id").eq("student_id", STUDENT).eq("status", "in_progress"));
    expect(eq.data).toEqual([{ id: SESSION_A }]);
    const inFilter = await run("exams", (b) => b.select("id, code").in("id", [EXAM_B]));
    expect(inFilter.data).toEqual([{ id: EXAM_B, code: CODE_B }]);
  });

  it("maybeSingle 은 0 행이면 data null·오류 없음, 2 행 이상이면 PGRST116", async () => {
    const none = await run("sessions", (b) => b.select("id").eq("id", "99999999-9999-4999-8999-999999999999").maybeSingle());
    expect(none).toEqual({ data: null, error: null });
    const many = await run("sessions", (b) => b.select("id").eq("exam_id", EXAM_A).maybeSingle());
    expect(many.data).toBeNull();
    expect(many.error).toMatchObject({ code: "PGRST116" });
  });

  it("uuid 컬럼에 uuid 가 아닌 값으로 거는 필터는 22P02 이고 text 컬럼은 아니다", async () => {
    const bad = await run("sessions", (b) => b.select("id").eq("id", "not-a-uuid").maybeSingle());
    expect(bad.error).toMatchObject({ code: "22P02" });
    const text = await run("sessions", (b) => b.select("id").eq("student_id", "not-a-uuid"));
    expect(text.error).toBeNull();
  });
});
