import { test, expect } from "../fixtures/auth.fixture";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * /api/courses 통합 계약.
 *
 * 유닛 테스트(__tests__/courses-route.test.ts)는 Supabase 를 목으로 막기 때문에
 * "라우트가 실제 HTTP 표면에서 같은 판정을 내리는가"는 증명하지 못한다.
 * 여기서는 실제 서버 · 실제 로컬 DB 로 인증/역할/소유권/검증 경계를 다시 건다.
 *
 * DB 안전 멈춤 규칙(AGENTS.md): 이 스펙은 폐기 가능한 로컬 Supabase 에서만 돈다.
 * e2e/global-setup.ts 의 assertLocalTestEnv() 가 원격이면 접속 전에 throw 한다.
 */

const supabase = getTestSupabase();

const INSTRUCTOR_ID = "test-instructor-id";
const OTHER_INSTRUCTOR_ID = "test-instructor-other";
const NON_UUID = "not-a-uuid";
const ABSENT_UUID = "99999999-9999-4999-8999-999999999999";

/**
 * single() 이 null 을 돌려주면 그 자체가 실패다.
 * 조용히 옵셔널 체이닝으로 넘기면 "행이 없다"가 통과로 둔갑한다.
 */
function row<T>(data: T | null): T {
  expect(data, "expected a row, got null").not.toBeNull();
  return data as T;
}

/** 이 스펙이 만든 행만 지운다. 다른 스펙의 데이터는 건드리지 않는다. */
async function cleanupCourses() {
  await supabase
    .from("courses")
    .delete()
    .in("instructor_id", [INSTRUCTOR_ID, OTHER_INSTRUCTOR_ID]);
}

test.describe("/api/courses", () => {
  test.beforeEach(async () => {
    await cleanupCourses();
  });

  test.afterEach(async () => {
    await cleanupCourses();
  });

  // ── 인증 ──────────────────────────────────────────────
  test("미인증 GET → 401", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/courses");

    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
  });

  test("미인증 POST → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/courses", {
      data: { name: "무단 과목" },
    });

    expect(res.status()).toBe(401);
  });

  // ── 역할 ──────────────────────────────────────────────
  test("학생 GET → 403", async ({ studentRequest }) => {
    const res = await studentRequest.get("/api/courses");

    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("FORBIDDEN");
  });

  test("학생 POST → 403 이고 행이 생기지 않는다", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/courses", {
      data: { name: "학생이 만든 과목" },
    });

    expect(res.status()).toBe(403);

    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("name", "학생이 만든 과목");
    expect(data ?? []).toHaveLength(0);
  });

  // ── 생성 · 조회 ────────────────────────────────────────
  test("교수자 생성 → 200 이고 instructor_id 가 세션 사용자로 고정된다", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/courses", {
      data: { name: "자료구조", term: "2026-1" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.course.name).toBe("자료구조");
    expect(body.course.term).toBe("2026-1");

    const { data } = await supabase
      .from("courses")
      .select("instructor_id, name, term")
      .eq("id", body.course.id)
      .single();

    expect(row(data).instructor_id).toBe(INSTRUCTOR_ID);
    expect(row(data).name).toBe("자료구조");
  });

  test("본문의 instructor_id 로 소유자를 바꿀 수 없다 (strict → 400)", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/courses", {
      data: { name: "탈취 시도", instructor_id: OTHER_INSTRUCTOR_ID },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("INVALID_INPUT");
  });

  test("term 없이 생성하면 null 이다", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/courses", {
      data: { name: "term 없는 과목" },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).course.term).toBeNull();
  });

  test("목록은 본인 과목만 돌려준다", async ({ instructorRequest }) => {
    await instructorRequest.post("/api/courses", { data: { name: "내 과목" } });
    await supabase
      .from("courses")
      .insert({ instructor_id: OTHER_INSTRUCTOR_ID, name: "남의 과목" });

    const res = await instructorRequest.get("/api/courses");

    expect(res.status()).toBe(200);
    const names = (await res.json()).courses.map(
      (c: { name: string }) => c.name
    );
    expect(names).toContain("내 과목");
    expect(names).not.toContain("남의 과목");
  });

  // ── 입력 검증 ──────────────────────────────────────────
  test("빈 본문 POST → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/courses", { data: {} });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("INVALID_INPUT");
  });

  test("name 타입 오류 POST → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/courses", {
      data: { name: 123 },
    });

    expect(res.status()).toBe(400);
  });

  test("과도하게 긴 name POST → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/courses", {
      data: { name: "가".repeat(201) },
    });

    expect(res.status()).toBe(400);
  });

  test("깨진 JSON POST → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/courses", {
      headers: { "Content-Type": "application/json" },
      data: "{ this is not json",
    });

    expect(res.status()).toBe(400);
  });
});

test.describe("/api/courses/[courseId]", () => {
  test.beforeEach(async () => {
    await cleanupCourses();
  });

  test.afterEach(async () => {
    await cleanupCourses();
  });

  async function seedCourse(instructorId: string, name: string) {
    const { data } = await supabase
      .from("courses")
      .insert({ instructor_id: instructorId, name })
      .select("id")
      .single();
    return row(data).id as string;
  }

  // ── 경로 파라미터 ──────────────────────────────────────
  test("UUID 가 아닌 courseId PATCH → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.patch(`/api/courses/${NON_UUID}`, {
      data: { name: "새 이름" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("INVALID_PARAM");
  });

  test("UUID 가 아닌 courseId DELETE → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.delete(`/api/courses/${NON_UUID}`);

    expect(res.status()).toBe(400);
  });

  // ── 소유권 ────────────────────────────────────────────
  test("남의 과목 PATCH → 403 이고 이름이 그대로다", async ({
    instructorRequest,
  }) => {
    const courseId = await seedCourse(OTHER_INSTRUCTOR_ID, "남의 과목");

    const res = await instructorRequest.patch(`/api/courses/${courseId}`, {
      data: { name: "탈취된 이름" },
    });

    expect(res.status()).toBe(403);

    // 목이 아닌 실제 행으로 확인한다 — 거부가 진짜 쓰기를 막았는가.
    const { data } = await supabase
      .from("courses")
      .select("name")
      .eq("id", courseId)
      .single();
    expect(row(data).name).toBe("남의 과목");
  });

  test("남의 과목 DELETE → 403 이고 행이 남아 있다", async ({
    instructorRequest,
  }) => {
    const courseId = await seedCourse(OTHER_INSTRUCTOR_ID, "남의 과목");

    const res = await instructorRequest.delete(`/api/courses/${courseId}`);

    expect(res.status()).toBe(403);

    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .single();
    expect(data).toBeTruthy();
  });

  test("없는 과목 PATCH → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.patch(`/api/courses/${ABSENT_UUID}`, {
      data: { name: "새 이름" },
    });

    expect(res.status()).toBe(404);
  });

  test("학생 PATCH → 403", async ({ studentRequest }) => {
    const courseId = await seedCourse(INSTRUCTOR_ID, "내 과목");

    const res = await studentRequest.patch(`/api/courses/${courseId}`, {
      data: { name: "학생이 바꾼 이름" },
    });

    expect(res.status()).toBe(403);
  });

  test("미인증 DELETE → 401", async ({ anonRequest }) => {
    const courseId = await seedCourse(INSTRUCTOR_ID, "내 과목");

    const res = await anonRequest.delete(`/api/courses/${courseId}`);

    expect(res.status()).toBe(401);
  });

  // ── 정상 수정 · 삭제 ───────────────────────────────────
  test("본인 과목 PATCH → 200 이고 DB 에 반영된다", async ({
    instructorRequest,
  }) => {
    const courseId = await seedCourse(INSTRUCTOR_ID, "옛 이름");

    const res = await instructorRequest.patch(`/api/courses/${courseId}`, {
      data: { name: "새 이름", term: "2026-2" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.course.name).toBe("새 이름");

    const { data } = await supabase
      .from("courses")
      .select("name, term, instructor_id")
      .eq("id", courseId)
      .single();
    expect(row(data).name).toBe("새 이름");
    expect(row(data).term).toBe("2026-2");
    expect(row(data).instructor_id).toBe(INSTRUCTOR_ID);
  });

  test("빈 본문 PATCH → 400", async ({ instructorRequest }) => {
    const courseId = await seedCourse(INSTRUCTOR_ID, "내 과목");

    const res = await instructorRequest.patch(`/api/courses/${courseId}`, {
      data: {},
    });

    expect(res.status()).toBe(400);
  });

  test("본인 과목 DELETE → 200 이고 행이 사라진다", async ({
    instructorRequest,
  }) => {
    const courseId = await seedCourse(INSTRUCTOR_ID, "지울 과목");

    const res = await instructorRequest.delete(`/api/courses/${courseId}`);

    expect(res.status()).toBe(200);
    expect((await res.json()).deleted).toBe(true);

    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .maybeSingle();
    expect(data).toBeNull();
  });
});
