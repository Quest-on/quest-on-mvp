import { test, expect, TEST_INSTRUCTOR } from "./fixtures/auth-browser.fixture";
import { cleanupTestData, clearOnboardingEvents } from "../helpers/seed";
import { StudentExamPage } from "./pages";
import { TIMEOUTS } from "../constants";

/**
 * 교수자 온보딩 — 프로필 → JTBD → 데모 생성 → 착지
 *
 * 이 경로에 브라우저 검증이 하나도 없었다. 온보딩 스펙 15건은 전부 학생
 * 경로(`onboarding-flow.spec.ts`)이거나 동의 UI(`consent-onboarding-flow`)다.
 * 정작 제품의 활성화 순간 — 교수자가 데모 시험을 손에 쥐는 지점 — 은
 * 아무도 안 보고 있었다.
 *
 * `flows/` 가 아니라 여기에 두는 이유: `browser-flows` 프로젝트는 CI 에서
 * 동의 온보딩 스펙 하나만 돈다. flows 에 두면 CI 가 실행하지 않아 초록불이
 * 아무것도 보증하지 않는다.
 */

const SUBJECT_ENGINEERING = "#subject-engineering";
const CONTINUE = { name: /^완료$|^Done$|^Submit$/ };
const CREATE_DEMO = { name: /데모 시험 만들기|Create demo/ };
const SKIP = { name: /^건너뛰기$|^Skip$/ };
const TRY_AS_STUDENT = { name: /학생 시점으로 해보기|Try as a student/ };

/**
 * 프로필 단계를 통과한다.
 *
 * 이름·소속만으로는 제출이 안 열린다 — 만 14세 이상과 약관 동의 두 개가
 * 같은 단계에 있고, 제출 버튼은 "완료"(submitBtn)다. "다음"/"저장"이 아니다.
 */
async function fillProfile(page: import("@playwright/test").Page) {
  const name = page.getByLabel(/이름|Name/);
  await expect(name).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  await name.fill("온보딩 검증 교수");
  // 소속 기관은 자동완성이다. 입력만 하면 제안 목록이 열린 채로 남아
  // 동의 체크박스와 제출 버튼을 덮는다. 실사용자처럼 목록에서 고른다.
  await page.getByLabel(/소속 기관|Institution/).fill("건국대");
  const suggestion = page.getByText("건국대학교", { exact: true }).first();
  await expect(suggestion).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  await suggestion.click();

  // 고른 뒤에는 목록이 다시 열리면 안 된다.
  //
  // handleSchoolSelect 가 질의를 대학 전체 이름으로 세팅하는데, 검색 effect 가
  // 그걸 새 입력으로 보고 같은 검색을 다시 돌리던 때가 있었다. 300ms 뒤 목록이
  // 되살아나 동의 체크박스와 제출 버튼을 덮었다. 로컬에서는 안 터지고 CI 에서만
  // 터졌다 - debounce 를 넘겨 기다려야 보인다.
  await page.waitForTimeout(600);
  await expect(
    suggestion,
    "학교를 고른 뒤 제안 목록이 다시 열렸다 - 동의 체크박스를 덮는다"
  ).toBeHidden();

  // 동의 수집은 롤아웃 플래그다. 서버가 off/shadow 면 UI 가 아예 안 그린다
  // (`consentCollecting === true` 일 때만 fieldset 이 렌더된다). 로컬 스택은
  // 켜져 있고 CI 는 꺼져 있어서, 무조건 클릭하면 CI 에서만 30초 타임아웃으로
  // 죽는다. 있으면 체크하고 없으면 넘어간다 - 이 스펙이 보려는 건 동의 UI 가
  // 아니라 교수자가 데모까지 가는 경로다.
  const ageCheck = page.locator("#age-over-14");
  if (await ageCheck.count()) {
    await ageCheck.click();
    await page.locator("#terms").click();
  }
  await page.getByRole("button", CONTINUE).click();
}

test.describe("교수자 온보딩", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("프로필을 저장하면 JTBD 단계로 넘어간다", async ({ instructorPage }) => {
    await instructorPage.goto("/onboarding");

    // 역할이 이미 확정된 교수자는 역할 단계를 건너뛰고 프로필로 온다.
    await fillProfile(instructorPage);

    // JTBD 단계가 실제로 나타나야 한다. 여기서 멈추면 데모가 안 만들어진다.
    await expect(
      instructorPage.getByText(/어떤 과목을 가르치세요|What subject/)
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });

  test("과목을 고르면 데모 시험이 만들어지고 그 화면에 착지한다", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/onboarding");

    await fillProfile(instructorPage);

    await instructorPage.locator(SUBJECT_ENGINEERING).click();
    await instructorPage.getByRole("button", CREATE_DEMO).click();

    // 빈 대시보드가 아니라 방금 만든 데모 상세로 가야 한다. 목록으로 보내면
    // 데모가 목록에 안 뜨는 규칙(AC-17)과 부딪혀 도달 불가능해진다.
    await instructorPage.waitForURL(/\/instructor\/[0-9a-f-]{36}/, {
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // 착지만으로는 부족하다. 껍데기가 아니라 실제 문항이 있어야 "만들어졌다".
    await expect(instructorPage.locator("body")).not.toContainText(
      /MISSING_MESSAGE|undefined/
    );
  });

  test("건너뛰어도 데모는 만들어진다", async ({ instructorPage }) => {
    // 빈 대시보드로 보내는 것보다 기본 템플릿이라도 만져볼 게 있는 편이 낫다.
    await instructorPage.goto("/onboarding");

    await fillProfile(instructorPage);

    await instructorPage.getByRole("button", SKIP).click();

    await instructorPage.waitForURL(/\/instructor(\/[0-9a-f-]{36})?$/, {
      timeout: TIMEOUTS.PAGE_LOAD,
    });
  });

  test("다시 들어와도 데모가 새로 쌓이지 않는다", async ({ instructorPage }) => {
    // 설정에서 '온보딩 다시 보기'로 재진입할 수 있게 했으므로 멱등해야 한다.
    const walk = async () => {
      await instructorPage.goto("/onboarding");
      await fillProfile(instructorPage);
      await instructorPage.locator(SUBJECT_ENGINEERING).click();
      await instructorPage.getByRole("button", CREATE_DEMO).click();
      await instructorPage.waitForURL(/\/instructor\/[0-9a-f-]{36}/, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      return new URL(instructorPage.url()).pathname;
    };

    const first = await walk();
    const second = await walk();

    // 같은 데모로 돌아와야 한다. 다르면 재진입할 때마다 데모가 쌓인다.
    expect(second).toBe(first);
  });

  test("데모를 학생 시점으로 끝까지 풀면 완주로 기록된다", async ({ instructorPage }) => {
    // 에픽 #79 의 즉시 지표가 "데모 완주율" 이고, 완주 = 학생 시점 1문항 답변 +
    // AI 채점 결과 열람이다(`isDemoCompleted` — demo_graded_viewed 하나로 판정).
    // 위 테스트들은 데모 **생성**에서 멈춘다. 지표의 정의가 실제로 기록되는지
    // 자동으로 보는 곳이 없었다 (#476).
    //
    // CI 에서 되는 근거: Vercel 이 아니라 QStash 없이 채점이 인라인으로
    // 끝난 뒤 제출 응답이 돌아오고(lib/grading-trigger.ts), OpenAI 는 목 서버가
    // 요약을 돌려준다. 즉 제출 직후 볼 채점 결과가 있다.
    test.setTimeout(240_000);

    // 두 마일스톤 모두 사람 단위 "최초 도달" 이라 cleanupTestData 가 안 지운다.
    // 남아 있으면 완주 단정은 헛돌고(이미 참), 고지는 첫 응시가 아니게 되며
    // CTA 도 "다시 풀기" 로 바뀐다. 재시도도 같은 상태에서 시작해야 한다.
    await clearOnboardingEvents(TEST_INSTRUCTOR.id, [
      "demo_graded_viewed",
      "student_disclosure_ack",
    ]);

    await instructorPage.goto("/onboarding");
    await fillProfile(instructorPage);
    await instructorPage.locator(SUBJECT_ENGINEERING).click();
    await instructorPage.getByRole("button", CREATE_DEMO).click();
    await instructorPage.waitForURL(/\/instructor\/[0-9a-f-]{36}$/, {
      timeout: TIMEOUTS.PAGE_LOAD,
    });
    const demoDetail = new URL(instructorPage.url()).pathname;

    // 1. 학생 시점으로 들어간다.
    await instructorPage.getByRole("link", TRY_AS_STUDENT).click();
    await instructorPage.waitForURL(/\/exam\/[A-Z0-9]+/, { timeout: TIMEOUTS.PAGE_LOAD });

    // 2. preflight 는 한 번이다 (#474).
    //
    // 예전에는 수락하면 고지 확인이 init 캐시를 고치고, 그게 init effect 를
    // 다시 돌려 모달이 한 번 더 떴다. 재오픈은 캐시 패치 직후 한 번의 렌더로
    // 일어나므로, 닫힌 뒤 잠깐 기다려도 계속 닫혀 있어야 한다.
    //
    // 두 번 뜨는 건 고지를 처음 확인할 때뿐이다. AI 로그 체크박스가 보인다는
    // 게 "처음" 이라는 증거다 — acceptPreflight 가 그걸 누르므로, 이미 확인한
    // 상태로 시작하면 여기서 멈춘다(위의 마일스톤 초기화가 빠진 경우).
    const exam = new StudentExamPage(instructorPage);
    await expect(exam.preflightHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(exam.preflightAiLogCheckbox).toBeVisible();
    await exam.acceptPreflight();
    await expect(exam.preflightHeading).toBeHidden({ timeout: TIMEOUTS.API_RESPONSE });
    await instructorPage.waitForTimeout(1500);
    await expect(exam.preflightHeading, "수락한 preflight 가 다시 떴다 (#474)").toBeHidden();

    // 3. 답하고 제출한다.
    await expect(exam.answerArea).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await exam.typeAnswer(
      "쓰기 직후 캐시를 무효화하기 전 짧은 창에서 오래된 값을 읽는 문제를 고른다. " +
        "게시판 조회수처럼 몇 초 늦어도 사용자가 손해 보지 않는 값이면 감수할 수 있다."
    );
    await exam.submitBtn.click();
    // 확인 버튼은 몇 초 쿨다운 동안 "제출하기 (3초)" 로 비활성이다. 쿨다운 뒤
    // 이름으로 고르면 click 이 활성화를 기다린다.
    await instructorPage
      .getByTestId("submit-confirm-dialog")
      .getByRole("button", { name: /^제출하기$|^Submit$/ })
      .click({ timeout: TIMEOUTS.PAGE_LOAD });

    // 4. 채점 결과를 연다. 완주는 "결과가 있는 채점 화면을 열었다" 로 기록된다.
    //
    // 결과가 아직 없을 때 열면 기록되지 않는다(`hasViewableGradingResult`).
    // 그래서 판정이 참이 될 때까지 채점 화면을 다시 연다 — 제품이 실제로
    // 기록하는 경로 그대로다. 기록은 채점 화면이 부르는 GET 에서 일어나므로
    // 그 응답을 기다린 뒤 상태를 읽는다. 그 GET 은 60초 브라우저 캐시가 걸려
    // 있어(max-age=60) 결과가 늦으면 한 번은 캐시에서 나올 수 있다 — 제한
    // 시간을 그보다 넉넉히 둔다.
    await expect
      .poll(
        async () => {
          await instructorPage.goto(demoDetail);
          const grade = instructorPage.locator('a[href*="/grade/"]:visible').first();
          if (!(await grade.isVisible().catch(() => false))) return false;
          const graded = instructorPage.waitForResponse(
            (r) =>
              r.request().method() === "GET" &&
              /^\/api\/session\/[^/]+\/grade$/.test(new URL(r.url()).pathname),
            { timeout: TIMEOUTS.PAGE_LOAD }
          );
          await grade.click();
          await graded.catch(() => null);
          const status = await instructorPage.evaluate(() =>
            fetch("/api/onboarding/demo/status", { cache: "no-store" }).then((r) => r.json())
          );
          return status?.completed === true;
        },
        { timeout: 150_000, intervals: [3_000, 5_000, 10_000] }
      )
      .toBe(true);
  });
});
