import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  cleanupTestData,
  getExam,
  getSession,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("Supa — POST /api/supa (extended actions)", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── update_exam ──

  test("instructor updates exam title → 200, exam updated in DB", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "draft", title: "Original Title" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: {
          id: exam.id,
          update: { title: "Updated Title", duration: 90 },
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam.title).toBe("Updated Title");
    expect(body.exam.duration).toBe(90);

    // Verify in DB
    const dbExam = await getExam(exam.id);
    expect(dbExam.title).toBe("Updated Title");
    expect(dbExam.duration).toBe(90);
  });

  test("student cannot update exam → 403", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: { id: exam.id, update: { title: "Hacked Title" } },
      },
    });

    expect(res.status()).toBe(403);
  });

  test("instructor cannot update another instructor's exam → 404", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      instructor_id: "other-instructor-id",
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_exam",
        data: { id: exam.id, update: { title: "Stolen Exam" } },
      },
    });

    expect(res.status()).toBe(404);
  });

  // ── get_exam_by_id ──

  test("instructor gets own exam by id → 200, returns exam", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "get_exam_by_id", data: { id: exam.id } },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam.id).toBe(exam.id);
    expect(body.exam.title).toBe(exam.title);
    expect(body.exam.code).toBe(exam.code);
  });

  test("get_exam_by_id with non-existent id → 404", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "get_exam_by_id",
        data: { id: "00000000-0000-0000-0000-000000000001" },
      },
    });

    expect(res.status()).toBe(404);
  });

  test("student cannot get exam by id → 403", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await studentRequest.post("/api/supa", {
      data: { action: "get_exam_by_id", data: { id: exam.id } },
    });

    expect(res.status()).toBe(403);
  });

  // ── get_instructor_exams ──

  test("instructor lists own exams → 200, returns array with student counts", async ({
    instructorRequest,
  }) => {
    const exam1 = await seedExam({ status: "draft", title: "Exam A" });
    const exam2 = await seedExam({ status: "running", title: "Exam B" });

    // Create a session for exam2 to verify student_count
    await seedSession(exam2.id, "test-student-id", { status: "in_progress" });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "get_instructor_exams", data: {} },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.exams)).toBe(true);
    expect(body.exams.length).toBeGreaterThanOrEqual(2);

    // Check that student_count is present
    const foundExam2 = body.exams.find(
      (e: { id: string }) => e.id === exam2.id
    );
    expect(foundExam2).toBeTruthy();
    expect(foundExam2.student_count).toBe(1);
  });

  test("student cannot list instructor exams → 403", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: { action: "get_instructor_exams", data: {} },
    });

    expect(res.status()).toBe(403);
  });

  // ── init_exam_session ──

  test("student initializes session for running exam → 200, returns exam and session", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      status: "running",
      started_at: now,
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "init_exam_session",
        data: { examCode: exam.code, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam).toBeTruthy();
    expect(body.exam.id).toBe(exam.id);
    expect(body.session).toBeTruthy();
    expect(body.session.exam_id).toBe(exam.id);
    expect(body.session.student_id).toBe("test-student-id");
    // When exam is running with started_at set and has a duration, session should be late_pending
    expect(body.session.status).toBe("late_pending");
  });

  test("init_exam_session with invalid exam code → 404", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "init_exam_session",
        data: { examCode: "NONEXISTENT-CODE", studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(404);
  });

  test("init_exam_session returns existing session on second call", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      status: "running",
      started_at: now,
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: now,
      attempt_timer_started_at: now,
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "init_exam_session",
        data: { examCode: exam.code, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe(session.id);
  });

  // ── save_all_drafts ──

  test("student saves all drafts → 200, submissions stored in DB", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_all_drafts",
        data: {
          sessionId: session.id,
          drafts: [
            { questionId: "0", text: "Answer for question 0" },
            { questionId: "1", text: "Answer for question 1" },
          ],
        },
      },
    });

    expect(res.status()).toBe(200);

    // Verify in DB
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .order("q_idx", { ascending: true });
    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(2);
    expect(submissions![0].answer).toBe("Answer for question 0");
    expect(submissions![1].answer).toBe("Answer for question 1");
  });

  test("student cannot save drafts for another student's session → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_all_drafts",
        data: {
          sessionId: session.id,
          drafts: [{ questionId: "0", text: "Stolen answer" }],
        },
      },
    });

    expect(res.status()).toBe(403);
  });

  // ── save_draft_answers ──

  test("student saves draft answers by question id → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      questions: [
        {
          idx: 0,
          id: "q-alpha",
          type: "open_ended",
          text: "What is OOP?",
          prompt: "What is OOP?",
          ai_context: "OOP concepts",
        },
        {
          idx: 1,
          id: "q-beta",
          type: "open_ended",
          text: "What is FP?",
          prompt: "What is FP?",
          ai_context: "FP concepts",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft_answers",
        data: {
          sessionId: session.id,
          answers: [
            { questionId: "q-alpha", text: "OOP is object-oriented programming" },
            { questionId: "q-beta", text: "FP is functional programming" },
          ],
        },
      },
    });

    expect(res.status()).toBe(200);

    // Verify in DB
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .order("q_idx", { ascending: true });
    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(2);
  });

  test("student cannot save draft answers for another student's session → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft_answers",
        data: {
          sessionId: session.id,
          answers: [{ questionId: "q1", text: "Stolen answer" }],
        },
      },
    });

    expect(res.status()).toBe(403);
  });

  // ── get_session_messages ──

  test("student gets own session messages → 200, returns messages array", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "What is polymorphism?",
    });
    await seedMessage(session.id, 0, {
      role: "assistant",
      content: "Polymorphism is the ability of an object to take many forms.",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "get_session_messages",
        data: { sessionId: session.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(2);
  });

  test("instructor gets session messages for own exam → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "test-instructor-id",
    });
    const session = await seedSession(exam.id, "some-student-id", {
      status: "in_progress",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Help me with Q1",
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "get_session_messages",
        data: { sessionId: session.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(1);
  });

  test("student cannot get messages for another student's session → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Private message",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "get_session_messages",
        data: { sessionId: session.id },
      },
    });

    expect(res.status()).toBe(403);
  });

  // ── session_heartbeat ──

  test("student sends heartbeat → 200, returns timeRemaining", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running", duration: 60 });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: now,
      attempt_timer_started_at: now,
    });

    // Mark session as active so heartbeat succeeds
    await supabase
      .from("sessions")
      .update({ is_active: true })
      .eq("id", session.id);

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        data: { sessionId: session.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // timeRemaining should be a number (seconds) since exam has duration and session is in_progress
    expect(typeof body.timeRemaining).toBe("number");
    expect(body.timeRemaining).toBeGreaterThan(0);
  });

  test("heartbeat for non-existent session → 404", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        data: {
          sessionId: "00000000-0000-0000-0000-000000000001",
          studentId: "test-student-id",
        },
      },
    });

    expect(res.status()).toBe(404);
  });

  test("heartbeat with wrong student id → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        data: { sessionId: session.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(403);
  });

  // ── check_exam_gate_status ──

  test("running exam gate check promotes waiting session → 200, returns in_progress", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      status: "running",
      started_at: now,
      duration: 60,
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "waiting",
      preflight_accepted_at: now,
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "check_exam_gate_status",
        data: { examId: exam.id, sessionId: session.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.gateStarted).toBe(true);
    expect(body.sessionStatus).toBe("in_progress");
    expect(body.sessionStartTime).toBeTruthy();
    expect(typeof body.timeRemaining).toBe("number");

    const updatedSession = await getSession(session.id);
    expect(updatedSession.status).toBe("in_progress");
    expect(updatedSession.started_at).toBeTruthy();
    expect(updatedSession.attempt_timer_started_at).toBeTruthy();
  });

  // ── deactivate_session ──

  test("student deactivates own session → 200, session is_active=false in DB", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    // Mark session as active first
    await supabase
      .from("sessions")
      .update({ is_active: true })
      .eq("id", session.id);

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "deactivate_session",
        data: { sessionId: session.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(200);

    // Verify in DB
    const dbSession = await getSession(session.id);
    expect(dbSession.is_active).toBe(false);
  });

  test("student cannot deactivate another student's session → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "deactivate_session",
        data: { sessionId: session.id, studentId: "test-student-id" },
      },
    });

    expect(res.status()).toBe(403);
  });

  test("deactivate non-existent session → 404", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "deactivate_session",
        data: {
          sessionId: "00000000-0000-0000-0000-000000000001",
          studentId: "test-student-id",
        },
      },
    });

    expect(res.status()).toBe(404);
  });

  // ── copy_exam ──

  test("instructor copies own exam → 200, new exam with different code", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "draft", title: "Original Exam" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "copy_exam",
        data: { exam_id: exam.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exam).toBeTruthy();
    expect(body.exam.id).not.toBe(exam.id);
    expect(body.exam.code).not.toBe(exam.code);
    expect(body.exam.title).toContain("(복사본)");
    expect(body.exam.status).toBe("draft");

    // Verify new exam exists in DB
    const dbExam = await getExam(body.exam.id);
    expect(dbExam).toBeTruthy();
    expect(dbExam.title).toContain("Original Exam");
    expect(dbExam.title).toContain("(복사본)");
  });

  test("student cannot copy exam → 403", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "copy_exam",
        data: { exam_id: exam.id },
      },
    });

    expect(res.status()).toBe(403);
  });

  test("instructor cannot copy another instructor's exam → 404", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "draft",
      instructor_id: "other-instructor-id",
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "copy_exam",
        data: { exam_id: exam.id },
      },
    });

    expect(res.status()).toBe(404);
  });
});
