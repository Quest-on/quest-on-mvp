import { test, expect } from "./fixtures/auth-browser.fixture";
import { cleanupTestData } from "./helpers/test-data-builder";
import { InstructorCreateExamPage } from "./pages";
import { TIMEOUTS } from "../constants";

/**
 * 문항 유형별 배점 — 실제로 렌더된 숫자를 읽는다
 *
 * 유닛 테스트(`__tests__/score-weight-display.test.ts`)는 `lib/score-weight-display.ts`
 * 의 산식을 직접 검증한다. 하지만 컴포넌트가 그 helper 를 **호출하는 배선**까지는
 * 못 본다 — 래퍼만 옛 `weight / count` 로 되돌려도 유닛 테스트는 통과한다
 * (레드팀이 실증했다).
 *
 * 이 파일이 그 구멍을 막는다. 실제 화면에 그려진 숫자를 읽어서 배선을 확인한다.
 *
 * 배점 버킷은 셋이다 — 객관식 / 참거짓 / 사례. `essay` 와 `short-answer` 는
 * `case` 버킷으로 묶인다(`lib/grade-utils.ts` scoreBucketForQuestionType).
 *
 * `e2e/browser/flows/` 가 아니라 여기 있는 이유: `browser-flows` 는 CI 에서
 * 동의 온보딩 스펙 하나만 돈다. flows 에 두면 실행되지 않는다.
 */

test.describe("시험 생성 — 문항 유형별 배점 표시", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("문항을 추가하기 전에는 비중 표시가 없다", async ({ instructorPage }) => {
    await instructorPage.goto("/instructor/new");

    await expect(instructorPage.getByText(/최종 점수 비중/)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });
    // 나눌 유형이 없으면 비율을 말할 수 없다.
    await expect(instructorPage.getByText(/최종 점수의 약 \d/)).toHaveCount(0);
  });

  test("유형이 하나면 슬라이더 값과 무관하게 최종 점수의 100%다", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    await createExam.addQuestion("multiple-choice");

    // 이게 정규화의 핵심이다. weight 가 얼마든 유일한 유형은 100% 를 가진다.
    // 옛 산식(weight / count)이었다면 weight 값에 따라 다른 숫자가 나온다.
    await expect(instructorPage.getByText(/최종 점수의 약 100%/)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });
  });

  test("합계가 100이 아닌 가중치에서도 문항당 점수가 정규화된다", async ({
    instructorPage,
  }) => {
    // 이 테스트가 이 파일의 핵심이다.
    //
    // 기본 가중치는 합이 100 이라 옛 산식(weight / count)과 새 산식이 같은
    // 값을 낸다. 그래서 기본값만 쓰면 회귀를 구분할 수 없다. 30/20(합 50)으로
    // 바꾸면 갈린다:
    //   옛 산식: 문항당 30점 / 20점
    //   새 산식: 문항당 60점 / 40점  (30/50 = 60%, 20/50 = 40%)
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    await createExam.addQuestion("multiple-choice");
    await createExam.addQuestion("true-false");

    const mcqInput = instructorPage.getByLabel(/사지선다 비중/);
    const oxInput = instructorPage.getByLabel(/O\/X 비중/);
    await expect(mcqInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    await mcqInput.fill("30");
    await oxInput.fill("20");

    // 정규화된 비율
    await expect(instructorPage.getByText(/최종 점수의 약 60%/)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });
    await expect(instructorPage.getByText(/최종 점수의 약 40%/)).toBeVisible();

    // 문항당 점수 — 여기가 wrapper 배선을 지키는 지점이다.
    // 옛 산식이면 30점/20점이 보인다.
    await expect(
      instructorPage.getByText(/문항당 약 60점/)
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(instructorPage.getByText(/문항당 약 40점/)).toBeVisible();
    await expect(instructorPage.getByText(/문항당 약 30점/)).toHaveCount(0);
  });
});
