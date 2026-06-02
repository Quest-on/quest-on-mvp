import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  cleanupTestData,
  getBulkGradingMessages,
  getBulkGradingSession,
  seedBulkGradingMessage,
  seedBulkGradingSession,
  seedExam,
  seedSession,
  seedSubmission,
} from "../../helpers/seed";

test.describe("GET/POST /api/exam/[examId]/bulk-grade/chat", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("GET returns an empty discussion thread when no bulk grading session exists", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });

    const res = await instructorRequest.get(`/api/exam/${exam.id}/bulk-grade/chat`);
    const body = await res.json();

    expect(res.status()).toBe(200);
    expect(body.session).toBeNull();
    expect(body.messages).toEqual([]);
    expect(body.canStartGrading).toBe(false);
  });

  test("GET returns an existing discussion thread without mutating grading state", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const gradingSession = await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: { "session-a": { 0: { score: 88, comment: "기존 제안" } } },
      grading_total: 1,
      grading_completed: 1,
    });
    await seedBulkGradingMessage(gradingSession.id, {
      role: "assistant",
      content: "기존 안내 메시지",
    });
    await seedBulkGradingMessage(gradingSession.id, {
      role: "user",
      content: "기준을 다시 설명해줘.",
    });

    const res = await instructorRequest.get(`/api/exam/${exam.id}/bulk-grade/chat`);
    const body = await res.json();
    const after = await getBulkGradingSession(exam.id);

    expect(res.status()).toBe(200);
    expect(body.session).toMatchObject({
      id: gradingSession.id,
      status: "grading_done",
      calibration_status: "draft",
    });
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual([
      "기존 안내 메시지",
      "기준을 다시 설명해줘.",
    ]);
    expect(body.canStartGrading).toBe(true);
    expect(after.status).toBe("grading_done");
    expect(after.proposed_grades).toEqual({
      "session-a": { 0: { score: 88, comment: "기존 제안" } },
    });
  });

  test("POST init converges under concurrent requests", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    await seedSession(exam.id, "student-bulk-chat-concurrent", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const [firstRes, secondRes] = await Promise.all([
      instructorRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: { init: true },
      }),
      instructorRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: { init: true },
      }),
    ]);

    expect(firstRes.status()).toBe(200);
    expect(secondRes.status()).toBe(200);

    const gradingSession = await getBulkGradingSession(exam.id);
    const messages = await getBulkGradingMessages(gradingSession.id);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(messages.filter((m) => m.role === "user")).toHaveLength(0);
    expect(gradingSession.status).toBe("draft");
    expect(gradingSession.proposed_grades).toEqual({});
    expect(gradingSession.committed_at).toBeNull();
  });

  test("POST init is idempotent and preserves an existing grading_done proposal", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const studentSession = await seedSession(exam.id, "student-bulk-chat-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    const proposedGrades = {
      [studentSession.id]: {
        0: { score: 87, comment: "논리 전개가 좋음" },
      },
    };
    const gradingSession = await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: proposedGrades,
      grading_total: 1,
      grading_completed: 1,
      grading_failed_count: 0,
    });
    await seedBulkGradingMessage(gradingSession.id, {
      role: "assistant",
      content: "기존 가채점 대화입니다.",
    });

    const res = await instructorRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
      data: { init: true },
    });
    const body = await res.json();
    const after = await getBulkGradingSession(exam.id);

    expect(res.status()).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({
      role: "assistant",
      content: "기존 가채점 대화입니다.",
    });
    expect(after.status).toBe("grading_done");
    expect(after.proposed_grades).toEqual(proposedGrades);
    expect(after.grading_completed).toBe(1);
    expect(after.grading_failed_count).toBe(0);
  });

  test("POST discussion after grading_done appends messages without mutating proposed grades", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const studentSession = await seedSession(exam.id, "student-bulk-chat-2", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(studentSession.id, 0, { answer: "학생 답안" });
    const proposedGrades = {
      [studentSession.id]: {
        0: { score: 91, comment: "구체적 근거가 충분함" },
      },
    };
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: proposedGrades,
      grading_total: 1,
      grading_completed: 1,
      grading_failed_count: 0,
      current_attempt_id: "attempt-before-chat",
      processed_session_ids: { [studentSession.id]: true },
    });

    const res = await instructorRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
      data: { message: "이 가채점 결과의 근거를 설명해줘." },
    });
    const body = await res.json();
    const after = await getBulkGradingSession(exam.id);

    expect(res.status()).toBe(200);
    expect(body.assistantMessage).toMatchObject({ role: "assistant" });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(after.status).toBe("grading_done");
    expect(after.proposed_grades).toEqual(proposedGrades);
    expect(after.current_attempt_id).toBe("attempt-before-chat");
    expect(after.processed_session_ids).toEqual({ [studentSession.id]: true });
  });

  test("POST discussion during active grading states only appends messages", async ({
    instructorRequest,
  }) => {
    const states = [
      { status: "grading", calibration_status: "approved" },
      { status: "committing", calibration_status: "approved" },
      { status: "draft", calibration_status: "sample_grading" },
    ];

    for (const [index, state] of states.entries()) {
      const exam = await seedExam({
        status: "closed",
        questions: [{ id: `q${index}`, type: "essay", text: "Case", idx: 0 }],
      });
      const studentSession = await seedSession(
        exam.id,
        `student-bulk-chat-active-${index}`,
        {
          status: "submitted",
          submitted_at: new Date().toISOString(),
        },
      );
      await seedSubmission(studentSession.id, 0, { answer: "학생 답안" });
      const proposedGrades = {
        [studentSession.id]: {
          0: { score: 76 + index, comment: "기존 제안" },
        },
      };
      const processedSessionIds = { [studentSession.id]: true };
      await seedBulkGradingSession(exam.id, {
        status: state.status,
        calibration_status: state.calibration_status,
        proposed_grades: proposedGrades,
        grading_total: 4,
        grading_completed: 2,
        grading_failed_count: 1,
        current_attempt_id: `attempt-active-${index}`,
        processed_session_ids: processedSessionIds,
      });

      const res = await instructorRequest.post(
        `/api/exam/${exam.id}/bulk-grade/chat`,
        { data: { message: "현재 진행 상태를 설명해줘." } },
      );
      const after = await getBulkGradingSession(exam.id);
      const messages = await getBulkGradingMessages(after.id);

      expect(res.status()).toBe(200);
      expect(after.status).toBe(state.status);
      expect(after.calibration_status).toBe(state.calibration_status);
      expect(after.proposed_grades).toEqual(proposedGrades);
      expect(after.grading_total).toBe(4);
      expect(after.grading_completed).toBe(2);
      expect(after.grading_failed_count).toBe(1);
      expect(after.current_attempt_id).toBe(`attempt-active-${index}`);
      expect(after.processed_session_ids).toEqual(processedSessionIds);
      expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    }
  });

  test("POST discussion after committed preserves committed_at and final state", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const studentSession = await seedSession(exam.id, "student-bulk-chat-3", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(studentSession.id, 0, { answer: "학생 답안" });
    const committedAt = "2026-05-31T00:00:00.000Z";
    await seedBulkGradingSession(exam.id, {
      status: "committed",
      committed_at: committedAt,
      proposed_grades: {
        [studentSession.id]: {
          0: { score: 80, comment: "확정 전 제안" },
        },
      },
    });

    const res = await instructorRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
      data: { message: "확정된 결과를 다시 설명해줘." },
    });
    const after = await getBulkGradingSession(exam.id);

    expect(res.status()).toBe(200);
    expect(after.status).toBe("committed");
    expect(new Date(after.committed_at).toISOString()).toBe(committedAt);
  });

  test("blocks non-owner, student, and anonymous access", async ({
    playwright,
    studentRequest,
    anonRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      instructor_id: "other-instructor-id",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });

    const otherInstructorReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const [
      nonOwnerGetRes,
      studentGetRes,
      anonGetRes,
      nonOwnerPostRes,
      studentPostRes,
      anonPostRes,
      anonMalformedPostRes,
    ] = await Promise.all([
      otherInstructorReq.get(`/api/exam/${exam.id}/bulk-grade/chat`),
      studentRequest.get(`/api/exam/${exam.id}/bulk-grade/chat`),
      anonRequest.get(`/api/exam/${exam.id}/bulk-grade/chat`),
      otherInstructorReq.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: { message: "접근할 수 없어야 합니다." },
      }),
      studentRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: { message: "접근할 수 없어야 합니다." },
      }),
      anonRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: { message: "접근할 수 없어야 합니다." },
      }),
      anonRequest.post(`/api/exam/${exam.id}/bulk-grade/chat`, {
        data: {},
      }),
    ]);

    expect(nonOwnerGetRes.status()).toBe(403);
    expect(studentGetRes.status()).toBe(403);
    expect(anonGetRes.status()).toBe(401);
    expect(nonOwnerPostRes.status()).toBe(403);
    expect(studentPostRes.status()).toBe(403);
    expect(anonPostRes.status()).toBe(401);
    expect(anonMalformedPostRes.status()).toBe(401);
    await otherInstructorReq.dispose();
  });
});
