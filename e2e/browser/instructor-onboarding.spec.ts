import { test, expect } from "./fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/seed";
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

  await page.locator("#age-over-14").click();
  await page.locator("#terms").click();
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
});
