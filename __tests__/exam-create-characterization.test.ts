import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

import { createExam } from "@/app/api/supa/handlers/exam-handlers";

/**
 * createExam 의 바깥 동작을 고정한다 (#513).
 *
 * 시험 생성 페이로드 구성부를 `lib/exam-insert-payload.ts` 로 뽑아내면서 createExam 의
 * 외부 동작은 한 글자도 바뀌면 안 된다. 기존 테스트는 chat_weight, course_id 같은 필드
 * 하나씩만 봤고, 코드 중복 재시도·23505 재시도·노드 실패 보상 삭제·언어 후처리·RAG 디스패치
 * 는 어느 테스트도 잠그지 않았다. 리팩터가 그 사이를 건드리지 않았다는 증거로 이 파일은
 * **추출 전 코드에서도, 추출 후 코드에서도 똑같이 통과해야 한다.**
 */

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const NODE_ID = "22222222-2222-4222-8222-222222222222";

type QueryResult = { data: unknown; error: unknown };

/**
 * 호출 순서를 기록하는 체인 목.
 *
 * insert 페이로드를 **복제해서** 쌓는다. createExam 은 23505 재시도 때 같은 객체의 `code`
 * 를 바꿔 다시 넣으므로, 참조만 쌓으면 첫 시도의 코드가 사라져 재시도 여부를 볼 수 없다.
 */
function createChain(result: QueryResult = { data: null, error: null }) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const builder = {
    inserted,
    updated,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      inserted.push(structuredClone(payload) as Record<string, unknown>);
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updated.push(structuredClone(payload) as Record<string, unknown>);
      return builder;
    }),
    delete: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

type Scenario = {
  /** exams `.single()` 응답을 호출 순서대로. 첫 번째가 코드 중복 사전 조회다. */
  examSingles?: QueryResult[];
  /** exams `.maybeSingle()` 기본 응답 (코드 재생성 중 중복 확인). */
  codeCheck?: QueryResult;
  /** exams 의 `then`(update/delete 대기) 응답. */
  examThen?: QueryResult;
  /** exam_nodes 형제 최대 sort_order 조회. */
  nodeMax?: QueryResult;
  /** exam_nodes insert 결과. */
  nodeInsert?: QueryResult;
};

function mockDb(s: Scenario = {}) {
  const exams = createChain(s.examThen);
  const singles = s.examSingles ?? [
    { data: null, error: null },
    { data: { id: EXAM_ID }, error: null },
  ];
  for (const r of singles) exams.single.mockResolvedValueOnce(r);
  if (s.codeCheck) exams.maybeSingle.mockResolvedValue(s.codeCheck);

  const nodes = createChain();
  nodes.maybeSingle.mockResolvedValue(s.nodeMax ?? { data: null, error: null });
  nodes.single.mockResolvedValue(s.nodeInsert ?? { data: { id: NODE_ID }, error: null });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "exam_nodes") return nodes;
    throw new Error(`Unexpected table: ${table}`);
  });
  return { exams, nodes };
}

const base = {
  title: "생성 동작 고정",
  code: "ABC123",
  duration: 60,
  questions: [{ id: "q1", text: "서술하시오.", type: "essay" as const }],
  status: "draft",
  created_at: "2026-10-03T00:00:00.000Z",
  updated_at: "2026-10-03T00:00:00.000Z",
};

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createExam 인증·역할", () => {
  it("로그인이 없으면 401 이고 DB 를 건드리지 않는다", async () => {
    currentUserMock.mockResolvedValue(null);
    mockDb();

    const res = await createExam({ ...base });

    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("UNAUTHORIZED");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("교수자가 아니면 403 이고 DB 를 건드리지 않는다", async () => {
    currentUserMock.mockResolvedValue({ id: "s-1", role: "student" });
    mockDb();

    const res = await createExam({ ...base });

    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("INSTRUCTOR_REQUIRED");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe("createExam 성공 응답과 소유자", () => {
  it("instructor_id 는 로그인한 사용자이고 응답에 exam 과 examNode 가 실린다", async () => {
    const { exams } = mockDb();

    const res = await createExam({ ...base });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.exam).toEqual({ id: EXAM_ID });
    expect(body.examNode).toEqual({ id: NODE_ID });
    expect(exams.inserted[0]).toMatchObject({ instructor_id: INSTRUCTOR_ID, code: "ABC123" });
  });
});

describe("코드 중복 사전 검사", () => {
  it("이미 있는 코드면 6자 새 코드로 바꿔 넣는다", async () => {
    // Math.random 이 0 이면 알파벳 첫 글자만 나온다 - 생성기의 알파벳과 길이를 함께 고정한다.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { exams } = mockDb({
      examSingles: [
        { data: { code: "ABC123" }, error: null }, // 사전 조회: 이미 있다
        { data: { id: EXAM_ID }, error: null }, // INSERT
      ],
      codeCheck: { data: null, error: null }, // 새 코드는 비어 있다
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(200);
    expect(exams.inserted).toHaveLength(1);
    expect(exams.inserted[0].code).toBe("AAAAAA");
    expect(exams.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("새 코드도 계속 겹치면 10번째에서 포기하고 500 이다 - 아무것도 넣지 않는다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { exams, nodes } = mockDb({
      examSingles: [{ data: { code: "ABC123" }, error: null }],
      codeCheck: { data: { code: "AAAAAA" }, error: null },
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("CREATE_EXAM_FAILED");
    expect(exams.maybeSingle).toHaveBeenCalledTimes(10);
    expect(exams.insert).not.toHaveBeenCalled();
    expect(nodes.insert).not.toHaveBeenCalled();
  });

  it("코드가 비어 있으면 사전 조회 한 번으로 끝나고 받은 코드를 그대로 쓴다", async () => {
    const { exams } = mockDb();

    await createExam({ ...base });

    expect(exams.maybeSingle).not.toHaveBeenCalled();
    expect(exams.inserted[0].code).toBe("ABC123");
  });
});

describe("INSERT 의 23505 재시도", () => {
  it("코드 충돌(23505)이면 새 코드로 한 번 더 넣는다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { exams, nodes } = mockDb({
      examSingles: [
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "duplicate key" } },
        { data: { id: EXAM_ID }, error: null },
      ],
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(200);
    expect(exams.inserted.map((p) => p.code)).toEqual(["ABC123", "AAAAAA"]);
    expect(nodes.inserted).toHaveLength(1);
  });

  it("23505 가 세 번 이어지면 500 DATABASE_ERROR 이고 노드를 만들지 않는다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const conflict = { data: null, error: { code: "23505", message: "duplicate key" } };
    const { exams, nodes } = mockDb({
      examSingles: [{ data: null, error: null }, conflict, conflict, conflict],
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("DATABASE_ERROR");
    expect(exams.inserted).toHaveLength(3);
    expect(nodes.insert).not.toHaveBeenCalled();
  });

  it("23505 가 아닌 오류는 재시도하지 않는다", async () => {
    const { exams, nodes } = mockDb({
      examSingles: [
        { data: null, error: null },
        { data: null, error: { code: "42501", message: "denied" } },
      ],
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("DATABASE_ERROR");
    expect(exams.inserted).toHaveLength(1);
    expect(nodes.insert).not.toHaveBeenCalled();
  });
});

describe("exam_nodes 행과 보상 삭제", () => {
  it("루트에 만들면 parent_id 가 null 이고 형제가 없으면 sort_order 는 0 이다", async () => {
    const { nodes } = mockDb();

    await createExam({ ...base });

    expect(nodes.is).toHaveBeenCalledWith("parent_id", null);
    expect(nodes.inserted).toEqual([
      {
        instructor_id: INSTRUCTOR_ID,
        parent_id: null,
        kind: "exam",
        name: "생성 동작 고정",
        exam_id: EXAM_ID,
        sort_order: 0,
      },
    ]);
  });

  it("폴더 안에 만들면 형제 최대 sort_order + 1 이다", async () => {
    const { nodes } = mockDb({ nodeMax: { data: { sort_order: 4 }, error: null } });

    await createExam({ ...base, parent_folder_id: "folder-1" });

    expect(nodes.eq).toHaveBeenCalledWith("parent_id", "folder-1");
    expect(nodes.is).not.toHaveBeenCalled();
    expect(nodes.inserted[0]).toMatchObject({ parent_id: "folder-1", sort_order: 5 });
  });

  it("노드 INSERT 가 실패하면 방금 만든 exams 행을 지우고 500 이다", async () => {
    const { exams } = mockDb({
      nodeInsert: { data: null, error: { code: "XX000", message: "node failed" } },
    });

    const res = await createExam({ ...base });

    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("DATABASE_ERROR");
    expect(exams.delete).toHaveBeenCalledTimes(1);
    expect(exams.eq).toHaveBeenCalledWith("id", EXAM_ID);
  });

  it("노드가 성공하면 exams 를 지우지 않는다", async () => {
    const { exams } = mockDb();

    await createExam({ ...base });

    expect(exams.delete).not.toHaveBeenCalled();
  });
});

describe("언어는 INSERT 가 아니라 INSERT 뒤 UPDATE 로 처리한다", () => {
  it("en 이면 payload 에는 language 가 없고 뒤따르는 UPDATE 로 en 을 쓴다", async () => {
    const { exams } = mockDb();

    const res = await createExam({ ...base, language: "en" });
    const body = await json(res);

    expect(exams.inserted[0]).not.toHaveProperty("language");
    expect(exams.updated).toEqual([{ language: "en" }]);
    expect((body.exam as Record<string, unknown>).language).toBe("en");
  });

  it.each([["ko" as const], [undefined]])("%s 이면 UPDATE 하지 않는다 (DB 기본값 ko)", async (language) => {
    const { exams } = mockDb();

    await createExam({ ...base, language });

    expect(exams.inserted[0]).not.toHaveProperty("language");
    expect(exams.update).not.toHaveBeenCalled();
  });

  it("언어 UPDATE 가 실패해도 시험 생성은 성공으로 끝난다 (기록만 남긴다)", async () => {
    mockDb({ examThen: { data: null, error: { message: "language failed" } } });

    const res = await createExam({ ...base, language: "en" });
    const body = await json(res);

    expect(res.status).toBe(200);
    // 실패하면 응답의 exam 에 en 을 덮어쓰지 않는다.
    expect((body.exam as Record<string, unknown>).language).toBeUndefined();
  });
});

describe("RAG 디스패치", () => {
  const material = { url: "https://files.test/a.pdf", text: "본문", fileName: "a.pdf" };

  it("materials_text 가 있으면 rag_status 를 pending 으로 바꾸고 내부 라우트를 부른다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { exams } = mockDb();

    await createExam({ ...base, materials_text: [material] });

    expect(exams.updated).toEqual([{ rag_status: "pending" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; method: string }];
    expect(url).toMatch(/\/api\/internal\/process-rag$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      examId: EXAM_ID,
      materialsText: [material],
      userId: INSTRUCTOR_ID,
      source: "create_exam_materials",
    });
  });

  it("materials_text 가 비어 있으면 아무것도 부르지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { exams } = mockDb();

    await createExam({ ...base, materials_text: [] });

    expect(exams.update).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("점수 배점 검증은 코드 중복 조회 뒤, INSERT 앞에서 400 을 낸다", () => {
  it("모양이 틀린 배점은 details 없는 400 이다", async () => {
    const { exams, nodes } = mockDb();

    const res = await createExam({
      ...base,
      score_weights: { version: 2 } as unknown as never,
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "INVALID_SCORE_WEIGHTS", message: "유효하지 않은 점수 배점입니다." });
    // 순서까지 고정한다: 사전 코드 조회(.single 1회)는 이미 일어났고, INSERT 는 없다.
    expect(exams.single).toHaveBeenCalledTimes(1);
    expect(exams.insert).not.toHaveBeenCalled();
    expect(nodes.insert).not.toHaveBeenCalled();
  });

  it("문항 유형과 어긋난 배점은 첫 오류를 message 로, 전체를 details.errors 로 돌려준다", async () => {
    const { exams } = mockDb();

    const res = await createExam({
      ...base, // 서술형만 있다
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_SCORE_WEIGHTS");
    expect(body.message).toBe("문항이 없는 유형에는 비중을 설정할 수 없습니다.");
    expect(body.details).toEqual({
      errors: [
        "문항이 없는 유형에는 비중을 설정할 수 없습니다.",
        "문항이 있는 유형에는 1점 이상의 비중을 설정해야 합니다.",
      ],
    });
    expect(exams.insert).not.toHaveBeenCalled();
  });
});
