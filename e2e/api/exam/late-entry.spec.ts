import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
  getSession,
} from "../../helpers/seed";

test.describe("POST /api/exam/[examId]/late-entry", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor approves late_pending session → 200, session becomes in_progress", async ({
    instructorRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      status: "running",
      started_at: now,
    });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "approve" },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("approved");
    expect(body.sessionId).toBe(session.id);

    // Verify DB state
    const updated = await getSession(session.id);
    expect(updated.status).toBe("in_progress");
    expect(updated.late_entry_approved_at).toBeTruthy();
    // 승인은 학생의 고지 확인을 대신해 주지 않는다 (#150).
    // 예전에는 여기서 preflight_accepted_at 을 대리로 채워, 지각 입장 학생이
    // AI 고지도 시험 규칙 동의도 한 번도 안 보고 응시를 시작했다.
    expect(updated.preflight_accepted_at).toBeNull();
  });

  test("instructor approval preserves a preflight the student already accepted", async ({
    instructorRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running", started_at: now });
    // 학생이 먼저 수락한 경우다. 승인이 그 시각을 덮어쓰거나 지우면,
    // 이미 받은 확인을 무효로 만드는 셈이 된다.
    const acceptedAt = new Date(Date.now() - 60_000).toISOString();
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
      preflight_accepted_at: acceptedAt,
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "approve" },
      }
    );

    expect(res.status()).toBe(200);

    const updated = await getSession(session.id);
    expect(updated.status).toBe("in_progress");
    expect(updated.preflight_accepted_at).toBe(acceptedAt);
  });

  test("instructor denies late_pending session → 200, session becomes denied", async ({
    instructorRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      status: "running",
      started_at: now,
    });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "deny" },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("denied");

    // Verify DB state
    const updated = await getSession(session.id);
    expect(updated.status).toBe("denied");
    expect(updated.late_entry_denied_at).toBeTruthy();
  });

  test("student cannot call late-entry → 403", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await studentRequest.post(`/api/exam/${exam.id}/late-entry`, {
      data: { sessionId: session.id, action: "approve" },
    });

    expect(res.status()).toBe(403);
  });

  test("unauthenticated request → 401", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await anonRequest.post(`/api/exam/${exam.id}/late-entry`, {
      data: { sessionId: session.id, action: "approve" },
    });

    expect(res.status()).toBe(401);
  });

  test("action on non-running exam → 400", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "draft" });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "approve" },
      }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  test("invalid action value → 400", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "invalid-action" },
      }
    );

    expect(res.status()).toBe(400);
  });

  test("session not in late_pending status → 400", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "in_progress",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/late-entry`,
      {
        data: { sessionId: session.id, action: "approve" },
      }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  test("non-owner instructor cannot approve → 403", async ({ playwright }) => {
    const { BYPASS_SECRET } = await import("../../fixtures/auth.fixture");
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
      instructor_id: "other-instructor-id",
    });
    const session = await seedSession(exam.id, "late-student-id", {
      status: "late_pending",
    });

    const otherCtx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const res = await otherCtx.post(`/api/exam/${exam.id}/late-entry`, {
      data: { sessionId: session.id, action: "approve" },
    });

    expect(res.status()).toBe(403);
    await otherCtx.dispose();
  });

  test("invalid exam UUID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/exam/not-a-uuid/late-entry",
      {
        data: {
          sessionId: "00000000-0000-0000-0000-000000000001",
          action: "approve",
        },
      }
    );

    expect(res.status()).toBe(400);
  });
});
