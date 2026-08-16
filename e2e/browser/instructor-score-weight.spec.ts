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

  test("두 유형이면 비율의 합이 100%가 된다", async ({ instructorPage }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    await createExam.addQuestion("multiple-choice");
    await createExam.addQuestion("true-false");

    // 기본 가중치가 균등하므로 각각 50% 다. 두 줄이 보여야 한다.
    const shares = instructorPage.getByText(/최종 점수의 약 \d+(\.\d+)?%/);
    await expect(shares).toHaveCount(2, { timeout: TIMEOUTS.PAGE_LOAD });

    const texts = await shares.allTextContents();
    const values = texts.map((t) =>
      Number(t.replace(/[^\d.]/g, ""))
    );
    const sum = values.reduce((a, b) => a + b, 0);

    // 반올림 때문에 정확히 100 이 아닐 수 있어 여유를 둔다.
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThan(101);
  });
});
