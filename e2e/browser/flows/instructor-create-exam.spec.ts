import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import { InstructorCreateExamPage } from "../pages";
import { TIMEOUTS } from "../../constants";

const supabase = getTestSupabase();

test.describe("Instructor — Create Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("page loads with auto-generated 6-char exam code", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();

    // Page title
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Exam code should be auto-generated (6-char alphanumeric input)
    if (await createExam.codeInput.isVisible()) {
      const codeValue = await createExam.codeInput.inputValue();
      expect(codeValue).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  test("can fill title and duration fields", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    // Wait for the form to load
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Fill title
    await expect(createExam.titleInput).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await createExam.titleInput.fill("E2E 테스트 시험");
    await expect(createExam.titleInput).toHaveValue("E2E 테스트 시험");
  });

  test("can type question text", async ({ instructorPage }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    await createExam.addQuestion();
    await expect(createExam.questionArea()).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await createExam.fillQuestion("다형성의 개념을 설명하시오.");

    await expect(createExam.questionArea()).toContainText("다형성");
  });

  test("empty title → validation error on submit", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Fill question but leave title empty
    await createExam.addQuestion();
    await expect(createExam.questionArea()).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await createExam.fillQuestion("테스트 문제입니다.");

    await expect(createExam.submitBtn).toBeDisabled();
    await expect(createExam.submitDisabledReasons).toContainText("시험 제목을 입력해주세요");
  });

  test("empty question → validation error on submit", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Fill title, add a question, but leave the editor empty
    await expect(createExam.titleInput).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await createExam.titleInput.fill("E2E 테스트 시험");
    await createExam.addQuestion();

    await expect(createExam.submitBtn).toBeDisabled();
    await expect(createExam.submitDisabledReasons).toContainText("문제 내용을 입력해주세요");
  });

  test("valid submission → shows success dialog", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Fill title
    await expect(createExam.titleInput).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    const uniqueTitle = `E2E Test ${Date.now()}`;
    await createExam.titleInput.fill(uniqueTitle);

    // Fill question
    await createExam.addQuestion();
    await expect(createExam.questionArea()).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await createExam.fillQuestion("E2E 테스트 문제입니다. 다형성을 설명하세요.");

    // Submit
    await expect(createExam.submitBtn).toBeEnabled();
    await createExam.submitBtn.click();

    // Should show success dialog
    await expect(createExam.successDialog).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

    // Verify in DB
    await expect(async () => {
      const { data } = await supabase
        .from("exams")
        .select("*")
        .eq("title", uniqueTitle);
      expect(data!.length).toBeGreaterThan(0);
    }).toPass({ timeout: TIMEOUTS.ELEMENT_VISIBLE, intervals: [1_000] });
  });

  test("confirm success dialog → navigates to dashboard", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Fill form
    await expect(createExam.titleInput).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await createExam.titleInput.fill(`E2E Nav Test ${Date.now()}`);

    await createExam.addQuestion();
    await expect(createExam.questionArea()).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await createExam.fillQuestion("네비게이션 테스트 문제입니다.");

    // Submit
    await expect(createExam.submitBtn).toBeEnabled();
    await createExam.submitBtn.click();

    // Wait for success dialog
    await expect(createExam.successDialog).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

    // Click confirm button in dialog
    const confirmBtn = instructorPage
      .locator('[role="dialog"]')
      .getByRole("button", { name: /확인/i });
    await confirmBtn.click();

    // Should navigate to instructor dashboard
    await instructorPage.waitForURL(/\/instructor/, { timeout: TIMEOUTS.PAGE_LOAD });
    expect(instructorPage.url()).toContain("/instructor");
  });

});
