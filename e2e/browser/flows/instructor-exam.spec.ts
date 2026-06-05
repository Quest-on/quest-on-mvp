import {
  test,
  expect,
  TEST_INSTRUCTOR,
} from "../fixtures/auth-browser.fixture";
import {
  seedInstructorGradingScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import {
  seedBulkGradingMessage,
  seedBulkGradingSession,
  seedExam,
  seedGrade,
} from "../../helpers/seed";
import { InstructorGradePage } from "../pages";
import { TIMEOUTS } from "../../constants";

test.describe("Instructor — Exam & Grading Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor dashboard shows exam list", async ({ instructorPage }) => {
    // Seed a couple of exams owned by the test instructor
    await seedExam({ title: "Midterm Exam", status: "running" });
    await seedExam({ title: "Final Exam", status: "draft" });

    await instructorPage.goto("/instructor");

    // Dashboard should load and show exam titles
    await expect(instructorPage.getByText(/Midterm Exam/)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });
    await expect(instructorPage.getByText(/Final Exam/)).toBeVisible();
  });

  test("exam detail page shows student cards with progress", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      studentCount: 1,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);

    await expect(instructorPage.getByText(exam.title)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    await expect(
      instructorPage.getByRole("heading", { name: /학생 목록/i }),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    const sessionId = students[0].session.id;
    await expect(
      instructorPage.locator(`[data-testid="exam-student-row-${sessionId}"]`),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    await expect(instructorPage.getByText("서술", { exact: true })).toBeVisible();
    await expect(instructorPage.getByRole("link", { name: /채점/i })).toBeVisible();
  });

  test("exam detail shows proposed score without turning submission into a score", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 1,
    });
    const sessionId = students[0].session.id;

    await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: {
        [sessionId]: {
          0: { score: 82, comment: "근거가 명확합니다." },
        },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);

    const row = instructorPage.locator(`[data-testid="exam-student-row-${sessionId}"]`);
    await expect(row).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(row.getByTestId(`exam-student-total-${sessionId}`)).toHaveText(
      "가채점 82점",
    );
    await expect(row.getByText("제출됨", { exact: true })).toBeVisible();
    await expect(row.getByTestId(`exam-student-status-${sessionId}`)).toHaveText(
      "가채점완료",
    );
    await expect(row).not.toContainText("제출됨 0/1");
  });

  test("exam detail prefers final score after committed grading", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 1,
    });
    const sessionId = students[0].session.id;

    await seedGrade(sessionId, 0, 82, "확정 점수");
    await seedBulkGradingSession(exam.id, {
      status: "committed",
      committed_at: new Date().toISOString(),
      proposed_grades: {
        [sessionId]: {
          0: { score: 40, comment: "stale proposed grade" },
        },
      },
      grading_total: 1,
      grading_completed: 1,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);

    const row = instructorPage.locator(`[data-testid="exam-student-row-${sessionId}"]`);
    await expect(row).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(row.getByTestId(`exam-student-total-${sessionId}`)).toHaveText("82점");
    await expect(row.getByTestId(`exam-student-status-${sessionId}`)).toHaveText(
      "채점완료",
    );
    await expect(row).not.toContainText("가채점 40점");
  });

  test("bulk grading panel keeps chat visible in draft and grading states", async ({
    instructorPage,
  }) => {
    const draftScenario = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 1,
    });

    await instructorPage.goto(`/instructor/${draftScenario.exam.id}`);
    await instructorPage.getByRole("button", { name: "가채점 시작" }).click();

    const draftPanel = instructorPage.getByRole("complementary", {
      name: "CASE AI 가채점",
    });
    await expect(draftPanel).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(draftPanel.getByText("채점 기준을 알려주세요")).toBeVisible();
    await expect(draftPanel.getByTestId("bulk-grade-composer-input")).toBeVisible();
    await expect(draftPanel).not.toContainText("전체 CASE 제안 점수");
    await draftPanel.getByRole("button", { name: "닫기" }).click();

    const gradingScenario = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 1,
    });
    await seedBulkGradingSession(gradingScenario.exam.id, {
      status: "grading",
      grading_total: 1,
      grading_completed: 0,
      grading_failed_count: 0,
    });

    await instructorPage.goto(`/instructor/${gradingScenario.exam.id}`);
    await instructorPage.getByRole("button", { name: "진행 상황 보기" }).click();

    const gradingPanel = instructorPage.getByRole("complementary", {
      name: "CASE AI 가채점",
    });
    await expect(gradingPanel).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(gradingPanel.getByText(/전체 CASE 가채점 중/)).toBeVisible();
    await expect(gradingPanel.getByText(/처리 0\/1명/)).toBeVisible();
    await expect(
      gradingPanel.getByRole("button", { name: "가채점 대화 전송" }),
    ).toBeDisabled();
    await expect(gradingPanel.getByTestId("bulk-grade-composer-input")).toBeVisible();
  });

  test("bulk grading panel uses student identities and persisted chat", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 2,
    });
    const proposedGrades = Object.fromEntries(
      students.map(({ session }, index) => [
        session.id,
        {
          0: {
            score: 80 + index,
            comment: `제안 코멘트 ${index + 1}`,
          },
        },
      ]),
    );
    const gradingSession = await seedBulkGradingSession(exam.id, {
      status: "grading_done",
      proposed_grades: proposedGrades,
      grading_total: 2,
      grading_completed: 2,
    });
    await seedBulkGradingMessage(gradingSession.id, {
      role: "assistant",
      content: "기존 CASE 가채점 대화입니다.",
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await instructorPage.getByRole("button", { name: "검토/확정" }).click();

    const panel = instructorPage.getByRole("complementary", {
      name: "CASE AI 가채점",
    });
    await expect(panel).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(panel.getByText("Test Student 0", { exact: true })).toBeVisible();
    await expect(panel.getByText("Test Student 1", { exact: true })).toBeVisible();
    await expect(panel).not.toContainText("학생 1");
    await expect(panel.getByText("기존 CASE 가채점 대화입니다.")).toBeVisible();
    await expect(panel.getByTestId("bulk-grade-composer-input")).toBeVisible();
  });

  test("committed bulk grading panel is review and chat only", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 1,
    });
    const sessionId = students[0].session.id;
    await seedGrade(sessionId, 0, 90, "확정 점수");
    const gradingSession = await seedBulkGradingSession(exam.id, {
      status: "committed",
      committed_at: new Date().toISOString(),
      proposed_grades: {
        [sessionId]: {
          0: { score: 40, comment: "stale proposed grade" },
        },
      },
      grading_total: 1,
      grading_completed: 1,
    });
    await seedBulkGradingMessage(gradingSession.id, {
      role: "assistant",
      content: "확정 후에도 남아 있는 대화입니다.",
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await expect(
      instructorPage.getByRole("button", { name: "결과/채팅 보기" }),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await instructorPage.getByRole("button", { name: "결과/채팅 보기" }).click();

    const panel = instructorPage.getByRole("complementary", {
      name: "CASE AI 가채점",
    });
    await expect(panel).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(panel.getByText("확정된 CASE 채점")).toBeVisible();
    const finalResults = panel.getByTestId("bulk-grade-final-results");
    await expect(finalResults).toBeVisible();
    await expect(finalResults).toContainText("Test Student 0");
    await expect(finalResults).toContainText("90점");
    await expect(finalResults).toContainText("채점완료");
    await expect(panel.getByText("확정 후에도 남아 있는 대화입니다.")).toBeVisible();
    await expect(panel.getByTestId("bulk-grade-composer-input")).toBeVisible();
    await expect(panel).not.toContainText("확정된 CASE 채점 기록");
    await expect(panel).not.toContainText("stale proposed grade");
    await expect(panel).not.toContainText("전체 CASE 다시 가채점");
    await expect(panel).not.toContainText("채점 확정");
    await expect(panel).not.toContainText("개별 채점");
    await expect(panel.locator('input[type="number"]')).toHaveCount(0);
  });

  test("grading page loads with question, answer, and grading panel", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Should show question prompt (scoped to rich-text container to avoid matching ai_context/answer)
    await expect(
      instructorPage.locator("[data-testid='rich-text-content']").getByText(/Question 1/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Should show student's answer
    await expect(
      instructorPage.getByText("Student 0 answer to question 1"),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });

  test("instructor can input a grade score", async ({ instructorPage }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Find a score input field via data-testid
    await expect(gradePage.scoreInput).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await gradePage.setScore("85");
    await expect(gradePage.scoreInput).toHaveValue("85");
  });

  test("grading page allows navigation between questions", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 2,
    });
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Wait for page to load — use question nav button
    await expect(gradePage.questionNavButton(0)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Click on question 2 navigation
    await expect(gradePage.questionNavButton(1)).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await gradePage.questionNavButton(1).click();

    // Should show second question's content (scoped to rich-text container)
    await expect(
      instructorPage.locator("[data-testid='rich-text-content']").getByText(/Question 2/i),
    ).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
  });
});
