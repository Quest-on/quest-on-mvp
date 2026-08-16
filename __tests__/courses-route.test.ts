import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * 과목 CRUD 라우트 계약.
 *
 * 잡으려는 사고:
 *   · 인증/역할 확인 전에 DB 를 건드리는 것 (AGENTS.md: 인증 검증 전 데이터 접근 금지)
 *   · 남의 과목을 수정/삭제하는 것 (instructor_id 소유권)
 *   · 클라이언트가 instructor_id 를 실어 보내 소유자를 덮어쓰는 것
 *   · 깨진 본문·빈 본문을 200 으로 통과시키는 것
 *   · UUID 가 아닌 경로 파라미터로 DB 쿼리를 쏘는 것
 *
 * DB 는 붙지 않는다. Supabase 클라이언트는 전부 목이고,
 * "DB 에 접근했는가"는 getSupabaseServer 호출 여부와 기록된 연산 목록으로 판정한다.
 */

const OWNER_ID = "instructor-owner";
const OTHER_ID = "instructor-other";
const COURSE_UUID = "11111111-2222-4333-8444-555555555555";

type QueryResult = { data: unknown; error: unknown };

let currentUserMock: ReturnType<typeof vi.fn>;
let rateLimitMock: ReturnType<typeof vi.fn>;
let getSupabaseServerMock: ReturnType<typeof vi.fn>;
let logErrorMock: ReturnType<typeof vi.fn>;

/** 라우트가 실제로 수행한 DB 연산 순서. 소유권 검사가 진짜 막았는지 여기서 본다. */
let dbOps: string[];
/** from() 이 돌려줄 결과 큐. 라우트가 쿼리하는 순서대로 넣는다. */
let queryResults: QueryResult[];
/** insert()/update() 에 실제로 전달된 페이로드. */
let writePayloads: unknown[];
/** eq() 로 실제로 건 필터. 조회가 본인 것으로 좁혀졌는지 여기서 본다. */
let filters: Array<[string, unknown]>;

function makeQuery(result: QueryResult) {
  const q: Record<string, unknown> = {};

  const step =
    (name: string) =>
    (...args: unknown[]) => {
      dbOps.push(name);
      if (name === "insert" || name === "update") writePayloads.push(args[0]);
      if (name === "eq") filters.push([String(args[0]), args[1]]);
      return q;
    };

  Object.assign(q, {
    select: vi.fn(step("select")),
    insert: vi.fn(step("insert")),
    update: vi.fn(step("update")),
    delete: vi.fn(step("delete")),
    eq: vi.fn(step("eq")),
    order: vi.fn(step("order")),
    single: vi.fn(async () => {
      dbOps.push("single");
      return result;
    }),
    // 종단 await (`.order(...)`, `.delete().eq(...)`) 를 위한 thenable.
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return q;
}

function applyMocks() {
  vi.doMock("@/lib/supabase-auth", () => ({ currentUser: currentUserMock }));
  vi.doMock("@/lib/rate-limit", async () => {
    const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
      "@/lib/rate-limit"
    );
    return { ...actual, checkRateLimitAsync: rateLimitMock };
  });
  vi.doMock("@/lib/supabase-server", () => ({
    getSupabaseServer: getSupabaseServerMock,
  }));
  // logError 는 실패 경로에서 Supabase 에 로그를 적는다. 테스트가 DB 로 새지 않도록 막는다.
  vi.doMock("@/lib/logger", () => ({
    logError: logErrorMock,
    logWarn: vi.fn(),
    logInfo: vi.fn(),
  }));
}

async function loadCollectionRoute() {
  vi.resetModules();
  applyMocks();
  return await import("@/app/api/courses/route");
}

async function loadItemRoute() {
  vi.resetModules();
  applyMocks();
  return await import("@/app/api/courses/[courseId]/route");
}

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as NextRequest;
}

/** 본문이 JSON 이 아닐 때 request.json() 은 throw 한다. 그 경로를 그대로 재현한다. */
function brokenJsonRequest() {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as NextRequest;
}

function ctx(courseId: string) {
  return { params: Promise.resolve({ courseId }) };
}

function asInstructor(id = OWNER_ID) {
  return vi.fn(async () => ({ id, role: "instructor", status: "approved" }));
}

beforeEach(() => {
  dbOps = [];
  queryResults = [];
  writePayloads = [];
  filters = [];
  currentUserMock = asInstructor();
  rateLimitMock = vi.fn(async () => ({ allowed: true, remaining: 59, resetAt: 0 }));
  logErrorMock = vi.fn(async () => true);
  getSupabaseServerMock = vi.fn(() => ({
    from: vi.fn((table: string) => {
      dbOps.push(`from:${table}`);
      return makeQuery(queryResults.shift() ?? { data: null, error: null });
    }),
  }));
});

afterEach(() => {
  vi.doUnmock("@/lib/supabase-auth");
  vi.doUnmock("@/lib/rate-limit");
  vi.doUnmock("@/lib/supabase-server");
  vi.doUnmock("@/lib/logger");
});

// ─────────────────────────────────────────────────────────────
// (i) 미인증
// ─────────────────────────────────────────────────────────────
describe("인증", () => {
  it("미인증 GET /api/courses 는 401 이고 DB 를 건드리지 않는다", async () => {
    currentUserMock = vi.fn(async () => null);
    const { GET } = await loadCollectionRoute();

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
    expect(dbOps).toEqual([]);
  });

  it("미인증 POST /api/courses 는 401 이고 레이트 리밋조차 태우지 않는다", async () => {
    currentUserMock = vi.fn(async () => null);
    const { POST } = await loadCollectionRoute();

    const res = await POST(jsonRequest({ name: "자료구조" }));

    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("미인증 PATCH/DELETE 도 401 이고 DB 를 건드리지 않는다", async () => {
    currentUserMock = vi.fn(async () => null);
    const { PATCH, DELETE } = await loadItemRoute();

    const patched = await PATCH(jsonRequest({ name: "x" }), ctx(COURSE_UUID));
    const deleted = await DELETE(jsonRequest({}), ctx(COURSE_UUID));

    expect(patched.status).toBe(401);
    expect(deleted.status).toBe(401);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// (ii) 학생 역할
// ─────────────────────────────────────────────────────────────
describe("역할", () => {
  it("학생은 GET/POST 모두 403 이고 DB 를 건드리지 않는다", async () => {
    currentUserMock = vi.fn(async () => ({
      id: "student-1",
      role: "student",
      status: "approved",
    }));
    const { GET, POST } = await loadCollectionRoute();

    const listed = await GET();
    const created = await POST(jsonRequest({ name: "자료구조" }));

    expect(listed.status).toBe(403);
    expect(created.status).toBe(403);
    await expect(created.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
    expect(dbOps).toEqual([]);
  });

  it("학생은 PATCH/DELETE 도 403 이다", async () => {
    currentUserMock = vi.fn(async () => ({
      id: "student-1",
      role: "student",
      status: "approved",
    }));
    const { PATCH, DELETE } = await loadItemRoute();

    expect((await PATCH(jsonRequest({ name: "x" }), ctx(COURSE_UUID))).status).toBe(403);
    expect((await DELETE(jsonRequest({}), ctx(COURSE_UUID))).status).toBe(403);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 레이트 리밋 계약 (버킷/키를 임의로 바꾸면 깨진다)
// ─────────────────────────────────────────────────────────────
describe("레이트 리밋", () => {
  it("courses:<user.id> 키와 general 버킷을 쓴다", async () => {
    const { RATE_LIMITS } = await vi.importActual<typeof import("@/lib/rate-limit")>(
      "@/lib/rate-limit"
    );
    queryResults = [{ data: [], error: null }];
    const { GET } = await loadCollectionRoute();

    await GET();

    expect(rateLimitMock).toHaveBeenCalledWith(
      `courses:${OWNER_ID}`,
      RATE_LIMITS.general
    );
  });

  it("한도 초과는 429 이고 DB 를 건드리지 않는다", async () => {
    rateLimitMock = vi.fn(async () => ({ allowed: false, remaining: 0, resetAt: 0 }));
    const { POST } = await loadCollectionRoute();

    const res = await POST(jsonRequest({ name: "자료구조" }));

    expect(res.status).toBe(429);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// (iv) 잘못된 본문
// ─────────────────────────────────────────────────────────────
describe("입력 검증", () => {
  it.each([
    ["깨진 JSON", "broken" as const],
    ["빈 본문", {}],
    ["name 누락", { term: "2026-1" }],
    ["name 타입 오류", { name: 123 }],
    ["name 빈 문자열", { name: "   " }],
    ["name 초과 길이", { name: "가".repeat(201) }],
    ["term 타입 오류", { name: "자료구조", term: 2026 }],
    ["term 초과 길이", { name: "자료구조", term: "t".repeat(51) }],
    ["미지의 키", { name: "자료구조", color: "red" }],
    ["instructor_id 주입", { name: "자료구조", instructor_id: "instructor-victim" }],
    ["id 주입", { name: "자료구조", id: COURSE_UUID }],
    ["배열 본문", [{ name: "자료구조" }]],
    ["null 본문", null],
  ])("POST — %s 는 400 이고 insert 하지 않는다", async (_label, body) => {
    const { POST } = await loadCollectionRoute();

    const res =
      body === "broken"
        ? await POST(brokenJsonRequest())
        : await POST(jsonRequest(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    expect(dbOps).not.toContain("insert");
  });

  it("PATCH — 빈 객체는 400 이다 (바뀐 것 없이 성공으로 보이면 안 된다)", async () => {
    const { PATCH } = await loadItemRoute();

    const res = await PATCH(jsonRequest({}), ctx(COURSE_UUID));

    expect(res.status).toBe(400);
    expect(dbOps).not.toContain("update");
  });

  it("PATCH — instructor_id 를 실어 보내면 400 이다", async () => {
    const { PATCH } = await loadItemRoute();

    const res = await PATCH(
      jsonRequest({ name: "새 이름", instructor_id: OTHER_ID }),
      ctx(COURSE_UUID)
    );

    expect(res.status).toBe(400);
    expect(dbOps).not.toContain("update");
  });
});

// ─────────────────────────────────────────────────────────────
// (vi) UUID 가 아닌 경로 파라미터
// ─────────────────────────────────────────────────────────────
describe("경로 파라미터 검증", () => {
  it.each([
    ["문자열", "not-a-uuid"],
    ["SQL 조각", "'; DROP TABLE courses;--"],
    ["숫자", "12345"],
    ["빈 문자열", ""],
    ["UUID 유사 문자열", "11111111-2222-4333-8444-55555555555"],
  ])(
    "PATCH — %s courseId 는 DB 접근 전에 400 으로 막힌다",
    async (_label, courseId) => {
      const { PATCH } = await loadItemRoute();

      const res = await PATCH(jsonRequest({ name: "새 이름" }), ctx(courseId));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_PARAM" });
      // 핵심: 클라이언트를 만들지도, 쿼리를 쏘지도 않았다.
      expect(getSupabaseServerMock).not.toHaveBeenCalled();
      expect(dbOps).toEqual([]);
    }
  );

  it("DELETE — UUID 가 아닌 courseId 는 DB 접근 전에 400 이다", async () => {
    const { DELETE } = await loadItemRoute();

    const res = await DELETE(jsonRequest({}), ctx("not-a-uuid"));

    expect(res.status).toBe(400);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
    expect(dbOps).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// (iii) 소유권
// ─────────────────────────────────────────────────────────────
describe("소유권", () => {
  it("남의 과목 PATCH 는 403 이고 update 를 실행하지 않는다", async () => {
    queryResults = [
      { data: { id: COURSE_UUID, instructor_id: OTHER_ID }, error: null },
    ];
    const { PATCH } = await loadItemRoute();

    const res = await PATCH(jsonRequest({ name: "탈취" }), ctx(COURSE_UUID));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    // 소유권 검사가 목으로 사라지지 않았음을 증명한다:
    // SELECT 는 돌았고(from:courses → select → eq → single), UPDATE 는 없다.
    expect(dbOps).toContain("select");
    expect(dbOps).not.toContain("update");
    expect(writePayloads).toEqual([]);
  });

  it("남의 과목 DELETE 는 403 이고 delete 를 실행하지 않는다", async () => {
    queryResults = [
      { data: { id: COURSE_UUID, instructor_id: OTHER_ID }, error: null },
    ];
    const { DELETE } = await loadItemRoute();

    const res = await DELETE(jsonRequest({}), ctx(COURSE_UUID));

    expect(res.status).toBe(403);
    expect(dbOps).toContain("select");
    expect(dbOps).not.toContain("delete");
  });

  it("없는 과목은 404 다 (남의 것과 구분된다)", async () => {
    queryResults = [{ data: null, error: null }];
    const { PATCH } = await loadItemRoute();

    const res = await PATCH(jsonRequest({ name: "새 이름" }), ctx(COURSE_UUID));

    expect(res.status).toBe(404);
    expect(dbOps).not.toContain("update");
  });

  it("본인 과목 PATCH 는 200 이고 update 가 실행된다", async () => {
    queryResults = [
      { data: { id: COURSE_UUID, instructor_id: OWNER_ID }, error: null },
      {
        data: { id: COURSE_UUID, name: "새 이름", term: "2026-1" },
        error: null,
      },
    ];
    const { PATCH } = await loadItemRoute();

    const res = await PATCH(jsonRequest({ name: "새 이름" }), ctx(COURSE_UUID));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      course: { name: "새 이름" },
    });
    expect(dbOps).toContain("update");
    expect(writePayloads[0]).toMatchObject({ name: "새 이름" });
    // instructor_id 는 수정 대상이 아니다.
    expect(writePayloads[0]).not.toHaveProperty("instructor_id");
  });

  it("본인 과목 DELETE 는 courses 행만 지운다 (exams 는 건드리지 않는다)", async () => {
    queryResults = [
      { data: { id: COURSE_UUID, instructor_id: OWNER_ID }, error: null },
      { data: null, error: null },
    ];
    const { DELETE } = await loadItemRoute();

    const res = await DELETE(jsonRequest({}), ctx(COURSE_UUID));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ deleted: true });
    expect(dbOps).toContain("delete");
    // FK 의 ON DELETE SET NULL 이 처리한다. 라우트가 exams 를 직접 만지면 안 된다.
    expect(dbOps.filter((op) => op.startsWith("from:"))).toEqual([
      "from:courses",
      "from:courses",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// (v) 정상 생성 / 조회
// ─────────────────────────────────────────────────────────────
describe("생성·조회", () => {
  it("정상 생성은 200 이고 instructor_id 를 세션에서 채운다", async () => {
    queryResults = [
      {
        data: {
          id: COURSE_UUID,
          name: "자료구조",
          term: "2026-1",
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T00:00:00.000Z",
        },
        error: null,
      },
    ];
    const { POST } = await loadCollectionRoute();

    const res = await POST(jsonRequest({ name: "자료구조", term: "2026-1" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      course: { id: COURSE_UUID, name: "자료구조", term: "2026-1" },
    });
    expect(writePayloads[0]).toEqual({
      instructor_id: OWNER_ID,
      name: "자료구조",
      term: "2026-1",
    });
  });

  it("term 은 선택 항목이고 없으면 null 로 저장된다", async () => {
    queryResults = [{ data: { id: COURSE_UUID, name: "자료구조", term: null }, error: null }];
    const { POST } = await loadCollectionRoute();

    const res = await POST(jsonRequest({ name: "자료구조" }));

    expect(res.status).toBe(200);
    expect(writePayloads[0]).toMatchObject({ term: null });
  });

  it("목록은 본인 것으로 좁혀서 조회한다", async () => {
    queryResults = [{ data: [{ id: COURSE_UUID, name: "자료구조" }], error: null }];
    const { GET } = await loadCollectionRoute();

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      courses: [{ id: COURSE_UUID }],
    });
    expect(dbOps).toEqual(["from:courses", "select", "eq", "order"]);
    // 남의 과목이 섞이지 않는 이유는 이 필터 하나뿐이다.
    expect(filters).toEqual([["instructor_id", OWNER_ID]]);
  });
});
