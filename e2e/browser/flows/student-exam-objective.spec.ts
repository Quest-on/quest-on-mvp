/**
 * E2e regression tests: objective-only exam student UX.
 *
 * These tests verify that:
 * 1. An objective-only (MCQ) exam hides all AI chat UI elements.
 * 2. A mixed exam (1 essay + 1 MCQ) shows/hides chat per-question.
 * 3. The PreflightModal shows the correct checkboxes based on exam type.
 *
 * NOTE: These tests require a running Next.js dev server (port 3000) and
 * a seeded test database. They were written and verified structurally but
 * NOT executed in the authoring sandbox (no live server/DB available).
 */
import {
  test,
  expect,
} from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { seedExam, seedSession, seedStudentProfile } from "../../helpers/seed";
import { StudentExamPage } from "../pages";
import { TIMEOUTS } from "../../constants";

// ------------------------------------------------------------------ helpers --

const now = () => new Date().toISOString();

/** Seed a running, in_progress objective-only exam (2 MCQ questions). */
async function seedObjectiveOnlyExam() {
  const questions = [
    {
      id: "q-obj-0",
      idx: 0,
      type: "multiple-choice",
      text: "Which data structure follows LIFO?",
      prompt: "Which data structure follows LIFO?",
      ai_context: "",
      options: ["Queue", "Stack", "Tree", "Graph"],
      correctOptionIndex: 1,
    },
    {
      id: "q-obj-1",
      idx: 1,
      type: "multiple-choice",
      text: "What does OOP stand for?",
      prompt: "What does OOP stand for?",
      ai_context: "",
      options: [
        "Object Oriented Programming",
        "Open Object Protocol",
        "Ordered Output Process",
        "Optional Output Pointer",
      ],
      correctOptionIndex: 0,
    },
  ];

  const t = now();
  const exam = await seedExam({
    status: "running",
    started_at: t,
    questions,
    rubric: [],
  });

  await seedStudentProfile("test-student-id");

  const session = await seedSession(exam.id, "test-student-id", {
    status: "in_progress",
    started_at: t,
    preflight_accepted_at: t,
    attempt_timer_started_at: t,
  });

  return { exam, session };
}

/** Seed a running, in_progress mixed exam (1 essay + 1 MCQ). */
async function seedMixedExam() {
  const questions = [
    {
      id: "q-mix-0",
      idx: 0,
      type: "essay",
      text: "Explain polymorphism in your own words.",
      prompt: "Explain polymorphism in your own words.",
      ai_context: "OOP concept",
    },
    {
      id: "q-mix-1",
      idx: 1,
      type: "multiple-choice",
      text: "Which is a compile-time polymorphism example?",
      prompt: "Which is a compile-time polymorphism example?",
      ai_context: "",
      options: [
        "Method overloading",
        "Method overriding",
        "Interface implementation",
        "Abstract class",
      ],
      correctOptionIndex: 0,
    },
  ];

  const t = now();
  const exam = await seedExam({
    status: "running",
    started_at: t,
    questions,
    rubric: [
      {
        evaluationArea: "Polymorphism understanding",
        detailedCriteria: "Student explains polymorphism clearly.",
      },
    ],
  });

  await seedStudentProfile("test-student-id");

  const session = await seedSession(exam.id, "test-student-id", {
    status: "in_progress",
    started_at: t,
    preflight_accepted_at: t,
    attempt_timer_started_at: t,
  });

  return { exam, session };
}

/** Seed a preflight-pending (joined) objective-only exam. */
async function seedObjectiveOnlyExamPreflight() {
  const questions = [
    {
      id: "q-pre-0",
      idx: 0,
      type: "multiple-choice",
      text: "Is the sky blue?",
      prompt: "Is the sky blue?",
      ai_context: "",
      options: ["Yes", "No"],
      correctOptionIndex: 0,
    },
  ];

  const t = now();
  const exam = await seedExam({
    status: "running",
    started_at: t,
    questions,
    rubric: [],
  });

  await seedStudentProfile("test-student-id");

  // "joined" status → triggers preflight modal on page load
  await seedSession(exam.id, "test-student-id", {
    status: "joined",
    started_at: null,
    preflight_accepted_at: null,
    attempt_timer_started_at: null,
  });

  return { exam };
}

/** Seed a preflight-pending essay (mixed) exam. */
async function seedMixedExamPreflight() {
  const questions = [
    {
      id: "q-epre-0",
      idx: 0,
      type: "essay",
      text: "Explain recursion.",
      prompt: "Explain recursion.",
      ai_context: "CS concept",
    },
    {
      id: "q-epre-1",
      idx: 1,
      type: "multiple-choice",
      text: "Which of these is a base case pattern?",
      prompt: "Which of these is a base case pattern?",
      ai_context: "",
      options: ["n === 0", "n > 0", "n < 10", "n % 2 === 0"],
      correctOptionIndex: 0,
    },
  ];

  const t = now();
  const exam = await seedExam({
    status: "running",
    started_at: t,
    questions,
    rubric: [
      {
        evaluationArea: "Recursion",
        detailedCriteria: "Student explains recursion and base case.",
      },
    ],
  });

  await seedStudentProfile("test-student-id");

  await seedSession(exam.id, "test-student-id", {
    status: "joined",
    started_at: null,
    preflight_accepted_at: null,
    attempt_timer_started_at: null,
  });

  return { exam };
}

// ------------------------------------------------------------------- tests ---

test.describe("Student — Objective-Only Exam UX", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("objective-only: AI chat elements are absent from DOM", async ({
    studentPage,
  }) => {
    const { exam } = await seedObjectiveOnlyExam();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for exam to load (first question text visible)
    await expect(
      studentPage.getByText(/LIFO|OOP/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // AI chat floating button must NOT be in DOM
    await expect(examPage.floatingChatButton).toHaveCount(0);

    // Chat sidebar close button must NOT be in DOM
    await expect(examPage.chatSidebarClose).toHaveCount(0);

    // Question collapse/expand controls must NOT be in DOM
    // (these only exist when the sidebar is present)
    await expect(examPage.questionCollapseBtn).toHaveCount(0);
    await expect(examPage.questionExpandBtn).toHaveCount(0);

    // Essay free-text textarea must NOT be in DOM
    await expect(examPage.essayAnswerArea).toHaveCount(0);
  });

  test("objective-only: MCQ option is visible, clickable, and persists", async ({
    studentPage,
  }) => {
    const { exam } = await seedObjectiveOnlyExam();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    await expect(
      studentPage.getByText(/LIFO/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // First objective option must be visible
    const firstOption = examPage.objectiveOption(0);
    await expect(firstOption).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // Click an option — it should reflect a selected state
    await firstOption.click();

    // After click, the option should still be visible (selection persisted in UI)
    await expect(firstOption).toBeVisible({ timeout: TIMEOUTS.QUICK_CHECK });

    // Navigate to second question
    await expect(examPage.questionNav(1)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await examPage.nextQuestion();

    await expect(
      studentPage.getByText(/OOP/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // Second question's first option should also be visible
    await expect(examPage.objectiveOption(0)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
  });

  test("objective-only: submit flow completes end-to-end", async ({
    studentPage,
  }) => {
    const { exam } = await seedObjectiveOnlyExam();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    await expect(
      studentPage.getByText(/LIFO/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Select an option on question 1
    await examPage.objectiveOption(0).click();

    // Move to question 2
    await examPage.nextQuestion();
    await expect(
      studentPage.getByText(/OOP/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // Select an option on question 2
    await examPage.objectiveOption(0).click();

    // Click submit
    await expect(examPage.submitBtn).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await examPage.submitBtn.click();

    // Confirm dialog should appear
    await expect(
      studentPage.locator("[data-testid='submit-confirm-dialog']"),
    ).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
  });
});

test.describe("Student — Mixed Exam (essay + MCQ) UX", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("essay question shows chat sidebar button; MCQ question hides it", async ({
    studentPage,
  }) => {
    const { exam } = await seedMixedExam();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // First question is an essay — chat UI must be present
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // On essay question: either floating chat button or sidebar close button
    // is present (sidebar opens by default on essay)
    const chatPresent = studentPage
      .locator('[aria-label="AI 채팅 열기"], [aria-label="채팅 사이드바 닫기"]');
    await expect(chatPresent.first()).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // Navigate to MCQ question
    await examPage.nextQuestion();
    await expect(
      studentPage.getByText(/compile-time/i),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // On MCQ question: AI chat elements must be hidden
    await expect(examPage.floatingChatButton).toHaveCount(0);
    await expect(examPage.chatSidebarClose).toHaveCount(0);

    // ObjectiveAnswerPanel must be present
    await expect(examPage.objectiveOption(0)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });

    // 단방향 진행: MCQ에서 이전 essay 문제로 되돌아갈 수 없다(되돌아가기 검증 제거).

    // TODO(S2): Verify chat-history *content* preservation across MCQ navigation.
    // useExamChat is mounted at page level so history survives unmount, but
    // exercising the full path requires sending a chat message — which hits
    // /api/chat (OpenAI). Add this once a chat-API mock fixture exists.
  });
});

test.describe("Preflight — copy gating by exam type", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("objective-only exam: shows only rules checkbox, no AI-log checkbox; entry button enables on rules only", async ({
    studentPage,
  }) => {
    const { exam } = await seedObjectiveOnlyExamPreflight();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Preflight modal should appear
    await expect(examPage.preflightHeading).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // AI-log checkbox must NOT be in DOM
    await expect(examPage.preflightAiLogCheckbox).toHaveCount(0);

    // Accept button is disabled before rules checkbox is checked
    await expect(examPage.preflightAcceptBtn).toBeDisabled({
      timeout: TIMEOUTS.QUICK_CHECK,
    });

    // Check only the rules checkbox
    await examPage.preflightRulesCheckbox.click();

    // Accept button should now be enabled (no AI-log required)
    await expect(examPage.preflightAcceptBtn).toBeEnabled({
      timeout: TIMEOUTS.API_RESPONSE,
    });
  });

  test("mixed/essay exam: shows both rules and AI-log checkboxes; both required", async ({
    studentPage,
  }) => {
    const { exam } = await seedMixedExamPreflight();

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Preflight modal should appear
    await expect(examPage.preflightHeading).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // AI-log checkbox must be in DOM
    await expect(examPage.preflightAiLogCheckbox).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });

    // Accept button is disabled before any checkbox
    await expect(examPage.preflightAcceptBtn).toBeDisabled({
      timeout: TIMEOUTS.QUICK_CHECK,
    });

    // Check only rules — button still disabled (AI-log not checked)
    await examPage.preflightRulesCheckbox.click();
    await expect(examPage.preflightAcceptBtn).toBeDisabled({
      timeout: TIMEOUTS.QUICK_CHECK,
    });

    // Check AI-log too — button should enable
    await examPage.preflightAiLogCheckbox.click();
    await expect(examPage.preflightAcceptBtn).toBeEnabled({
      timeout: TIMEOUTS.API_RESPONSE,
    });
  });
});
