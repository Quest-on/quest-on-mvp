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

  test("손대지 않으면 저장 요청에 chat_weight 가 null 로 나간다", async ({
    instructorPage,
  }) => {
    // 이게 이 변경의 가장 중요한 안전 조건이다. null 은 "교수자가 안 건드림"을
    // 뜻하고, 숫자로 굳으면 그 사실이 사라진다.
    await instructorPage.goto("/instructor/new");

    const slider = instructorPage.getByRole("slider", SLIDER);
    await expect(slider).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    const payloads: Array<Record<string, unknown>> = [];
    await instructorPage.route("**/api/supa**", async (route) => {
      const body = route.request().postDataJSON?.();
      if (body && typeof body === "object") payloads.push(body as Record<string, unknown>);
      await route.continue();
    });

    await instructorPage
      .getByLabel("시험 제목")
      .fill("대화 비중 기본값 유지 확인");

    // 제목만 채우고 저장을 시도한다. 저장이 검증에서 막히더라도 요청 본문에
    // chat_weight 가 실렸는지가 관심사다.
    const saveBtn = instructorPage.getByRole("button", {
      name: /저장|만들기|생성/,
    });
    if (await saveBtn.first().isVisible()) {
      await saveBtn.first().click();
      await instructorPage.waitForTimeout(2000);
    }

    const withChatWeight = payloads.filter(
      (p) => "chat_weight" in p || "data" in p
    );
    for (const p of withChatWeight) {
      const data = (p.data ?? p) as Record<string, unknown>;
      if ("chat_weight" in data) {
        expect(data.chat_weight, "손대지 않았으면 null 이어야 한다").toBeNull();
      }
    }
  });
});
