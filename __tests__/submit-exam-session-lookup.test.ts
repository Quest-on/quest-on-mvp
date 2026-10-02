/**
 * submit_exam 세션·시험 조회 회귀 (#525).
 *
 * 스테이징과 운영 DB 에는 `sessions.exam_id → exams.id` 외래키가 없다. 그런데
 * submitExam 의 세션 조회가 PostgREST 임베드 `exams(duration)` 를 써서 조회 자체가
 * `PGRST200` 으로 실패했고, 코드가 그 오류를 "세션 없음" 으로 읽어 404 SESSION_NOT_FOUND
 * 로 응답했다. 유효한 세션과 시험인데도 제출이 전부 실패했다.
 *
 * 이 파일의 DB 는 PostgREST 의 관찰 가능한 동작을 흉내 낸다. 마지막 절의 "모킹 DB 자체
 * 점검"이 그 동작을 고정한다 — 모킹이 느슨하면 아래 단언들이 공허하게 통과한다.
 *   - select 에 적은 컬럼만 돌려준다. 모르는 컬럼이면 42703.
 *   - 임베드(`관계(...)`)는 FK 가 없는 DB 처럼 PGRST200.
 *   - `.eq` 필터를 실제로 적용한다. `.single()` 은 행이 정확히 한 개가 아니면 PGRST116.
 * 그래서 select 컬럼을 빼먹거나, 엉뚱한 컬럼·값으로 필터를 걸거나, 없는 컬럼을 읽는
 * 변경은 모두 이 테스트에서 깨진다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, auditLogMock, logErrorMock, gradingMock, onboardingMock, supabaseMock } =
  vi.hoisted(() => ({
    currentUserMock: vi.fn(),
    auditLogMock: vi.fn(),
    logErrorMock: vi.fn(),
    gradingMock: vi.fn(),
    onboardingMock: vi.fn(),
    supabaseMock: { from: vi.fn(), rpc: vi.fn() },
  }));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/compression", () => ({
  compressData: () => ({ data: "compressed", metadata: { algorithm: "mock" } }),
}));
vi.mock("@/lib/audit", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));
vi.mock("@/lib/grading-trigger", () => ({ triggerGradingIfNeeded: gradingMock }));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: {
    DEMO_ANSWERED: "demo_answered",
    FIRST_PUBLISH: "first_publish",
    FIRST_STUDENT_SUBMISSION: "first_student_submission",
    STUDENT_DISCLOSURE_ACK: "student_disclosure_ack",
  },
  recordOnboardingEvent: onboardingMock,
  hasOnboardingEvent: vi.fn(async () => false),
}));

import { submitExam } from "@/app/api/supa/handlers/session-handlers";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
type DbError = { code: string; message: string; details?: string | null; hint?: string | null };
type QueryLog = { table: string; columns: string; filters: Array<[string, unknown]> };

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

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
const PGRST116: DbError = {
  code: "PGRST116",
  details: "The result contains 0 rows",
  hint: null,
  message: "JSON object requested, multiple (or no) rows returned",
};

// select 문자열 안의 `관계(...)` 또는 `관계!inner(...)` 임베드.
const EMBED = /\b[a-z_]+\s*(?:!\w+)?\s*\(/i;
const EXAMS_EMBED = /\bexams\s*(?:!\w+)?\s*\(/i;

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

function runSingle(table: string, query: QueryLog, rows: Row[]): Result {
  const known = TABLE_COLUMNS[table];
  const parts = splitSelect(query.columns);

  for (const part of parts) {
    if (part.includes("(")) {
      const relation = part.match(/^(\w+)/)?.[1] ?? part;
      return { data: null, error: embedError(table, relation) };
    }
    if (part !== "*" && !known.includes(part)) return { data: null, error: columnError(table, part) };
  }
  for (const [column] of query.filters) {
    if (!known.includes(column)) return { data: null, error: columnError(table, column) };
  }

  const matched = rows.filter((row) => query.filters.every(([column, value]) => row[column] === value));
  if (matched.length !== 1) return { data: null, error: PGRST116 };

  const wanted = parts.includes("*") ? known : parts;
  const row = matched[0];
  return {
    data: Object.fromEntries(wanted.map((column) => [column, column in row ? row[column] : null])),
    error: null,
  };
}

function sessionRow(overrides: Row = {}): Row {
  return {
    id: "session-1",
    exam_id: "exam-1",
    student_id: "student-1",
    submitted_at: null,
    status: "in_progress",
    started_at: ago(10 * MINUTE),
    attempt_timer_started_at: ago(10 * MINUTE),
    ...overrides,
  };
}

function examRow(overrides: Row = {}): Row {
  return {
    id: "exam-1",
    duration: 60,
    questions: [{ id: "q1" }, { id: "q2" }],
    is_demo: false,
    instructor_id: "instructor-1",
    ...overrides,
  };
}

// 같은 테이블의 다른 행. 필터를 잘못 걸면 이 행들 때문에 PGRST116 이 되거나 엉뚱한 값이 읽힌다.
const DECOY_SESSIONS: Row[] = [
  sessionRow({ id: "session-2", student_id: "student-2", attempt_timer_started_at: ago(10 * 24 * 60 * MINUTE) }),
  // 같은 학생의 다른 시험 세션. `student_id` 로 거는 필터는 두 행을 만나 깨진다.
  sessionRow({ id: "session-3", exam_id: "exam-2" }),
];
const DECOY_EXAMS: Row[] = [examRow({ id: "exam-2", duration: 1, questions: [] })];

/**
 * 모킹 DB 를 설치하고 실행된 조회(테이블, select 문자열, `.eq` 필터)를 돌려준다.
 * `session`/`exam` 이 null 이면 그 행이 없는 DB 다. `sessionError`/`examError` 는 조회 자체의
 * 실패(DB 오류)를 주입한다.
 */
function installDb(
  options: {
    session?: Row | null;
    exam?: Row | null;
    sessionError?: DbError;
    examError?: DbError;
  } = {},
) {
  const queries: QueryLog[] = [];
  const sessionRows = [...(options.session === null ? [] : [options.session ?? sessionRow()]), ...DECOY_SESSIONS];
  const examRows = [...(options.exam === null ? [] : [options.exam ?? examRow()]), ...DECOY_EXAMS];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "sessions" && table !== "exams") throw new Error(`No mock configured for table ${table}`);
    const query: QueryLog = { table, columns: "", filters: [] };
    queries.push(query);
    const builder = {
      select: vi.fn((columns: string) => {
        query.columns = columns;
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push([column, value]);
        return builder;
      }),
      single: vi.fn(async (): Promise<Result> => {
        if (table === "sessions") {
          if (options.sessionError) return { data: null, error: options.sessionError };
          return runSingle(table, query, sessionRows);
        }
        if (options.examError) return { data: null, error: options.examError };
        return runSingle(table, query, examRows);
      }),
    };
    return builder;
  });

  return queries;
}

const only = (queries: QueryLog[], table: string) => queries.filter((query) => query.table === table);

function request(overrides: Record<string, unknown> = {}) {
  return {
    examId: "exam-1",
    studentId: "student-1",
    sessionId: "session-1",
    answers: [{ text: "Answer 1" }, { text: "Answer 2" }],
    ...overrides,
  };
}

describe("submitExam 세션·시험 조회 (#525)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: "student-1" });
    auditLogMock.mockResolvedValue(true);
    gradingMock.mockResolvedValue({ queued: true });
    onboardingMock.mockResolvedValue(true);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe("(a) 세션 조회에 PostgREST 임베드가 없다", () => {
    it("sessions select 문자열에 `exams(` 를 포함한 어떤 임베드도 없다", async () => {
      const queries = installDb();

      await submitExam(request());

      const sessionSelects = only(queries, "sessions");
      expect(sessionSelects).toHaveLength(1);
      expect(sessionSelects[0].columns).not.toMatch(EXAMS_EMBED);
      expect(sessionSelects[0].columns).not.toMatch(EMBED);
    });

    it("sessions select 가 검사에 쓰는 컬럼(status, attempt_timer_started_at 등)을 모두 읽는다", async () => {
      const queries = installDb();

      await submitExam(request());

      const columns = splitSelect(only(queries, "sessions")[0].columns);
      for (const needed of ["id", "student_id", "exam_id", "submitted_at", "status", "attempt_timer_started_at"]) {
        expect(columns).toContain(needed);
      }
    });

    it("sessions→exams FK 가 없는 DB 에서도 유효한 세션이면 404 가 아니라 200 이다", async () => {
      installDb();

      const response = await submitExam(request());
      const body = await response.json();

      expect(body.error).not.toBe("SESSION_NOT_FOUND");
      expect(response.status).toBe(200);
    });

    it("세션은 id = sessionId 로만 조회한다", async () => {
      const queries = installDb();

      await submitExam(request());

      expect(only(queries, "sessions")[0].filters).toEqual([["id", "session-1"]]);
    });
  });

  describe("(b) 시험 시간 제한은 exams 조회의 duration 으로 같게 적용된다", () => {
    it("duration 을 exams 조회에서 읽고, exams 조회는 한 번뿐이며 id = examId 로 건다", async () => {
      const queries = installDb();

      await submitExam(request());

      const examSelects = only(queries, "exams");
      expect(examSelects).toHaveLength(1);
      const columns = splitSelect(examSelects[0].columns);
      // 기존 조회가 쓰던 컬럼(문항 수 검증, 데모 미리보기 판정)을 잃지 않는다.
      for (const needed of ["duration", "questions", "is_demo", "instructor_id"]) {
        expect(columns).toContain(needed);
      }
      expect(examSelects[0].filters).toEqual([["id", "exam-1"]]);
    });

    it("duration>0 이고 타이머 시작 후 시간이 지났으면 403 DEADLINE_EXCEEDED", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }),
        exam: examRow({ duration: 60 }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "DEADLINE_EXCEEDED" });
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it("duration 0 은 무제한이라 오래 지난 타이머여도 제출된다", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: ago(10 * 24 * 60 * MINUTE) }),
        exam: examRow({ duration: 0 }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    });

    it("시간이 남았으면 제출된다", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: ago(10 * MINUTE) }),
        exam: examRow({ duration: 60 }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("status 가 in_progress 가 아니면 마감 검사를 하지 않는다 (기존 조건 보존)", async () => {
      installDb({
        session: sessionRow({ status: "waiting", attempt_timer_started_at: ago(2 * 60 * MINUTE) }),
        exam: examRow({ duration: 60 }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("타이머가 아직 시작되지 않았으면(attempt_timer_started_at null) 마감 검사를 하지 않는다", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: null }),
        exam: examRow({ duration: 60 }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("검사 순서: 마감이 문항 수 검증보다 먼저다 (만료 + 답안 초과 → 403)", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }),
        exam: examRow({ duration: 60, questions: [{ id: "q1" }] }),
      });

      const response = await submitExam(request());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "DEADLINE_EXCEEDED" });
    });

    it("답안 수가 문항 수를 넘으면 400 VALIDATION_ERROR (시간이 남았을 때)", async () => {
      installDb({ exam: examRow({ questions: [{ id: "q1" }] }) });

      const response = await submitExam(request());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    });
  });

  describe("(c) 404 는 세션이 정말 없을 때만, DB 오류는 500", () => {
    it("행이 없으면(PGRST116) 404 SESSION_NOT_FOUND 이고 오류로 기록하지 않는다", async () => {
      installDb({ session: null });

      const response = await submitExam(request());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: "SESSION_NOT_FOUND" });
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it("조회 오류(PGRST200 등 DB 오류)는 404 가 아니라 500 이고 logError 로 남긴다", async () => {
      installDb({ sessionError: embedError("sessions", "exams") });

      const response = await submitExam(request());

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).not.toBe("SESSION_NOT_FOUND");
      expect(body.error).toBe("SUBMIT_EXAM_FAILED");
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("[submitExam]"),
        expect.objectContaining({ code: "PGRST200" }),
        expect.objectContaining({ path: "/api/supa/session-handlers" }),
      );
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it("일시적 DB 오류(타임아웃)도 404 로 위장하지 않는다", async () => {
      installDb({ sessionError: { code: "57014", message: "canceling statement due to statement timeout" } });

      const response = await submitExam(request());

      expect(response.status).toBe(500);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("(c2) 시험 조회 실패는 제출을 막는다 (fail-closed)", () => {
    // 마감 검사의 duration 이 이 조회에 의존하므로, 조회가 실패했는데 제출을 받으면
    // 마감 검사 없이 제출이 통과한다. 예전(임베드)에는 duration 이 세션 조회와 같은
    // 요청에서 와서 검사가 항상 있었다.
    it("DB 오류는 500 SUBMIT_EXAM_FAILED 이고 RPC·감사·채점·마일스톤이 일어나지 않는다", async () => {
      installDb({ examError: { code: "57014", message: "canceling statement due to statement timeout" } });

      const response = await submitExam(request());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ error: "SUBMIT_EXAM_FAILED" });
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
      expect(gradingMock).not.toHaveBeenCalled();
      expect(onboardingMock).not.toHaveBeenCalled();
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("[submitExam]"),
        expect.objectContaining({ code: "57014" }),
        expect.objectContaining({
          path: "/api/supa/session-handlers",
          additionalData: { sessionId: "session-1", examId: "exam-1" },
        }),
      );
    });

    it("마감이 지난 세션이라도 시험 조회가 실패하면 마감 검사를 우회해 제출되지 않는다", async () => {
      installDb({
        session: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }),
        examError: { code: "57014", message: "statement timeout" },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(500);
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it("시험 행이 없으면(PGRST116) 404 EXAM_NOT_FOUND 이고 제출되지 않는다", async () => {
      installDb({ exam: null });

      const response = await submitExam(request());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: "EXAM_NOT_FOUND" });
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

  });

  describe("(d) 정상 제출 경로는 기존과 같은 결과를 만든다", () => {
    it("200 과 같은 응답 모양, 원자 RPC 호출, 감사 로그, 채점 트리거", async () => {
      installDb();

      const response = await submitExam(request());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        session: { id: "session-1", status: "submitted" },
        compressionStats: { algorithm: "mock" },
      });
      expect(body.session.submitted_at).toEqual(expect.any(String));
      expect(body.submissions).toEqual([
        expect.objectContaining({ q_idx: 0, answer: "Answer 1" }),
        expect.objectContaining({ q_idx: 1, answer: "Answer 2" }),
      ]);

      expect(supabaseMock.rpc).toHaveBeenCalledWith(
        "submit_exam_atomic",
        expect.objectContaining({
          p_session_id: "session-1",
          p_student_id: "student-1",
          p_exam_id: "exam-1",
          p_compressed_data: "compressed",
        }),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "session_submit", userId: "student-1", targetId: "session-1" }),
      );
      expect(gradingMock).toHaveBeenCalledWith("session-1", "submit_exam");
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it("검사 순서: 남의 세션 403, 다른 시험의 세션 400, 이미 제출 409 — 모두 exams 를 읽기 전에 끝난다", async () => {
      const foreign = installDb({ session: sessionRow({ student_id: "student-2" }) });
      const foreignResponse = await submitExam(request());
      expect(foreignResponse.status).toBe(403);
      expect(only(foreign, "exams")).toHaveLength(0);

      const mismatch = installDb({ session: sessionRow({ exam_id: "other-exam" }) });
      const mismatchResponse = await submitExam(request());
      expect(mismatchResponse.status).toBe(400);
      expect(only(mismatch, "exams")).toHaveLength(0);

      const submitted = installDb({ session: sessionRow({ submitted_at: ago(MINUTE) }) });
      const submittedResponse = await submitExam(request());
      expect(submittedResponse.status).toBe(409);
      await expect(submittedResponse.json()).resolves.toMatchObject({ error: "ALREADY_SUBMITTED" });
      expect(only(submitted, "exams")).toHaveLength(0);
    });

    it("XSS 답안은 그대로 400 INVALID_INPUT 이다", async () => {
      installDb();

      const response = await submitExam(request({ answers: [{ text: "<script>alert(1)</script>" }] }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    });

    it("데모 소유자의 제출은 exams 조회에서 읽은 is_demo·instructor_id 로 마일스톤을 센다", async () => {
      installDb({ exam: examRow({ is_demo: true, instructor_id: "student-1" }) });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
      expect(onboardingMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "student-1", role: "instructor", event: "demo_answered", examId: "exam-1" }),
      );
    });
  });

  describe("모킹 DB 자체 점검 — 이 파일의 단언이 공허하지 않다는 근거", () => {
    it("임베드는 FK 없는 DB 처럼 PGRST200, 모르는 컬럼은 42703, 맞는 행이 없으면 PGRST116", async () => {
      installDb();
      const from = (table: string) => supabaseMock.from(table);

      const embed = await from("sessions").select("id, exams(duration)").eq("id", "session-1").single();
      expect(embed).toMatchObject({ data: null, error: { code: "PGRST200" } });

      const unknownColumn = await from("exams").select("duration, grading_notes").eq("id", "exam-1").single();
      expect(unknownColumn).toMatchObject({ data: null, error: { code: "42703" } });

      const noMatch = await from("exams").select("duration").eq("id", "session-1").single();
      expect(noMatch).toMatchObject({ data: null, error: { code: "PGRST116" } });

      const manyMatches = await from("sessions").select("id").eq("student_id", "student-1").single();
      expect(manyMatches).toMatchObject({ data: null, error: { code: "PGRST116" } });
    });

    it("select 에 적은 컬럼만 돌려준다", async () => {
      installDb();

      const result = (await supabaseMock.from("sessions").select("id, status").eq("id", "session-1").single()) as Result;

      expect(result.data).toEqual({ id: "session-1", status: "in_progress" });
    });
  });
});
