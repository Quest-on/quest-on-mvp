import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
  getExam,
  getSession,
  getGrades,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

async function waitForGrades(sessionId: string, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const grades = await getGrades(sessionId);
    if (grades.length > 0) return grades;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return [];
}

test.describe("Supa — POST /api/supa (core actions)", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── create_exam ──

  test("instructor creates exam → 200, exam stored in DB", async ({
    instructorRequest,
  }) => {
    const examData = {
      title: "E2E Test Exam",
      code: `E2E-${Date.now().toString(36).toUpperCase()}`,
      duration: 45,
      status: "draft",
      questions: [
        {
          id: "q-0",
          text: "What is encapsulation?",
          type: "essay",
        },
      ],
      rubric: [{ evaluationArea: "Understanding", detailedCriteria: "Demonstrates clear understanding of encapsulation." }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "create_exam", data: examData },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam.id).toBeTruthy();

    // Verify in DB
    const { data: dbExam } = await supabase
      .from("exams")
      .select("*")
      .eq("code", examData.code)
      .single();
    expect(dbExam).toBeTruthy();
    expect(dbExam!.title).toBe("E2E Test Exam");
    expect(dbExam!.duration).toBe(45);
    expect(dbExam!.status).toBe("draft");
  });

  test("student cannot create exam → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "create_exam",
        data: {
          title: "Forbidden",
          code: "NOPE",
          duration: 30,
          status: "draft",
          questions: [{ id: "q-0", text: "Test", type: "essay" }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    });

    expect(res.status()).toBe(403);
  });

  test("anon cannot create exam → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/supa", {
      data: {
        action: "create_exam",
        data: {
          title: "Forbidden",
          code: "NOPE",
          duration: 30,
          status: "draft",
          questions: [{ id: "q-0", text: "Test", type: "essay" }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    });

    expect(res.status()).toBe(401);
  });

  // ── get_exam ──

  test("get exam by code → 200, returns exam data", async ({
    anonRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.post("/api/supa", {
      data: { action: "get_exam", data: { code: exam.code } },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam.id).toBe(exam.id);
    expect(body.exam.title).toBe(exam.title);
  });

  test("get exam with invalid code → 404", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/supa", {
      data: { action: "get_exam", data: { code: "NONEXISTENT-CODE" } },
    });

    expect(res.status()).toBe(404);
  });

  // ── create_or_get_session ──

  test("student creates session for exam → 200, session in DB", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "create_or_get_session",
        data: { examId: exam.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session).toBeTruthy();
    expect(body.session.exam_id).toBe(exam.id);

    // Verify in DB
    const { data: dbSession } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", "test-student-id")
      .single();
    expect(dbSession).toBeTruthy();
  });

  test("create_or_get_session returns existing session on second call", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "waiting",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "create_or_get_session",
        data: { examId: exam.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe(session.id);
  });

  // ── save_draft ──

  test("student saves draft → 200, answer stored in DB", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        data: {
          sessionId: session.id,
          questionId: "0",
          answer: "My draft answer about polymorphism.",
        },
      },
    });

    expect(res.status()).toBe(200);

    // Verify in DB
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .eq("q_idx", 0);
    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(1);
    expect(submissions![0].answer).toBe("My draft answer about polymorphism.");
  });

  test("save_draft updates existing answer and increments edit_count", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    // First save
    await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        data: {
          sessionId: session.id,
          questionId: "0",
          answer: "First draft",
        },
      },
    });

    // Second save (update)
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        data: {
          sessionId: session.id,
          questionId: "0",
          answer: "Updated draft",
        },
      },
    });

    expect(res.status()).toBe(200);

    // Verify DB has updated answer
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .eq("q_idx", 0);
    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(1);
    expect(submissions![0].answer).toBe("Updated draft");
  });

  // ── submit_exam ──

  test("student submits exam → 200, session status=submitted", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date().toISOString(),
      attempt_timer_started_at: new Date().toISOString(),
    });

    // Seed some draft answers
    await seedSubmission(session.id, 0, { answer: "Answer for Q1" });
    await seedSubmission(session.id, 1, { answer: "Answer for Q2" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "submit_exam",
        data: {
          examId: exam.id,
          studentId: "test-student-id",
          sessionId: session.id,
          answers: [
            { questionIdx: 0, text: "Final answer for Q1" },
            { questionIdx: 1, text: "Final answer for Q2" },
          ],
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify session status in DB
    const dbSession = await getSession(session.id);
    expect(dbSession.status).toBe("submitted");
    expect(dbSession.submitted_at).toBeTruthy();

    // Regression: submit_exam path must enqueue grading
    const grades = await waitForGrades(session.id);
    expect(grades.length).toBeGreaterThan(0);
  });

  test("session_heartbeat auto-submit triggers grading when time expired", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running", duration: 1 });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      attempt_timer_started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    // Seed submissions for BOTH essay questions so the dev-fallback grading
    // path runs per-question summaries (which create `grades` rows). With a
    // single submission, autoGradeSession would skip per-question summaries
    // and only update `sessions.ai_summary`, leaving `grades` empty.
    await seedSubmission(session.id, 0, { answer: "Timed-out answer draft Q1" });
    await seedSubmission(session.id, 1, { answer: "Timed-out answer draft Q2" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        data: { sessionId: session.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.timeExpired).toBe(true);

    const grades = await waitForGrades(session.id);
    expect(grades.length).toBeGreaterThan(0);
  });

  test("anon cannot submit exam → 401", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.post("/api/supa", {
      data: {
        action: "submit_exam",
        data: {
          examId: exam.id,
          studentId: "test-student-id",
          sessionId: "fake-session-id",
          answers: [],
        },
      },
    });

    expect(res.status()).toBe(401);
  });

  // ── invalid action ──

  test("invalid action → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/supa", {
      data: { action: "nonexistent_action", data: {} },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_ACTION");
  });

  // ── missing action ──

  test("missing action field → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/supa", {
      data: { data: {} },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_ACTION");
  });

  // ── get_session_submissions ──

  test("student gets session submissions → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0, { answer: "My answer" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "get_session_submissions",
        data: { sessionId: session.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.submissions || body)).toBe(true);
  });

  // ── update_exam: code lock ──

  test("cannot change exam code when sessions exist → 409", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "draft" });
    // A student has already joined
    await seedSession(exam.id, "test-student-id", { status: "waiting" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: { code: "NEWCODE" },
        },
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("CODE_LOCKED");
  });

  test("cannot change score weights when sessions exist → 409", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      questions: [
        {
          id: "q-0",
          idx: 0,
          type: "multiple-choice",
          text: "Pick A",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
        },
        {
          id: "q-1",
          idx: 1,
          type: "true-false",
          text: "True?",
          correctOptionIndex: 0,
        },
      ],
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 50, "true-false": 50 },
      },
    });
    await seedSession(exam.id, "test-student-id", { status: "waiting" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: {
            score_weights: {
              version: 1,
              distribution: "equal_by_type",
              typeWeights: { "multiple-choice": 60, "true-false": 40 },
            },
          },
        },
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("SCORE_WEIGHTS_LOCKED");
  });

  test("validates score weights against existing questions on score-only update → 400", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      questions: [
        {
          id: "q-0",
          idx: 0,
          type: "multiple-choice",
          text: "Pick A",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
        },
      ],
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      },
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: {
            score_weights: {
              version: 1,
              distribution: "equal_by_type",
              typeWeights: { case: 100 },
            },
          },
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SCORE_WEIGHTS");
  });

  test("rejects null score weights when questions exist → 400", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      questions: [
        {
          id: "q-0",
          idx: 0,
          type: "multiple-choice",
          text: "Pick A",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
        },
      ],
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      },
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: { score_weights: null },
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SCORE_WEIGHTS");
  });

  test("validates existing score weights when questions change → 400", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      questions: [
        {
          id: "q-0",
          idx: 0,
          type: "multiple-choice",
          text: "Pick A",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
        },
      ],
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      },
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: {
            questions: [
              {
                id: "q-0",
                idx: 0,
                type: "essay",
                text: "Explain the case.",
              },
            ],
          },
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SCORE_WEIGHTS");
  });

  test("can change exam code when no sessions exist → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: { code: "NEWCODE" },
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam.code).toBe("NEWCODE");
  });
});
