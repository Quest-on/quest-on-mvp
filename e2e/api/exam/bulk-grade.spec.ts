import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  cleanupTestData,
  seedBulkGradingSession,
  seedExam,
  seedMessage,
  seedSession,
  seedStudentProfile,
  seedSubmission,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();
const APP_USER_STUDENT_ID = "11111111-1111-4111-8111-111111111111";

test.describe("GET /api/exam/[examId]/bulk-grade", () => {
  test.afterEach(async () => {
    await cleanupTestData();
    await supabase.from("profiles").delete().eq("id", APP_USER_STUDENT_ID);
  });

  test("returns submitted student identities with stable session mapping", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const firstSession = await seedSession(exam.id, "student-profiled-1", {
      status: "submitted",
      submitted_at: "2026-05-31T00:00:00.000Z",
    });
    const secondSession = await seedSession(exam.id, "student-no-profile-2", {
      status: "submitted",
      submitted_at: "2026-05-31T00:01:00.000Z",
    });
    const thirdSession = await seedSession(exam.id, APP_USER_STUDENT_ID, {
      status: "submitted",
      submitted_at: "2026-05-31T00:02:00.000Z",
    });
    await seedStudentProfile("student-profiled-1", {
      name: "김민지",
      student_number: "2026-1001",
      school: "Quest University",
    });
    const { error: appProfileError } = await supabase.from("profiles").upsert({
      id: APP_USER_STUDENT_ID,
      display_name: "App Fallback Student",
      role: "student",
      status: "approved",
    });
    expect(appProfileError).toBeNull();

    const proposedGrades = {
      [firstSession.id]: { 0: { score: 92, comment: "좋은 분석" } },
      [secondSession.id]: { 0: { score: 84, comment: "근거 보강 필요" } },
      [thirdSession.id]: { 0: { score: 88, comment: "앱 프로필 이름 확인" } },
    };
    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: proposedGrades,
      grading_total: 3,
      grading_completed: 3,
    });

    const res = await instructorRequest.get(`/api/exam/${exam.id}/bulk-grade`);
    const body = await res.json();

    expect(res.status()).toBe(200);
    expect(body.studentCount).toBe(3);
    expect(body.session.proposed_grades).toEqual(proposedGrades);
    expect(JSON.stringify(body.session.proposed_grades)).not.toContain("김민지");
    expect(body.students).toEqual([
      expect.objectContaining({
        sessionId: firstSession.id,
        studentId: "student-profiled-1",
        name: "김민지",
        studentNumber: "2026-1001",
        school: "Quest University",
      }),
      expect.objectContaining({
        sessionId: secondSession.id,
        studentId: "student-no-profile-2",
        name: "Student student-",
      }),
      expect.objectContaining({
        sessionId: thirdSession.id,
        studentId: APP_USER_STUDENT_ID,
        name: "App Fallback Student",
      }),
    ]);
    expect(body.students[1].email).toBeUndefined();
    expect(Object.keys(body.session.proposed_grades).sort()).toEqual(
      body.students.map((student: { sessionId: string }) => student.sessionId).sort(),
    );
    expect(new Date(body.students[0].submittedAt).toISOString()).toBe(
      "2026-05-31T00:00:00.000Z",
    );
    expect(new Date(body.students[1].submittedAt).toISOString()).toBe(
      "2026-05-31T00:01:00.000Z",
    );
    expect(new Date(body.students[2].submittedAt).toISOString()).toBe(
      "2026-05-31T00:02:00.000Z",
    );
  });

  test("does not leak answer or message content in student identity response", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [{ id: "q0", type: "essay", text: "Case", idx: 0 }],
    });
    const session = await seedSession(exam.id, "student-secret-1", {
      status: "submitted",
      submitted_at: "2026-05-31T00:00:00.000Z",
    });
    await seedSubmission(session.id, 0, {
      answer: "SECRET_ANSWER_SHOULD_NOT_LEAK",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "SECRET_CHAT_SHOULD_NOT_LEAK",
    });

    const res = await instructorRequest.get(`/api/exam/${exam.id}/bulk-grade`);
    const bodyText = JSON.stringify(await res.json());

    expect(res.status()).toBe(200);
    expect(bodyText).not.toContain("SECRET_ANSWER_SHOULD_NOT_LEAK");
    expect(bodyText).not.toContain("SECRET_CHAT_SHOULD_NOT_LEAK");
    expect(bodyText).not.toContain('"submissions"');
    expect(bodyText).not.toContain('"messages"');
    expect(bodyText).not.toContain('"answer"');
    expect(bodyText).not.toContain('"content"');
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

    const [nonOwnerRes, studentRes, anonRes] = await Promise.all([
      otherInstructorReq.get(`/api/exam/${exam.id}/bulk-grade`),
      studentRequest.get(`/api/exam/${exam.id}/bulk-grade`),
      anonRequest.get(`/api/exam/${exam.id}/bulk-grade`),
    ]);

    expect(nonOwnerRes.status()).toBe(403);
    expect(studentRes.status()).toBe(403);
    expect(anonRes.status()).toBe(401);
    await otherInstructorReq.dispose();
  });
});
