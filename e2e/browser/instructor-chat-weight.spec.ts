import { test, expect } from "./fixtures/auth-browser.fixture";
import { cleanupTestData } from "./helpers/test-data-builder";
import { TIMEOUTS } from "../constants";

/**
 * 대화 비중 슬라이더 — 행동 검증
 *
 * 유닛 테스트는 이 화면의 동작을 증명할 수 없다(vitest 가 node 환경이고 React
 * 렌더 인프라가 없다). 그래서 실제 사용자 경로는 전부 여기서 본다.
 *
 * 이 파일이 `e2e/browser/flows/` 가 아니라 `e2e/browser/` 에 있는 이유:
 * `browser-flows` 프로젝트는 CI 에서 동의 온보딩 스펙 하나만 돈다. flows 에
 * 두면 CI 가 이 테스트를 실행하지 않아 초록불이 아무것도 보증하지 않는다.
 *
 * 저장 계약(손대지 않으면 chat_weight 가 null)은 여기서 검증하지 않는다.
 * 브라우저에서는 요청 본문까지만 볼 수 있어서, handler 를 다시 `?? 50` 으로
 * 되돌려도 통과해버린다. 실제로 고친 경계는 insert 값이므로
 * `__tests__/chat-weight-persistence.test.ts` 가 그걸 직접 지킨다.
 */

const SLIDER = { name: /채점 비중|Grading Weight/ };
const RESET = { name: /^기본값$|^Reset$/ };

test.describe("시험 생성 — 대화 비중 슬라이더", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("클릭 없이 바로 조작할 수 있다", async ({ instructorPage }) => {
    // 예전에는 "조정" -> "직접 설정" 스위치를 거쳐야 슬라이더가 나타났다.
    // 둘 다 아무 값도 정하지 않는 순수 UI 개폐 동작이었다.
    await instructorPage.goto("/instructor/new");

    const slider = instructorPage.getByRole("slider", SLIDER);
    await expect(slider).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 접근성 이름이 실제 role=slider 요소에 붙어 있어야 한다.
    // Radix 는 role 을 Thumb 에 두므로 Root 에만 붙이면 이름이 사라진다.
    await expect(slider).toHaveAttribute("aria-valuenow", "50");

    // 게이트가 되살아나면 클릭 비용이 돌아온 것이다.
    await expect(
      instructorPage.getByRole("button", { name: /^조정$/ })
    ).toHaveCount(0);
    await expect(instructorPage.getByRole("switch", { name: /직접 설정/ })).toHaveCount(0);
  });

  test("키보드로 값을 바꾸면 표시와 aria 값이 함께 따라온다", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");

    const slider = instructorPage.getByRole("slider", SLIDER);
    await expect(slider).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(instructorPage.getByText(/대화 50% *\/ *최종 답안 50%/)).toBeVisible();

    await slider.focus();
    await instructorPage.keyboard.press("ArrowRight");

    // step=10 이므로 한 칸에 60 이 된다.
    await expect(slider).toHaveAttribute("aria-valuenow", "60");
    await expect(instructorPage.getByText(/대화 60% *\/ *최종 답안 40%/)).toBeVisible();
  });

  test("기본값 버튼은 값을 바꾼 뒤에만 나타나고 눌러야 사라진다", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");

    const slider = instructorPage.getByRole("slider", SLIDER);
    await expect(slider).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 손대지 않은 상태에서는 되돌릴 것이 없다.
    await expect(instructorPage.getByRole("button", RESET)).toHaveCount(0);

    await slider.focus();
    await instructorPage.keyboard.press("ArrowRight");
    await expect(instructorPage.getByRole("button", RESET)).toBeVisible();

    await instructorPage.getByRole("button", RESET).click();

    // 되돌리면 버튼이 사라지고(= chatWeight 가 null) 값도 50 으로 복귀한다.
    await expect(instructorPage.getByRole("button", RESET)).toHaveCount(0);
    await expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  test("기본값으로 되돌린 뒤 포커스가 슬라이더로 돌아온다", async ({
    instructorPage,
  }) => {
    // Reset 은 클릭 즉시 자기 자신을 화면에서 지운다. 포커스를 넘기지 않으면
    // 키보드/스크린리더 사용자가 문서 끝으로 튕긴다.
    await instructorPage.goto("/instructor/new");

    const slider = instructorPage.getByRole("slider", SLIDER);
    await expect(slider).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    await slider.focus();
    await instructorPage.keyboard.press("ArrowRight");
    await instructorPage.getByRole("button", RESET).click();

    await expect(slider).toBeFocused();
  });

});
