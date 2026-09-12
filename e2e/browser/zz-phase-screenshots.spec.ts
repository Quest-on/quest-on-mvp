import path from "node:path";
import { test } from "./fixtures/auth-browser.fixture";
import {
  cleanupTestData,
  seedExam,
  seedSession,
  seedStudentProfile,
  seedSubmission,
} from "../helpers/seed";
import { seedInstructorGradingScenario } from "./helpers/test-data-builder";
import { TIMEOUTS } from "../constants";

/**
 * 임시 스펙 — 머지하지 않는다.
 *
 * #385 의 단계별 화면을 사람이 눈으로 확인하기 위해 각 단계의 전체 화면을
 * 찍어 아티팩트로 올린다. staging 은 의도적으로 인증 우회가 없어서
 * (`docs/STAGING.md` 원칙 3) 배포본에 로그인해 볼 수가 없다. CI 는 테스트
 * 바이패스가 있으므로 여기서 찍는다.
 */

const SHOT_DIR = path.resolve(__dirname, "../../test-results");

const QUESTION_TEXT =
  "구독형 서비스를 운영하는 스타트업이 월 9,900원에서 14,900원으로 가격을 올리려 합니다. 이탈률 상승을 감수할 만한 조건은 무엇인지, 어떤 지표로 판단할지 서술하세요.";

const questions = [
  { id: "q-0", idx: 0, type: "essay", text: QUESTION_TEXT, prompt: QUESTION_TEXT },
];

test.describe("단계별 화면 스크린샷", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("setup — 갓 만든 시험", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "[데모] 가격 결정 사례 분석",
      status: "draft",
      duration: 20,
      questions,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await instructorPage
      .getByTestId("student-notice-preview")
      .waitFor({ timeout: TIMEOUTS.PAGE_LOAD });
    await instructorPage.waitForTimeout(800);
    await instructorPage.screenshot({
      path: path.join(SHOT_DIR, "phase-1-setup.png"),
      fullPage: true,
    });
  });

  test("setup — 더보기 메뉴", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "[데모] 가격 결정 사례 분석",
      status: "draft",
      duration: 20,
      questions,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await instructorPage
      .getByTestId("student-notice-preview")
      .waitFor({ timeout: TIMEOUTS.PAGE_LOAD });
    await instructorPage.getByRole("button", { name: "더보기" }).click();
    await instructorPage.waitForTimeout(500);
    await instructorPage.screenshot({
      path: path.join(SHOT_DIR, "phase-1-setup-menu.png"),
    });
  });

  test("live — 학생이 들어온 진행 중 시험", async ({ instructorPage }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({
      title: "경영전략 중간고사",
      status: "running",
      duration: 60,
      questions,
    });
    await seedStudentProfile("test-student-id", {
      name: "김학생",
      student_number: "2024-0001",
      school: "건국대학교",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: now,
      preflight_accepted_at: now,
      attempt_timer_started_at: now,
    });
    await seedSubmission(session.id, 0, { answer: "가격 인상은..." });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await instructorPage
      .getByRole("heading", { name: "학생 목록" })
      .waitFor({ timeout: TIMEOUTS.PAGE_LOAD });
    await instructorPage.waitForTimeout(1200);
    await instructorPage.screenshot({
      path: path.join(SHOT_DIR, "phase-2-live.png"),
      fullPage: true,
    });
  });

  test("review — 종료된 시험과 더보기 메뉴", async ({ instructorPage }) => {
    const { exam } = await seedInstructorGradingScenario({
      questionCount: 1,
      studentCount: 2,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await instructorPage
      .getByRole("heading", { name: "학생 목록" })
      .waitFor({ timeout: TIMEOUTS.PAGE_LOAD });
    await instructorPage.waitForTimeout(1200);
    await instructorPage.screenshot({
      path: path.join(SHOT_DIR, "phase-3-review.png"),
      fullPage: true,
    });

    await instructorPage.getByRole("button", { name: "더보기" }).click();
    await instructorPage.waitForTimeout(500);
    await instructorPage.screenshot({
      path: path.join(SHOT_DIR, "phase-3-review-menu.png"),
    });
  });
});
