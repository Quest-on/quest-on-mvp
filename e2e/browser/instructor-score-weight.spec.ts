import { test, expect } from "./fixtures/auth-browser.fixture";
import { cleanupTestData } from "./helpers/test-data-builder";
import { TIMEOUTS } from "../constants";

/**
 * 문항 유형별 배점 — 화면이 실제로 무엇을 보여주는가
 *
 * 유닛 테스트(`__tests__/score-weight-display.test.ts`)는 산식을 **복제**한다.
 * 이 저장소의 vitest 는 `environment: "node"` 라 컴포넌트를 렌더할 수 없기
 * 때문이다. 그래서 컴포넌트의 `getPerQuestionScore` 를 되돌려도 그 테스트는
 * 모른다.
 *
 * 이 파일이 그 구멍을 일부 메운다. 실제로 렌더된 화면 상태를 읽는다.
 *
 * 주의: 배점 버킷은 객관식/참거짓/사례 셋뿐이다(lib/grade-utils.ts
 * scoreBucketForQuestionType). 서술형만 있는 시험에는 유형별 배점 UI 가
 * 나타나지 않는다. 유형별 숫자 검증은 객관식 문항을 실제로 만들어야 하는데,
 * 그 시딩은 이 스펙의 범위를 넘어 별도 픽스처가 필요하다.
 *
 * `e2e/browser/flows/` 가 아니라 여기 있는 이유: `browser-flows` 는 CI 에서
 * 동의 온보딩 스펙 하나만 돈다. flows 에 두면 실행되지 않는다.
 */

test.describe("시험 생성 — 문항 유형별 배점 표시", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("배점 비중 영역이 문항을 추가하기 전에는 비어 있다", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");

    // 문항이 없으면 유형별 배점을 나눌 대상이 없다.
    await expect(
      instructorPage.getByText(/최종 점수 비중/)
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(instructorPage.getByText(/최종 점수의 \d/)).toHaveCount(0);
  });

});
