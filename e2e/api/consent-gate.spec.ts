import { test, expect } from "../fixtures/auth.fixture";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { seedExam, seedSession, cleanupTestData } from "../helpers/seed";

/**
 * AC-E4 (live) — default-deny 게이트가 실제 요청에서 어떻게 동작하는지 본다.
 *
 * 여기서 가장 중요한 건 **막히면 안 되는 것이 안 막히는지**다.
 * 시험 중인 학생의 저장·제출이 끊기면 그건 과기응 사고다.
 * 그래서 통과 케이스를 먼저, deny 케이스를 그 다음에 둔다.
 */

test.beforeAll(() => {
  assertLocalTestEnv();
});

test.describe("consent gate — 시험 연속성이 우선한다", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("in_progress 세션 소유자의 저장은 게이트와 무관하게 통과한다", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        payload: { sessionId: session.id },
      },
    });

    // 동의를 안 받았더라도 시험 연속성 경로는 살아 있어야 한다.
    expect(res.status()).not.toBe(428);
  });

  test("남의 세션 id 로는 연속성 예외를 얻지 못한다", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });
    const foreign = await seedSession(exam.id, "someone-else", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        payload: { sessionId: foreign.id, answers: {} },
      },
    });

    // 소유권과 결속되지 않으면 세션 id 하나로 게이트를 우회할 수 있다.
    expect([400, 401, 403, 428]).toContain(res.status());
  });

  test("in_progress 세션이 있어도 무관한 API 는 예외가 아니다", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    await seedSession(exam.id, "test-student-id", { status: "in_progress" });

    // upload 는 시험 연속성 경로가 아니다. 세션이 열려 있다는 이유로
    // 통과시키면 게이트가 사실상 무력화된다.
    const res = await studentRequest.post("/api/supa", {
      data: { action: "get_instructor_exams", payload: {} },
    });

    expect(res.status()).not.toBe(200);
  });
});

test.describe("consent gate — 공개 경로", () => {
  test("법적 문서는 로그인 없이도 열린다", async ({ request }) => {
    // 동의하려면 약관을 봐야 하는데 약관을 보려면 동의해야 하는
    // 교착을 만들지 않기 위해 /legal 은 항상 공개다.
    const res = await request.get("/legal/privacy");
    expect(res.status()).toBeLessThan(400);
  });

  test("get_exam 은 인증 없이도 통과한다", async ({ request }) => {
    const res = await request.post("/api/supa", {
      data: { action: "get_exam", payload: { code: "nonexistent" } },
    });

    // 존재하지 않는 코드라 실패하더라도 401/428 이면 안 된다.
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(428);
  });
});
