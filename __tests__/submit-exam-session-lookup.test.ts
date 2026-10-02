/**
 * submit_exam 세션 조회 회귀 (#525).
 *
 * 스테이징과 운영 DB 에는 `sessions.exam_id → exams.id` 외래키가 없다. 그런데
 * submitExam 의 세션 조회가 PostgREST 임베드 `exams(duration)` 를 써서 조회 자체가
 * `PGRST200` 으로 실패했고, 코드가 그 오류를 "세션 없음" 으로 읽어 404 SESSION_NOT_FOUND
 * 로 응답했다. 유효한 세션과 시험인데도 제출이 전부 실패했다.
 *
 * 모킹 DB 는 FK 를 모른다. 그래서 이 파일의 DB 는 `sessions` 조회의 select 문자열에
 * `exams(...)` 임베드가 있으면 스테이징처럼 PGRST200 을 돌려준다. 임베드가 돌아오면
 * 아래 테스트가 전부 이 시뮬레이터에서 깨진다.
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

type Result = { data: unknown; error: unknown };
type SelectCall = { table: string; columns: string };

const MINUTE = 60_000;
const NOW = () => Date.now();
const ago = (ms: number) => new Date(NOW() - ms).toISOString();

/** 스테이징 service role 이 실제로 받은 오류와 같은 모양이다. */
const PGRST200 = {
  code: "PGRST200",
  details: "Searched for a foreign key relationship between 'sessions' and 'exams' in the schema 'public', but no matches were found.",
  hint: null,
  message: "Could not find a relationship between 'sessions' and 'exams' in the schema cache",
};
const PGRST116 = {
  code: "PGRST116",
  details: "The result contains 0 rows",
  hint: null,
  message: "JSON object requested, multiple (or no) rows returned",
};

// 세션 select 문자열 안의 `관계(...)` 또는 `관계!inner(...)` 임베드.
const EMBED = /\b[a-z_]+\s*(?:!\w+)?\s*\(/i;
const EXAMS_EMBED = /\bexams\s*(?:!\w+)?\s*\(/i;

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    student_id: "student-1",
    exam_id: "exam-1",
    submitted_at: null,
    attempt_timer_started_at: ago(10 * MINUTE),
    status: "in_progress",
    ...overrides,
  };
}

function examRow(overrides: Record<string, unknown> = {}) {
  return {
    duration: 60,
    questions: [{ id: "q1" }, { id: "q2" }],
    is_demo: false,
    instructor_id: "instructor-1",
    ...overrides,
  };
}

/**
 * FK 없는 DB 시뮬레이터. sessions 조회에 exams 임베드가 있으면 PGRST200 을 돌려준다.
 * 호출된 select 문자열을 table 별로 기록해 단언에 쓴다.
 */
function installDb(options: { session?: Result; exam?: Result }) {
  const calls: SelectCall[] = [];
  const session = options.session ?? { data: sessionRow(), error: null };
  const exam = options.exam ?? { data: examRow(), error: null };

  supabaseMock.from.mockImplementation((table: string) => {
    let columns = "";
    const builder = {
      select: vi.fn((cols: string) => {
        columns = cols;
        calls.push({ table, columns: cols });
        return builder;
      }),
      eq: vi.fn(() => builder),
      single: vi.fn(async (): Promise<Result> => {
        if (table === "sessions") {
          if (EXAMS_EMBED.test(columns)) return { data: null, error: PGRST200 };
          return session;
        }
        if (table === "exams") return exam;
        throw new Error(`No mock configured for table ${table}`);
      }),
    };
    return builder;
  });

  return calls;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    examId: "exam-1",
    studentId: "student-1",
    sessionId: "session-1",
    answers: [{ text: "Answer 1" }, { text: "Answer 2" }],
    ...overrides,
  };
}

describe("submitExam 세션 조회 (#525)", () => {
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
      const calls = installDb({});

      await submitExam(request());

      const sessionSelects = calls.filter((call) => call.table === "sessions");
      expect(sessionSelects.length).toBeGreaterThan(0);
      for (const call of sessionSelects) {
        expect(call.columns).not.toMatch(EXAMS_EMBED);
        expect(call.columns).not.toMatch(EMBED);
      }
    });

    it("sessions→exams FK 가 없는 DB 에서도 유효한 세션이면 404 가 아니라 200 이다", async () => {
      installDb({});

      const response = await submitExam(request());
      const body = await response.json();

      expect(body.error).not.toBe("SESSION_NOT_FOUND");
      expect(response.status).toBe(200);
    });
  });

  describe("(b) 시험 시간 제한은 exams 조회의 duration 으로 같게 적용된다", () => {
    it("duration 을 exams 조회에서 읽고, exams 조회는 한 번뿐이다", async () => {
      const calls = installDb({});

      await submitExam(request());

      const examSelects = calls.filter((call) => call.table === "exams");
      expect(examSelects).toHaveLength(1);
      expect(examSelects[0].columns).toMatch(/\bduration\b/);
      // 기존 조회가 쓰던 컬럼을 잃지 않는다 (문항 수 검증, 데모 미리보기 판정).
      expect(examSelects[0].columns).toMatch(/\bquestions\b/);
      expect(examSelects[0].columns).toMatch(/\bis_demo\b/);
      expect(examSelects[0].columns).toMatch(/\binstructor_id\b/);
    });

    it("duration>0 이고 타이머 시작 후 시간이 지났으면 403 DEADLINE_EXCEEDED", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }), error: null },
        exam: { data: examRow({ duration: 60 }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "DEADLINE_EXCEEDED" });
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it("duration 0 은 무제한이라 오래 지난 타이머여도 제출된다", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: ago(10 * 24 * 60 * MINUTE) }), error: null },
        exam: { data: examRow({ duration: 0 }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    });

    it("시간이 남았으면 제출된다", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: ago(10 * MINUTE) }), error: null },
        exam: { data: examRow({ duration: 60 }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("status 가 in_progress 가 아니면 마감 검사를 하지 않는다 (기존 조건 보존)", async () => {
      installDb({
        session: {
          data: sessionRow({ status: "waiting", attempt_timer_started_at: ago(2 * 60 * MINUTE) }),
          error: null,
        },
        exam: { data: examRow({ duration: 60 }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("타이머가 아직 시작되지 않았으면(attempt_timer_started_at null) 마감 검사를 하지 않는다", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: null }), error: null },
        exam: { data: examRow({ duration: 60 }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(200);
    });

    it("검사 순서: 마감이 문항 수 검증보다 먼저다 (만료 + 답안 초과 → 403)", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }), error: null },
        exam: { data: examRow({ duration: 60, questions: [{ id: "q1" }] }), error: null },
      });

      const response = await submitExam(request());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "DEADLINE_EXCEEDED" });
    });

    it("답안 수가 문항 수를 넘으면 400 VALIDATION_ERROR (시간이 남았을 때)", async () => {
      installDb({ exam: { data: examRow({ questions: [{ id: "q1" }] }), error: null } });

      const response = await submitExam(request());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    });
  });

  describe("(c) 404 는 세션이 정말 없을 때만, DB 오류는 500", () => {
    it("행이 없으면(PGRST116) 404 SESSION_NOT_FOUND", async () => {
      installDb({ session: { data: null, error: PGRST116 } });

      const response = await submitExam(request());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: "SESSION_NOT_FOUND" });
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it("오류 없이 data 가 null 이어도 404 SESSION_NOT_FOUND", async () => {
      installDb({ session: { data: null, error: null } });

      const response = await submitExam(request());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: "SESSION_NOT_FOUND" });
    });

    it("조회 오류(PGRST200 등 DB 오류)는 404 가 아니라 500 이고 logError 로 남긴다", async () => {
      installDb({ session: { data: null, error: PGRST200 } });

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
      installDb({ session: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } });

      const response = await submitExam(request());

      expect(response.status).toBe(500);
      expect(logErrorMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("(d) 정상 제출 경로는 기존과 같은 결과를 만든다", () => {
    it("200 과 같은 응답 모양, 원자 RPC 호출, 감사 로그, 채점 트리거", async () => {
      installDb({});

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

    it("검사 순서: 다른 시험의 세션은 400, 이미 제출은 409 — 둘 다 exams 를 읽기 전에 끝난다", async () => {
      const mismatchCalls = installDb({ session: { data: sessionRow({ exam_id: "other-exam" }), error: null } });
      const mismatch = await submitExam(request());
      expect(mismatch.status).toBe(400);
      expect(mismatchCalls.some((call) => call.table === "exams")).toBe(false);

      const submittedCalls = installDb({
        session: { data: sessionRow({ submitted_at: ago(MINUTE) }), error: null },
      });
      const submitted = await submitExam(request());
      expect(submitted.status).toBe(409);
      await expect(submitted.json()).resolves.toMatchObject({ error: "ALREADY_SUBMITTED" });
      expect(submittedCalls.some((call) => call.table === "exams")).toBe(false);
    });

    it("XSS 답안은 그대로 400 INVALID_INPUT 이다", async () => {
      installDb({});

      const response = await submitExam(request({ answers: [{ text: "<script>alert(1)</script>" }] }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    });
  });

  describe("시험 조회가 실패해도 제출은 기존처럼 이어진다", () => {
    it("exams 조회 오류 → 문항 수 검증과 마감 검사를 건너뛰고 제출하되 logError 로 남긴다", async () => {
      installDb({
        session: { data: sessionRow({ attempt_timer_started_at: ago(2 * 60 * MINUTE) }), error: null },
        exam: { data: null, error: { code: "57014", message: "statement timeout" } },
      });

      const response = await submitExam(request({ answers: [{ text: "a" }, { text: "b" }, { text: "c" }] }));

      expect(response.status).toBe(200);
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(logErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("[submitExam]"),
        expect.objectContaining({ code: "57014" }),
        expect.anything(),
      );
      // exam 을 못 읽었으니 데모 미리보기 판정도 불능이라 마일스톤을 세지 않는다.
      expect(onboardingMock).not.toHaveBeenCalled();
    });
  });
});
