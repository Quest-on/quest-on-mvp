/**
 * 문항 ai_role 이 저장 경로에서 지워지지 않는가 (이슈 #519)
 *
 * `ai_role` 은 문항 JSON 의 키다 (DDL 없음). 교수가 시험을 만들고 고치고 복사하는 모든 경로가
 * 이 키를 그대로 통과시켜야 한다. 한 곳이라도 문항을 정해진 필드만 골라 다시 만들면 분석 파트너
 * 설정이 조용히 사례형으로 돌아간다 — 사례형이 기본값이라 아무 오류도 나지 않는다.
 *
 * 경로별로 확인한 것
 *   1) 요청 스키마: createExamSchema(passthrough), updateExamSchema(questions 는 unknown)
 *   2) 서버 저장: createExam, updateExam 이 문항을 그대로 쓰고 core_ability 만 지운다
 *   3) 시험 복사: buildCopiedExamPayload
 *   4) 폼: new/edit 두 페이지(거울 쌍)가 문항 객체를 통째로 들고 있다가 그대로 보낸다
 *      (화면 렌더 테스트 환경이 없어 소스 구조로 지킨다. 아래 4번 describe 참고)
 *   5) 학생에게 내려가는 문항: stripSensitiveQuestionFields 는 건드리지 않는다 (#508 영역)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

import { createExam, updateExam } from "@/app/api/supa/handlers/exam-handlers";
import { createExamSchema, examQuestionsSchema, updateExamSchema } from "@/lib/validations";
import { buildCopiedExamPayload } from "@/lib/exam-copy";
import { stripSensitiveQuestionFields } from "@/lib/sanitize-exam-questions";

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";

const PARTNER_QUESTION = {
  id: "q1",
  text: "고객을 세 집단으로 나누어 분석하세요.",
  type: "essay" as const,
  ai_context: "교수 메모",
  ai_role: "analysis_partner",
};

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult = { data: null, error: null }) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {
    inserted,
    updated,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      inserted.push(payload as Record<string, unknown>);
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updated.push(payload as Record<string, unknown>);
      return builder;
    }),
    delete: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder as typeof builder & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

describe("1) 요청 스키마가 ai_role 을 떨어뜨리지 않는다", () => {
  const createInput = {
    title: "분석 시험",
    code: "ABC123",
    duration: 60,
    questions: [PARTNER_QUESTION],
    status: "draft",
    created_at: "2026-10-03T00:00:00.000Z",
    updated_at: "2026-10-03T00:00:00.000Z",
  };

  it("createExamSchema 는 문항의 ai_role 을 그대로 통과시킨다", () => {
    const result = createExamSchema.safeParse(createInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.questions[0]).toMatchObject({ ai_role: "analysis_partner", ai_context: "교수 메모" });
  });

  it("updateExamSchema 는 questions 를 건드리지 않는다", () => {
    const result = updateExamSchema.safeParse({ id: EXAM_ID, update: { questions: [PARTNER_QUESTION] } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.update.questions).toEqual([PARTNER_QUESTION]);
  });

  it("exams.questions 의 JSON 형태를 적어 둔 examQuestionsSchema 도 ai_role 을 보존한다", () => {
    // 지금은 호출부가 없는 스키마다. 누가 읽기 경로에 붙이는 순간 키가 조용히 떨어지지 않게 둔다.
    const parsed = examQuestionsSchema.parse([PARTNER_QUESTION]);
    expect(parsed[0]).toMatchObject({ ai_role: "analysis_partner" });
  });
});

describe("2) 서버 저장은 문항을 그대로 쓰고 core_ability 만 지운다", () => {
  it("createExam: insert 되는 문항에 ai_role 이 남고 core_ability 는 지워진다", async () => {
    const exams = createChain();
    exams.single
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: EXAM_ID }, error: null });
    const nodes = createChain();
    nodes.maybeSingle.mockResolvedValue({ data: null, error: null });
    nodes.single.mockResolvedValue({ data: { id: "node-1" }, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "exams") return exams;
      if (table === "exam_nodes") return nodes;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await createExam({
      title: "분석 시험",
      code: "ABC123",
      duration: 60,
      questions: [{ ...PARTNER_QUESTION, core_ability: "민감필드" }] as never,
      status: "draft",
      created_at: "2026-10-03T00:00:00.000Z",
      updated_at: "2026-10-03T00:00:00.000Z",
    });

    expect(res.status).toBe(200);
    const stored = (exams.inserted[0].questions as Array<Record<string, unknown>>)[0];
    expect(stored).toMatchObject({ id: "q1", ai_role: "analysis_partner", ai_context: "교수 메모" });
    expect(stored).not.toHaveProperty("core_ability");
  });

  it("updateExam: update 로 나가는 문항에 ai_role 이 그대로 남는다", async () => {
    const exams = createChain({ data: { id: EXAM_ID, questions: [], ai_draft_questions: null }, error: null });
    const sessions = createChain({ data: null, error: null });
    const nodes = createChain({ data: null, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "exams") return exams;
      if (table === "sessions") return sessions;
      if (table === "exam_nodes") return nodes;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await updateExam({ id: EXAM_ID, update: { questions: [PARTNER_QUESTION] } });

    expect(res.status).toBe(200);
    const payload = exams.updated[0];
    expect(payload.questions).toEqual([PARTNER_QUESTION]);
  });
});

describe("3) 시험 복사는 문항 JSON 을 그대로 복사한다", () => {
  it("복사본 문항에 ai_role 이 남고 core_ability 만 지워진다", () => {
    const payload = buildCopiedExamPayload(
      {
        title: "원본",
        type: "exam",
        questions: [{ ...PARTNER_QUESTION, core_ability: "민감필드" }],
      },
      { code: "NEWCODE", instructorId: INSTRUCTOR_ID, now: "2026-10-03T00:00:00.000Z" }
    );
    const copied = (payload.questions as Array<Record<string, unknown>>)[0];
    expect(copied).toMatchObject({ ai_role: "analysis_partner", ai_context: "교수 메모" });
    expect(copied).not.toHaveProperty("core_ability");
  });
});

describe("4) new/edit 폼(거울 쌍)은 문항을 필드만 골라 다시 만들지 않는다", () => {
  // 화면 렌더 테스트 도구(@testing-library/*)가 이 저장소에 없다. 대신 문항 상태의 형태를 소스로 지킨다:
  //   읽기: 서버가 준 문항 배열을 그대로 상태에 넣는다 (edit)
  //   수정: 한 필드만 바꾸고 나머지는 펼쳐서 보존한다 (`{ ...q, [field]: value }`)
  //   저장: 상태의 문항 배열을 그대로 payload 에 넣는다 (new, edit)
  // 이 셋이 유지되는 한 문항 JSON 의 ai_role 은 폼을 왕복해도 남는다.
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const NEW_PAGE = read("app/(app)/instructor/new/page.tsx");
  const EDIT_PAGE = read("app/(app)/instructor/[examId]/edit/page.tsx");

  it("edit: 서버가 준 문항 배열을 가공 없이 상태에 넣는다", () => {
    expect(EDIT_PAGE).toContain("setQuestions(exam.questions || []);");
  });

  it.each([
    ["new", NEW_PAGE],
    ["edit", EDIT_PAGE],
  ])("%s: 한 필드를 바꿀 때 나머지 필드를 펼쳐서 보존한다", (_name, source) => {
    expect(source).toMatch(/\{ \.\.\.q, \[field\]: value \}/);
  });

  it("new: 저장 payload 의 questions 는 상태의 문항 배열 그대로다", () => {
    expect(NEW_PAGE).toMatch(/questions: questions,/);
  });

  it("edit: 저장 payload 의 questions 는 상태의 문항 배열 그대로다", () => {
    expect(EDIT_PAGE).toMatch(/\n\s+questions,\n/);
  });

  it.each([
    ["new", NEW_PAGE],
    ["edit", EDIT_PAGE],
  ])("%s: 저장 직전에 문항을 map 으로 다시 만들지 않는다", (_name, source) => {
    // 저장 payload 를 만드는 구간(`questions` 를 payload 에 넣는 곳)에 questions.map(... => ({ ... })) 가 없어야 한다.
    expect(source).not.toMatch(/questions:\s*questions\.map\(/);
    expect(source).not.toMatch(/\n\s+questions:\s*\w+\.map\(\(q\)\s*=>\s*\(\{/);
  });

  it("폼의 문항 타입(Question)이 ai_role 을 가진다 — 타입이 필드를 모르면 다시 만드는 코드가 필드를 빼먹기 쉽다", () => {
    const editor = read("components/instructor/QuestionEditor.tsx");
    const body = editor.slice(editor.indexOf("export interface Question {"));
    const declaration = body.slice(0, body.indexOf("\n}"));
    expect(declaration).toMatch(/ai_role\?: string;/);
  });
});

describe("5) 학생에게 내려가는 문항에서 ai_role 은 걸러지지 않는다 (역할 이름뿐이라 무해하다)", () => {
  // stripSensitiveQuestionFields 는 #508 영역이라 이 이슈에서 고치지 않는다. 현재 동작을 기록해 둔다.
  // ai_role 값은 두 역할 이름 중 하나이고 정답, 채점 맥락, 지시문 원문을 담지 않는다.
  it("정답키와 교수 메모는 걸러지고 ai_role 은 남는다", () => {
    const [stripped] = stripSensitiveQuestionFields([
      { ...PARTNER_QUESTION, correctOptionIndex: 1 },
    ]) as Array<Record<string, unknown>>;
    expect(stripped).not.toHaveProperty("ai_context");
    expect(stripped).not.toHaveProperty("correctOptionIndex");
    expect(stripped.ai_role).toBe("analysis_partner");
  });
});
