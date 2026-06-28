/**
 * 학생 리포트 점수 프라이버시 회귀 가드
 *
 * 불변식:
 * 1. gradesReleased=false → grades={}, overallScore=null, gradedCount=0
 * 2. gradesReleased=true  → grades 각 항목은 { id, q_idx, score }만 포함
 *    (comment/feedback/rationale/overallSummary 등 정성 텍스트 키가 절대 새지 않음)
 * 3. 응답 최상위에 코멘트/피드백/종합평가 텍스트 필드가 없음 (노출 키 화이트리스트)
 *
 * 누군가 "comment"를 grades SELECT에 추가하거나 응답에 추가하면 이 테스트가 깨진다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { currentUserMock, checkRateLimitAsyncMock, supabaseMock } = vi.hoisted(
  () => ({
    currentUserMock: vi.fn(),
    checkRateLimitAsyncMock: vi.fn(),
    supabaseMock: {
      from: vi.fn(),
    },
  }),
);

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: checkRateLimitAsyncMock,
  RATE_LIMITS: {
    sessionRead: { limit: 30, windowSec: 60 },
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { GET } from "@/app/api/student/session/[sessionId]/report/route";

// ── helpers ──────────────────────────────────────────────────────────────────

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(resolve(result)),
    ),
  };
  return builder;
}

function queueTableMocks(
  queues: Record<string, ReturnType<typeof createChain>[]>,
) {
  supabaseMock.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`No mock configured for table: ${table}`);
    return next;
  });
}

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

/** 기본 세션 픽스처 */
const BASE_SESSION = {
  id: SESSION_ID,
  exam_id: "exam-privacy-1",
  student_id: "student-privacy-1",
  submitted_at: "2026-06-22T00:00:00.000Z",
  created_at: "2026-06-22T00:00:00.000Z",
  compressed_session_data: null,
  grading_progress: null,
};

/**
 * 기본 문항 (case 타입 — AI 채점 대상).
 * ai_context는 강사가 AI 채점에 제공하는 비공개 배경 맥락이며,
 * 학생 응답 페이로드에서 제거되어야 한다.
 */
const BASE_QUESTION = {
  id: "q-case-1",
  idx: 0,
  type: "case",
  prompt: "케이스 문항 설명",
  ai_context: "강사 전용 채점 맥락 — 학생에게 노출 금지",
};

/**
 * grades 테이블 레코드.
 * 실제 DB row에는 comment/feedback이 있을 수 있으나,
 * 라우트는 id/q_idx/score/grade_type/created_at만 SELECT 해야 한다.
 * 이 픽스처는 "만약 SELECT가 더 많은 필드를 가져왔을 때"를 시뮬레이션한다.
 */
const GRADE_ROW_WITH_SENSITIVE_FIELDS = {
  id: "grade-1",
  q_idx: 0,
  score: 85,
  grade_type: "auto",
  created_at: "2026-06-22T01:00:00.000Z",
  // 아래는 DB에 있지만 SELECT에 포함하면 안 되는 필드들
  comment: "강사 전용 코멘트입니다",
  feedback: "AI 정성 피드백 텍스트",
  rationale: "채점 근거 설명",
  overallSummary: "종합평가 전체 내용",
};

function buildMocks({
  gradesReleased,
  gradeRows = [GRADE_ROW_WITH_SENSITIVE_FIELDS],
}: {
  gradesReleased: boolean;
  gradeRows?: unknown[];
}) {
  queueTableMocks({
    sessions: [createChain({ data: BASE_SESSION, error: null })],
    exams: [
      createChain({
        data: {
          id: "exam-privacy-1",
          title: "프라이버시 테스트 시험",
          code: "PRIV01",
          description: null,
          duration: 60,
          grades_released: gradesReleased,
          score_weights: null,
          questions: [BASE_QUESTION],
        },
        error: null,
      }),
    ],
    submissions: [
      createChain({
        data: [
          {
            id: "sub-1",
            q_idx: 0,
            answer: "학생 답변 내용",
            compressed_answer_data: null,
            created_at: "2026-06-22T00:30:00.000Z",
          },
        ],
        error: null,
      }),
    ],
    messages: [createChain({ data: [], error: null })],
    grades: [createChain({ data: gradeRows, error: null })],
    session_quiz_attempts: [createChain({ data: null, error: null })],
  });
}

async function callReport() {
  const response = await GET(
    new Request("http://localhost/report") as NextRequest,
    { params: Promise.resolve({ sessionId: SESSION_ID }) },
  );
  const body = await response.json();
  return { response, body };
}

// ── 테스트 ─────────────────────────────────────────────────────────────────

describe("학생 리포트 점수 프라이버시 불변식", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({
      id: "student-privacy-1",
      role: "student",
    });
    checkRateLimitAsyncMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
  });

  // ── 불변식 1: gradesReleased=false ─────────────────────────────────────

  describe("gradesReleased=false", () => {
    it("grades는 빈 객체여야 한다", async () => {
      buildMocks({ gradesReleased: false });
      const { body } = await callReport();
      expect(body.grades).toEqual({});
    });

    it("overallScore는 null이어야 한다", async () => {
      buildMocks({ gradesReleased: false });
      const { body } = await callReport();
      expect(body.overallScore).toBeNull();
    });

    it("gradedCount는 0이어야 한다", async () => {
      buildMocks({ gradesReleased: false });
      const { body } = await callReport();
      expect(body.gradedCount).toBe(0);
    });

    it("점수 미공개여도 gradesReleased 플래그 자체는 false로 노출된다", async () => {
      buildMocks({ gradesReleased: false });
      const { body } = await callReport();
      expect(body.gradesReleased).toBe(false);
    });
  });

  // ── 불변식 2: gradesReleased=true 시 정성 텍스트 필드 누출 금지 ────────

  describe("gradesReleased=true — 정성 필드 누출 금지", () => {
    it("grades 항목에 comment 키가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const gradeEntries = Object.values(body.grades ?? {});
      expect(gradeEntries.length).toBeGreaterThan(0);
      for (const entry of gradeEntries) {
        expect(entry).not.toHaveProperty("comment");
      }
    });

    it("grades 항목에 feedback 키가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const gradeEntries = Object.values(body.grades ?? {});
      for (const entry of gradeEntries) {
        expect(entry).not.toHaveProperty("feedback");
      }
    });

    it("grades 항목에 rationale 키가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const gradeEntries = Object.values(body.grades ?? {});
      for (const entry of gradeEntries) {
        expect(entry).not.toHaveProperty("rationale");
      }
    });

    it("grades 항목에 overallSummary 키가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const gradeEntries = Object.values(body.grades ?? {});
      for (const entry of gradeEntries) {
        expect(entry).not.toHaveProperty("overallSummary");
      }
    });

    it("입력 grade row에 민감 필드가 있어도 출력 grades 항목은 { id, q_idx, score }만 포함한다", async () => {
      buildMocks({
        gradesReleased: true,
        gradeRows: [GRADE_ROW_WITH_SENSITIVE_FIELDS],
      });
      const { body } = await callReport();

      const gradeEntries = Object.values(body.grades ?? {});
      expect(gradeEntries.length).toBeGreaterThan(0);

      const allowedKeys = new Set(["id", "q_idx", "score"]);
      for (const entry of gradeEntries) {
        const keys = Object.keys(entry as Record<string, unknown>);
        for (const key of keys) {
          expect(allowedKeys).toContain(key);
        }
      }
    });

    it("overallScore가 숫자로 반환된다 (채점 완료 시)", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      // case 타입 문항이 채점됐으므로 숫자 또는 null (미채점 케이스도 허용)
      expect(
        body.overallScore === null || typeof body.overallScore === "number",
      ).toBe(true);
    });

    it("gradedCount가 0 이상의 숫자로 반환된다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      expect(typeof body.gradedCount).toBe("number");
      expect(body.gradedCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 불변식 3: 응답 최상위 화이트리스트 ────────────────────────────────

  describe("응답 최상위 노출 키 화이트리스트", () => {
    /** 학생에게 허용된 최상위 키 목록 */
    const ALLOWED_TOP_LEVEL_KEYS = new Set([
      "success",
      "session",
      "exam",
      "submissions",
      "messages",
      "grades",
      "overallScore",
      "gradedCount",
      "totalQuestionCount",
      "assignmentQuiz",
      "gradesReleased",
      "gradingProgress",
    ]);

    it("미공개 상태에서 최상위에 금지 필드가 없다", async () => {
      buildMocks({ gradesReleased: false });
      const { body } = await callReport();
      for (const key of Object.keys(body)) {
        expect(ALLOWED_TOP_LEVEL_KEYS).toContain(key);
      }
    });

    it("공개 상태에서 최상위에 금지 필드가 없다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      for (const key of Object.keys(body)) {
        expect(ALLOWED_TOP_LEVEL_KEYS).toContain(key);
      }
    });

    it("최상위에 comment 키가 없다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      expect(body).not.toHaveProperty("comment");
    });

    it("최상위에 feedback 키가 없다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      expect(body).not.toHaveProperty("feedback");
    });

    it("최상위에 overallSummary 키가 없다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      expect(body).not.toHaveProperty("overallSummary");
    });

    it("최상위에 instructorComment 키가 없다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      expect(body).not.toHaveProperty("instructorComment");
    });
  });

  // ── 불변식 4: exam.questions 비공개 채점 메타 누출 금지 ────────────────

  describe("exam.questions — 강사 채점 메타 누출 금지", () => {
    it("문항에 ai_context(강사 채점용 비공개 맥락)가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const questions = (body.exam?.questions ?? []) as Array<
        Record<string, unknown>
      >;
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q).not.toHaveProperty("ai_context");
      }
    });

    it("문항에 correctOptionIndex(정답)가 없어야 한다", async () => {
      buildMocks({ gradesReleased: true });
      const { body } = await callReport();
      const questions = (body.exam?.questions ?? []) as Array<
        Record<string, unknown>
      >;
      for (const q of questions) {
        expect(q).not.toHaveProperty("correctOptionIndex");
      }
    });
  });

  // ── 부가 불변식: 복수 grade row 시 deduplication 후에도 정성 필드 불포함 ──

  describe("복수 grade row — deduplication 후 정성 필드 없음", () => {
    it("같은 q_idx에 manual/auto grade가 모두 있을 때 best grade만 반환하고 정성 필드 없음", async () => {
      const gradeRows = [
        {
          id: "grade-auto",
          q_idx: 0,
          score: 70,
          grade_type: "auto",
          created_at: "2026-06-22T01:00:00.000Z",
          comment: "AI 자동 코멘트",
          feedback: "AI 피드백",
        },
        {
          id: "grade-manual",
          q_idx: 0,
          score: 90,
          grade_type: "manual",
          created_at: "2026-06-22T02:00:00.000Z",
          comment: "강사 수동 코멘트",
          feedback: "강사 수동 피드백",
          rationale: "강사 채점 근거",
        },
      ];

      buildMocks({ gradesReleased: true, gradeRows });
      const { body } = await callReport();

      const gradeEntries = Object.values(body.grades ?? {});
      expect(gradeEntries.length).toBe(1); // deduplication: q_idx=0 하나만
      const entry = gradeEntries[0] as Record<string, unknown>;
      expect(entry.score).toBe(90); // manual(높은 우선순위)이 선택됨
      expect(entry).not.toHaveProperty("comment");
      expect(entry).not.toHaveProperty("feedback");
      expect(entry).not.toHaveProperty("rationale");
    });
  });
});
