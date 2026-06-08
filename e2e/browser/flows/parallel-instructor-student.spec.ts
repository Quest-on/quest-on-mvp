/**
 * Full Cross-Role E2E Simulation
 *
 * Runs instructor and student in two independent browser contexts,
 * testing the live interaction: join → wait → start → answer → submit → grade → report.
 *
 * Unlike grade-to-report.spec.ts (which pre-seeds everything), this test lets
 * the student actually join, wait in the waiting room, and watch the exam activate
 * in real-time after the instructor triggers the start.
 */
import { test, expect } from "@playwright/test";
import { TEST_STUDENT, TEST_INSTRUCTOR } from "../fixtures/auth-browser.fixture";
import { createAuthPage, BYPASS_SECRET } from "../helpers/auth-context";
import {
  seedExam,
  seedStudentProfile,
  cleanupTestData,
  getSession,
  getSessionsByExam,
  getGrades,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import {
  StudentExamPage,
  InstructorGradePage,
  StudentReportPage,
} from "../pages";
import { TIMEOUTS } from "../../constants";

test.describe("Parallel Instructor + Student — Full Cross-Role E2E", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("join → wait → start → answer → submit → grade → report", async ({
    browser,
    baseURL,
  }) => {
    // Full cross-role flow: join → wait → start → answer → submit → grade → report
    // Requires 120s due to multiple page navigations and AI grading wait
    test.setTimeout(120_000);

    const url = baseURL ?? "http://localhost:3000";
    const supabase = getTestSupabase();

    // ── Step 1: Seed exam (joinable, not yet started) & student profile ──
    // grades_released: true — flow asserts overallScore on student report page,
    // which is gated behind exam.grades_released in the report API.
    const exam = await seedExam({ status: "joinable", grades_released: true });
    await seedStudentProfile(TEST_STUDENT.id);

    // ── Create two independent browser contexts (with baseURL) ──
    const studentCtx = await browser.newContext({ baseURL: url });
    const instructorCtx = await browser.newContext({ baseURL: url });
    const sPage = await createAuthPage(studentCtx, TEST_STUDENT, url);
    const iPage = await createAuthPage(instructorCtx, TEST_INSTRUCTOR, url);

    try {
      // ── Step 2: Student navigates to /exam/[code] ──
      // (Equivalent to going through /join → redirect; /join is covered by its own spec)
      const examPage = new StudentExamPage(sPage);
      await examPage.goto(exam.code);

      // ── Step 3: Accept preflight → land in waiting room ──
      await expect(examPage.preflightHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      await examPage.acceptPreflight();
      await expect(examPage.waitingRoom).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

      // Verify session created with "waiting" status in DB
      const sessions = await getSessionsByExam(exam.id);
      expect(sessions.length).toBe(1);
      const sessionId = sessions[0].id;

      await expect(async () => {
        const s = await getSession(sessionId);
        expect(s.status).toBe("waiting");
      }).toPass({ timeout: TIMEOUTS.ELEMENT_VISIBLE, intervals: [1_000] });

      // ── Step 4: Instructor starts exam (via API for atomic update) ──
      const startResponse = await iPage.request.post(
        `${url}/api/exam/${exam.id}/start`,
        {
          data: {},
          headers: {
            "Content-Type": "application/json",
            "x-test-user-id": TEST_INSTRUCTOR.id,
            "x-test-user-role": "instructor",
            "x-test-bypass-token": BYPASS_SECRET,
          },
        }
      );
      expect(startResponse.status()).toBe(200);

      // ── Step 5: Student exam activates — questions appear ──
      // WaitingRoom polls every 10s; generous timeout to allow detection
      await expect(
        sPage.getByText(/polymorphism|stack|queue/i),
      ).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

      // ── Step 6: Student answers ALL questions ──
      // Q1: Polymorphism
      await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
      await examPage.typeAnswer(
        "Polymorphism allows objects of different classes to be treated as objects of a common superclass.",
      );

      // Navigate to Q2 and answer it
      await examPage.nextQuestion();
      await expect(examPage.answerArea).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
      await examPage.typeAnswer(
        "A stack is LIFO (last in, first out) while a queue is FIFO (first in, first out).",
      );

      // Save all answers
      await examPage.manualSave();
      await expect(examPage.saveIndicator).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });

      // ── Step 7: Student submits exam ──
      await expect(examPage.submitBtn).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
      await examPage.submitBtn.click();

      // Submit confirmation dialog (single dialog since all Qs are answered)
      const confirmBtn = sPage
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /제출하기/ });
      await expect(confirmBtn).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
      await confirmBtn.click();

      // Wait for submission to complete — check submitted_at in DB
      // (The /api/feedback endpoint sets submitted_at, not status)
      await expect(async () => {
        const s = await getSession(sessionId);
        expect(s.submitted_at).not.toBeNull();
      }).toPass({ timeout: 20_000, intervals: [1_000] });

      // Grading is only available after the exam has ended.
      const { error: closeExamError } = await supabase
        .from("exams")
        .update({ status: "closed", close_at: new Date().toISOString() })
        .eq("id", exam.id);
      expect(closeExamError).toBeNull();

      // ── Step 8: Instructor navigates to grading page ──
      const gradePage = new InstructorGradePage(iPage);
      await gradePage.goto(exam.id, sessionId);

      await expect(
        iPage.getByRole("heading", { name: /채점/ }),
      ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

      // ── Step 9: Instructor grades the student ──
      await expect(gradePage.scoreInput).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
      await gradePage.setScore("90");
      await gradePage.saveBtn.click();

      // Grade question 1 if navigation button is available
      const q1Nav = gradePage.questionNavButton(1);
      if (await q1Nav.isVisible({ timeout: TIMEOUTS.QUICK_CHECK }).catch(() => false)) {
        await q1Nav.click();
        await expect(gradePage.scoreInput).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
        await gradePage.setScore("85");
        await gradePage.saveBtn.click();
      }

      // Verify grades persisted in DB
      await expect(async () => {
        const grades = await getGrades(sessionId);
        expect(grades.length).toBeGreaterThanOrEqual(1);
        const q0 = grades.find((g) => g.q_idx === 0);
        expect(q0).toBeDefined();
        expect(q0!.score).toBe(90);
      }).toPass({ timeout: TIMEOUTS.ELEMENT_VISIBLE, intervals: [1_000] });

      // ── Step 10: Student views report ──
      const reportPage = new StudentReportPage(sPage);
      await reportPage.goto(sessionId);

      await expect(
        sPage.getByRole("heading", { name: exam.title }),
      ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      await expect(reportPage.overallScore).toContainText("전체 점수: 88/100점", {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    } finally {
      await studentCtx.close();
      await instructorCtx.close();
    }
  });
});
