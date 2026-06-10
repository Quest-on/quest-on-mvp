import {
  test,
  expect,
  TEST_STUDENT,
} from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { getSession } from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import { StudentExamPage } from "../pages";
import { TIMEOUTS } from "../../constants";

const supabase = getTestSupabase();

test.describe("Student — Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("loads exam page and reconciles a stale joined session into the live exam", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
      // Simulates a returning student whose preflight was previously accepted
      // so the in_progress reconciliation does not re-show the preflight modal.
      preflightAccepted: true,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    await expect(
      studentPage.getByText(/polymorphism|stack|queue/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(examPage.preflightHeading).toHaveCount(0);

    const updatedSession = await getSession(session.id);
    expect(updatedSession.status).toBe("in_progress");
    expect(updatedSession.started_at).toBeTruthy();
    expect(updatedSession.attempt_timer_started_at).toBeTruthy();
  });

  test("shows question panel after preflight is accepted (in_progress session)", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
      withSubmissions: false,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show the question content
    await expect(
      studentPage.getByText(/polymorphism|stack|queue/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });

  test("navigates between CASE questions using prev/next buttons", async ({
    studentPage,
  }) => {
    // Default seed = 2 essay (CASE) questions, no objective.
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // First CASE (polymorphism) — no prev button (cannot go before the first CASE).
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(examPage.prevBtn).toHaveCount(0);

    // Record an answer to verify original-index mapping survives back-navigation.
    await examPage.typeAnswer("my polymorphism answer");

    // Next → second CASE (stack/queue): prev now available, next hidden (last).
    await examPage.nextQuestion();
    await expect(
      studentPage.getByText(/stack|queue/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(examPage.prevBtn).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(examPage.nextBtn).toHaveCount(0);

    // Prev → back to the first CASE; its answer must persist (keyed by original idx).
    await examPage.prevQuestion();
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(examPage.prevBtn).toHaveCount(0);
    await expect(examPage.answerArea).toHaveValue("my polymorphism answer");
  });

  test("keeps the question panel open when the answer editor is focused", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Panel starts open: the toolbar shows "문제 접기" (collapse action).
    await expect(examPage.questionCollapseBtn).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });

    // Focusing the answer editor must NOT auto-collapse the question panel.
    await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.answerArea.click();

    await expect(examPage.questionCollapseBtn).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(examPage.questionExpandBtn).toHaveCount(0);
    await expect(studentPage.getByText(/polymorphism/i)).toBeVisible();
  });

  test("reopens the question panel after manual collapse and navigation", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Student collapses the panel manually via the toolbar toggle.
    await expect(examPage.questionCollapseBtn).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await examPage.questionCollapseBtn.click();
    await expect(examPage.questionExpandBtn).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });

    // Moving to another question should reopen the panel.
    await examPage.nextQuestion();
    await expect(examPage.questionCollapseBtn).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(
      studentPage.getByText(/stack|queue/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });

  test("can type an answer in the answer panel", async ({ studentPage }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for answer area to be available
    await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Type an answer
    await examPage.typeAnswer("This is my test answer about polymorphism.");

    // Verify the text was entered
    await expect(examPage.answerArea).toHaveValue(/polymorphism/);
  });

  test("manual save with Ctrl+S triggers save indicator", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for the page to load
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Type something in the answer area
    await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.typeAnswer("Test answer for save");

    // Trigger Ctrl+S
    await examPage.manualSave();

    // Should show saving/saved indicator via data-testid
    await expect(examPage.saveIndicator).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });

    // Verify draft was saved to DB (poll until persisted)
    await expect(async () => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("session_id", session.id)
        .eq("q_idx", 0);
      expect(data!.length).toBeGreaterThan(0);
      expect(data![0].answer).toContain("Test answer for save");
    }).toPass({ timeout: TIMEOUTS.DB_POLL, intervals: [TIMEOUTS.DB_POLL_INTERVAL] });
  });

  test("submit button shows confirmation dialog", async ({ studentPage }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
      withSubmissions: true,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Find and click the submit button — must be visible
    await expect(examPage.submitBtn).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.submitBtn.click();

    // Confirmation dialog should appear
    await expect(
      studentPage.locator("[data-testid='submit-confirm-dialog']"),
    ).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });

    const submitDialog = studentPage.locator("[data-testid='submit-confirm-dialog']");
    const finalSubmitButton = submitDialog.getByRole("button", {
      name: /제출하기/i,
    });

    await expect(finalSubmitButton).toBeDisabled({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(finalSubmitButton).toBeEnabled({ timeout: TIMEOUTS.API_RESPONSE + 4000 });
  });

  test("shows waiting room when exam is not started", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "draft",
      sessionStatus: "waiting",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show waiting room via data-testid
    await expect(examPage.waitingRoom).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });

  test("shows submitted state for already submitted session", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "submitted",
      withSubmissions: true,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show submission complete message
    await expect(
      studentPage.locator("[data-testid='exam-submitted-state']"),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });
});
