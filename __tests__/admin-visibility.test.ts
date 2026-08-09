/**
 * 관리자 가시성 회귀 (이슈 #86 / AC-19).
 *
 * 승인 게이트가 "차단"에서 "무료 한도"로 바뀌면, 관리자가 볼 것은 대기열이
 * 아니라 **누가 얼마나 쓰고 있는가**다. 그런데 대기 목록 쿼리는 `school` 을
 * 빠뜨려서 소속이 DB 에 있는데도 화면에 안 나왔다. 승인 판단 근거가 없었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectCalls: string[] = [];

type Row = Record<string, unknown>;
let examRows: Row[] = [];
let profileRows: Row[] = [];
let pendingRows: Row[] = [];
let failTable: string | null = null;

/** `.select(...)` 이후 어떤 종결자로 끝나든 같은 결과를 돌려주는 최소 스텁. */
function result(table: string) {
  const data =
    table === "exams" ? examRows : table === "profiles" ? profileRows : pendingRows;
  const payload =
    failTable === table
      ? { data: null, error: new Error(`${table} down`) }
      : { data, error: null };

  const chain: Record<string, unknown> = {
    eq: () => chain,
    not: () => chain,
    order: () => Promise.resolve(payload),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(payload).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selectCalls.push(`${table}:${columns}`);
        return result(table);
      },
    }),
  }),
}));

let adminDenied: unknown = null;
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => adminDenied,
}));

vi.mock("@/lib/logger", () => ({ logError: () => {} }));

beforeEach(() => {
  vi.clearAllMocks();
  selectCalls.length = 0;
  adminDenied = null;
  failTable = null;
  examRows = [];
  profileRows = [];
  pendingRows = [];
});

describe("GET /api/admin/instructors/pending", () => {
  it("소속(school)을 함께 조회한다 — AC-19", async () => {
    pendingRows = [{ id: "i1", name: "김교수", email: "k@x.ac.kr", school: "동국대" }];
    const { GET } = await import("../app/api/admin/instructors/pending/route");

    const response = await GET();
    const body = await response.json();

    expect(selectCalls[0]).toBe("instructor_profiles:id, name, email, school, created_at");
    expect(body.instructors[0].school).toBe("동국대");
  });

  it("관리자가 아니면 조회 자체를 하지 않는다", async () => {
    adminDenied = new Response(null, { status: 401 });
    const { GET } = await import("../app/api/admin/instructors/pending/route");

    await GET();

    expect(selectCalls).toEqual([]);
  });
});

describe("GET /api/admin/instructors/publishing", () => {
  it("데모는 발행 카운트에서 빼고 별도로 센다 — AC-17/AC-19", async () => {
    profileRows = [
      { id: "i1", display_name: "김교수", school: "동국대", plan: "free", status: "pending" },
    ];
    examRows = [
      { instructor_id: "i1", is_demo: false, first_published_at: "2026-08-01T00:00:00Z" },
      { instructor_id: "i1", is_demo: false, first_published_at: "2026-08-05T00:00:00Z" },
      // 데모는 발행됐어도 카운트에 들어가면 안 된다.
      { instructor_id: "i1", is_demo: true, first_published_at: "2026-08-09T00:00:00Z" },
      // 한 번도 발행 안 된 초안은 세지 않는다.
      { instructor_id: "i1", is_demo: false, first_published_at: null },
    ];

    const { GET } = await import("../app/api/admin/instructors/publishing/route");
    const body = await (await GET()).json();
    const row = body.instructors[0];

    expect(row.publishedCount).toBe(2);
    expect(row.demoCount).toBe(1);
    // 최근 발행일도 데모를 따라가면 안 된다.
    expect(row.lastPublishedAt).toBe("2026-08-05T00:00:00Z");
    expect(row.school).toBe("동국대");
    expect(row.plan).toBe("free");
  });

  it("한 번도 발행하지 않은 교수자도 0 으로 보인다 — 안 보이면 방치된다", async () => {
    profileRows = [{ id: "i2", display_name: "이교수", school: null, plan: "free" }];
    examRows = [];

    const { GET } = await import("../app/api/admin/instructors/publishing/route");
    const body = await (await GET()).json();

    expect(body.instructors).toHaveLength(1);
    expect(body.instructors[0].publishedCount).toBe(0);
    expect(body.instructors[0].lastPublishedAt).toBeNull();
  });

  it("발행 많은 순으로 정렬한다 — 한도에 가까운 계정이 위로", async () => {
    profileRows = [
      { id: "low", display_name: "적게", plan: "free" },
      { id: "high", display_name: "많이", plan: "free" },
    ];
    examRows = [
      { instructor_id: "low", is_demo: false, first_published_at: "2026-08-01T00:00:00Z" },
      { instructor_id: "high", is_demo: false, first_published_at: "2026-08-01T00:00:00Z" },
      { instructor_id: "high", is_demo: false, first_published_at: "2026-08-02T00:00:00Z" },
    ];

    const { GET } = await import("../app/api/admin/instructors/publishing/route");
    const body = await (await GET()).json();

    expect(body.instructors.map((r: { instructorId: string }) => r.instructorId)).toEqual([
      "high",
      "low",
    ]);
  });

  it("조회 실패는 500 이다 — 빈 목록으로 위장하면 아무도 안 쓰는 줄 안다", async () => {
    failTable = "exams";
    const { GET } = await import("../app/api/admin/instructors/publishing/route");

    const response = await GET();

    expect(response.status).toBe(500);
  });

  it("관리자가 아니면 집계하지 않는다", async () => {
    adminDenied = new Response(null, { status: 401 });
    const { GET } = await import("../app/api/admin/instructors/publishing/route");

    await GET();

    expect(selectCalls).toEqual([]);
  });
});
