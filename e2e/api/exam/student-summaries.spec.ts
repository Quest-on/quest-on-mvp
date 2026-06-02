import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedGrade,
  seedBulkGradingSession,
  cleanupTestData,
} from "../../helpers/seed";
import { compressData } from "../../../lib/compression";

test.describe("GET /api/exam/[examId]/student-summaries", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor gets student summaries for submitted session", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 1,
          idx: 0,
        },
        {
          id: "q1",
          type: "essay",
          text: "Essay",
          idx: 1,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "1" });
    await seedGrade(session.id, 0, 100, "Correct", "auto");
    await seedGrade(session.id, 1, 80, "Essay graded", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("submitted");
    expect(body.students[0].mcq).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].caseProgress).toEqual({ submitted: 0, graded: 1, total: 1 });
    expect(body.students[0].overallStatus).toBe("manually_graded");
  });

  test("includes in-progress session with submissions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-2", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0, { answer: "0" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("in-progress");
  });

  test("includes waiting-room session", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-waiting", {
      status: "waiting",
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("in-progress");
  });

  test("falls back to raw objective submissions when invalid grade rows exist", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 1,
          idx: 0,
        },
        {
          id: "q1",
          type: "true-false",
          text: "OX",
          options: ["O", "X"],
          correctOptionIndex: 0,
          idx: 1,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-invalid-objective", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "1" });
    await seedSubmission(session.id, 1, { answer: "0" });
    await seedGrade(session.id, 0, 0, "Invalid AI failure row", "ai_failed");
    await seedGrade(session.id, 1, 0, "Invalid summary placeholder", "ai_summary");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].mcq).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].ox).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].overallScore).toBe(100);
    expect(body.students[0].overallStatus).toBe("ai_graded");
  });

  test("uses raw objective submissions instead of stale scoring grade rows", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 2,
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-stale-objective", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "2" });
    await seedGrade(session.id, 0, 0, "Stale objective grade", "auto");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].mcq).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].overallScore).toBe(100);
  });

  test("applies configured type score weights to final score", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: {
          "multiple-choice": 40,
          "true-false": 20,
          case: 40,
        },
      },
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ 1",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
          idx: 0,
        },
        {
          id: "q1",
          type: "multiple-choice",
          text: "MCQ 2",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 2,
          idx: 1,
        },
        {
          id: "q2",
          type: "true-false",
          text: "OX",
          options: ["O", "X"],
          correctOptionIndex: 1,
          idx: 2,
        },
        {
          id: "q3",
          type: "essay",
          text: "Case",
          idx: 3,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-weighted-score", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "0" });
    await seedSubmission(session.id, 1, { answer: "1" });
    await seedSubmission(session.id, 2, { answer: "1" });
    await seedGrade(session.id, 0, 0, "Stale objective grade", "auto");
    await seedGrade(session.id, 3, 75, "Case graded", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].mcq).toEqual({ correct: 1, total: 2 });
    expect(body.students[0].ox).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].caseProgress).toEqual({ submitted: 0, graded: 1, total: 1 });
    expect(body.students[0].overallScore).toBe(70);
  });

  test("does not use stored grades when objective answer key is invalid", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-invalid-key", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "0" });
    await seedGrade(session.id, 0, 100, "Stale objective grade", "auto");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].mcq).toEqual({ correct: 0, total: 1 });
    expect(body.students[0].overallScore).toBeUndefined();
  });

  test("does not expose final score before exam is closed", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 1,
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-running-score", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "1" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].overallStatus).toBe("ai_graded");
    expect(body.students[0].overallScore).toBeUndefined();
  });

  test("ai_summary placeholders do not mask auto case grades", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "essay",
          text: "Essay",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-case-summary", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 99, 0, "Summary placeholder", "ai_summary");
    await seedGrade(session.id, 0, 90, "Auto case grade", "auto");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 0, graded: 1, total: 1 });
    expect(body.students[0].overallScore).toBe(90);
    expect(body.students[0].overallStatus).toBe("ai_graded");
  });

  test("case type questions are counted as case progress", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "case",
          text: "Case",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-case-type", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].caseProgress).toEqual({ submitted: 0, graded: 0, total: 1 });
    expect(body.students[0].overallStatus).toBe("grading");
  });

  test("submitted case without final or proposed grade does not synthesize score", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "essay",
          text: "Essay",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-case-ungraded", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Non-empty essay answer" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 1, graded: 0, total: 1 });
    expect(body.students[0].overallScore).toBeUndefined();
    expect(body.students[0].proposedOverallScore).toBeUndefined();
    expect(body.students[0].bulkGradeStatus).toBe("none");
  });

  test("complete proposed case grades produce display-only proposed overall score", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 1,
          idx: 0,
        },
        {
          id: "q1",
          type: "essay",
          text: "Essay",
          idx: 1,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-proposed-complete", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "1" });
    await seedSubmission(session.id, 1, { answer: "Case answer" });
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [session.id]: { 1: { score: 80, comment: "가채점 결과" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 1, graded: 0, total: 1 });
    expect(body.students[0].overallScore).toBeUndefined();
    expect(body.students[0].proposedOverallScore).toBe(90);
    expect(body.students[0].overallStatus).toBe("grading");
    expect(body.students[0].bulkGradeStatus).toBe("proposed_ready");
  });

  test("missing case submission hides proposed overall score instead of treating it as zero", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "essay",
          text: "Essay",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-proposed-unsubmitted", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [session.id]: { 0: { score: 100, comment: "Should not count" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 0, graded: 0, total: 1 });
    expect(body.students[0].overallScore).toBeUndefined();
    expect(body.students[0].proposedOverallScore).toBeUndefined();
    expect(body.students[0].bulkGradeStatus).toBe("failed");
  });

  test("partial proposed case grades hide proposed overall score", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        { id: "q0", type: "essay", text: "Essay 1", idx: 0 },
        { id: "q1", type: "short-answer", text: "Essay 2", idx: 1 },
      ],
    });
    const session = await seedSession(exam.id, "student-proposed-partial", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "First answer" });
    await seedSubmission(session.id, 1, { answer: "Second answer" });
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [session.id]: { 0: { score: 75, comment: "Only first question" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 2, graded: 0, total: 2 });
    expect(body.students[0].proposedOverallScore).toBeUndefined();
    expect(body.students[0].bulkGradeStatus).toBe("failed");
  });

  test("proposed overall score follows configured score weights", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      score_weights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: {
          "multiple-choice": 20,
          case: 80,
        },
      },
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
          idx: 0,
        },
        {
          id: "q1",
          type: "case",
          text: "Case",
          idx: 1,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-proposed-weighted", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "0" });
    await seedSubmission(session.id, 1, { answer: "Weighted case answer" });
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [session.id]: { 1: { score: 50, comment: "가채점 결과" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].overallScore).toBeUndefined();
    expect(body.students[0].proposedOverallScore).toBe(60);
    expect(body.students[0].caseProgress).toEqual({ submitted: 1, graded: 0, total: 1 });
  });

  test("compressed case answers count as submitted for proposed completeness", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "essay",
          text: "Essay",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-compressed-case", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    const compressed = compressData({ answer: "Compressed essay answer" });
    await seedSubmission(session.id, 0, {
      answer: "",
      compressed_answer_data: compressed.data,
      compression_metadata: compressed.metadata,
    });
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [session.id]: { 0: { score: 85, comment: "Compressed answer grade" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 1, graded: 0, total: 1 });
    expect(body.students[0].proposedOverallScore).toBe(85);
    expect(body.students[0].bulkGradeStatus).toBe("proposed_ready");
  });

  test("committed grading session hides stale proposed scores and keeps final score", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          type: "essay",
          text: "Essay",
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-committed-stale-proposed", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Case answer" });
    await seedGrade(session.id, 0, 70, "Final committed grade", "manual");
    await seedBulkGradingSession(exam.id, {
      status: "committed",
      committed_at: new Date().toISOString(),
      proposed_grades: {
        [session.id]: { 0: { score: 100, comment: "Stale proposal" } },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].caseProgress).toEqual({ submitted: 1, graded: 1, total: 1 });
    expect(body.students[0].overallScore).toBe(70);
    expect(body.students[0].proposedOverallScore).toBeUndefined();
    expect(body.students[0].bulkGradeStatus).toBe("committed");
  });

  test("returns empty students when no sessions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([]);
  });

  test("student cannot access student summaries", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await studentRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(403);
  });

  test("anon cannot access student summaries", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(401);
  });

  test("non-owner instructor cannot access student summaries", async ({
    playwright,
  }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "other-instructor-id",
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

    const res = await otherInstructorReq.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(403);
    await otherInstructorReq.dispose();
  });
});
