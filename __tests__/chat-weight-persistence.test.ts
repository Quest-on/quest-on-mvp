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

/**
 * chat_weight 의 null 이 저장까지 살아남는가 (#222)
 *
 * `null` 은 "교수자가 대화 비중을 건드리지 않았다" 를 뜻한다. 예전에는 create
 * handler 가 `data.chat_weight ?? 50` 으로 접어서 그 사실이 저장 시점에
 * 사라졌고, 그래서 손대지 않은 시험도 편집으로 다시 들어오면 사용자 지정으로
 * 보였다(기본값 복귀 버튼이 항상 떠 있었다).
 *
 * 이 테스트는 **실제로 고친 경계**를 지킨다. 브라우저 E2E 는 폼에서 요청
 * 본문까지만 볼 수 있어서, handler 를 다시 `?? 50` 으로 되돌려도 그쪽은
 * 통과한다. insert 값을 직접 봐야 재발을 막는다.
 *
 * null 이 안전한 근거: 컬럼은 `Int?` 이고 DB 기본값이 50 이며, 채점은
 * `lib/grading.ts:789` 에서 `exam.chat_weight ?? 50` 으로 이미 방어한다.
 */

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult = { data: null, error: null }) {
  const inserted: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {
    inserted,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      inserted.push(payload as Record<string, unknown>);
      return builder;
    }),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder as typeof builder & {
    inserted: Array<Record<string, unknown>>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

/** 코드 중복 확인(null) -> insert 결과(id) 순으로 응답한다. */
function mockExamCreate() {
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
  return exams;
}

const baseInput = {
  title: "대화 비중 저장 확인",
  code: "ABC123",
  duration: 60,
  questions: [],
  status: "draft" as const,
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-16T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

describe("createExam 은 chat_weight 의 null 을 보존한다", () => {
  it("값을 안 보내면 null 로 저장한다", async () => {
    const exams = mockExamCreate();

    const res = await createExam({ ...baseInput });

    expect(res.status).toBe(200);
    // `?? 50` 으로 되돌리면 여기서 50 이 나와 실패한다.
    expect(exams.inserted[0]).toMatchObject({ chat_weight: null });
  });

  it("명시적 null 도 null 로 저장한다", async () => {
    const exams = mockExamCreate();

    const res = await createExam({ ...baseInput, chat_weight: null });

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).toMatchObject({ chat_weight: null });
  });

  it("교수자가 고른 50 은 숫자 50 으로 저장한다", async () => {
    const exams = mockExamCreate();

    // 50 을 기본값으로 접어버리면 의도적으로 고른 50 이 사라진다.
    const res = await createExam({ ...baseInput, chat_weight: 50 });

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).toMatchObject({ chat_weight: 50 });
  });

  it("경계값 0 을 0 으로 저장한다", async () => {
    const exams = mockExamCreate();

    // `||` 로 기본값을 주면 0 이 50 으로 바뀐다. 0 은 대화 비중 0% 로 유효하다.
    const res = await createExam({ ...baseInput, chat_weight: 0 });

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).toMatchObject({ chat_weight: 0 });
  });

  it("경계값 100 을 100 으로 저장한다", async () => {
    const exams = mockExamCreate();

    const res = await createExam({ ...baseInput, chat_weight: 100 });

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).toMatchObject({ chat_weight: 100 });
  });
});

/** 편집 저장 경로. create 만 고쳤으므로 update 가 다시 접지 않는지 고정한다. */
function mockExamUpdate() {
  // #226 이후 update 경로가 현재 exam 을 먼저 읽는다(chat_weight 잠금 비교).
  // 목이 그 값을 안 주면 undefined 비교가 되어 무관한 실패가 난다.
  const exams = createChain({
    data: {
      id: EXAM_ID,
      instructor_id: INSTRUCTOR_ID,
      questions: [],
      score_weights: null,
      ai_draft_questions: null,
      chat_weight: null,
    },
    error: null,
  });
  const updated: Array<Record<string, unknown>> = [];
  exams.update = vi.fn((payload: unknown) => {
    updated.push(payload as Record<string, unknown>);
    return exams;
  });
  (exams as unknown as { updated: unknown[] }).updated = updated;
  const sessions = createChain({ data: [], error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    // 세션 없음. chat_weight 잠금은 세션이 있을 때만 걸린다.
    if (table === "sessions") return sessions;
    throw new Error(`Unexpected table: ${table}`);
  });
  return exams as typeof exams & { updated: Array<Record<string, unknown>> };
}

describe("updateExam 도 chat_weight 를 접지 않는다", () => {
  it.each([
    ["null", null],
    ["0", 0],
    ["50", 50],
    ["100", 100],
  ])("%s 을 그대로 저장한다", async (_label, value) => {
    const exams = mockExamUpdate();

    await updateExam({
      id: EXAM_ID,
      update: { chat_weight: value as number | null },
    });

    expect(exams.updated[0]).toMatchObject({ chat_weight: value });
  });
});
