import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { StudentExamPage } from "../pages";
import { getSession } from "../../helpers/seed";
import { TIMEOUTS } from "../../constants";

test.describe("Full Exam Submission Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student completes full exam submission from joined session on running exam", async ({
    studentPage,
  }) => {
    // 1. Seed a running exam with a joined (pre-preflight) session
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
      withSubmissions: false,
      // Simulates a returning student whose preflight was previously accepted
      // so the page reconciles directly into the live exam without re-prompting.
      preflightAccepted: true,
    });

    const examPage = new StudentExamPage(studentPage);

    // 2. Navigate to exam page
    await examPage.goto(exam.code);

    // 3. Running exam should reconcile the stale joined session directly into the exam
    await expect(async () => {
      const reconciledSession = await getSession(session.id);
      expect(reconciledSession.status).toBe("in_progress");
      expect(reconciledSession.started_at).toBeTruthy();
      expect(reconciledSession.attempt_timer_started_at).toBeTruthy();
    }).toPass({ timeout: TIMEOUTS.PAGE_LOAD, intervals: [1_000] });

    // 4. Question content should appear without an intermediate waiting room
    await expect(
      studentPage.getByText(/polymorphism|stack|queue/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 5. Answer all questions
    await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.typeAnswer(
      "Polymorphism is a core OOP concept that allows objects to take many forms.",
    );

    await examPage.nextQuestion();
    await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await examPage.typeAnswer(
      "A stack is LIFO, while a queue is FIFO.",
    );

    // 6. Save the answers via Ctrl+S
    await examPage.manualSave();
    await expect(examPage.saveIndicator).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });

    // 7. Submit the exam
    await expect(examPage.submitBtn).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.submitBtn.click();

    // 8. Confirm submission in the dialog
    const confirmBtn = studentPage
      .locator('[role="alertdialog"], [role="dialog"]')
      .getByRole("button", { name: /제출|submit|확인|confirm/i });
    await expect(confirmBtn).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await confirmBtn.click();

    // 9. Verify submission is persisted in DB
    await expect(async () => {
      const updatedSession = await getSession(session.id);
      expect(updatedSession.submitted_at).toBeTruthy();
    }).toPass({ timeout: TIMEOUTS.PAGE_LOAD, intervals: [1_000] });
  });
});
