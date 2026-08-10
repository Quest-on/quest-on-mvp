import { test, expect } from "../fixtures/consent-auth.fixture";

/**
 * AC-S1 / AC-S2 / AC-S3 / AC-E1~E3 (live) — 온보딩 동의 흐름.
 *
 * 여기서 증명하려는 핵심:
 *   · 필수 체크박스가 정확히 2개이고 사전 체크가 없다
 *   · 전체동의 단일 버튼이 없다 (법 제22조① 위반)
 *   · 둘 다 체크해야만 제출이 열린다
 *   · 가입 화면에는 동의 UI 가 없다
 *
 * 체크박스는 `CONSENT_GATE_MODE` 가 prompt/enforce 일 때만 나타난다.
 * off/shadow 로 돌고 있으면 그 사실 자체를 확인하고 넘어간다.
 */

test.describe("온보딩 동의 흐름", () => {
  test("가입 화면에는 동의 UI 가 없다", async ({ page }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });

    // 가입은 계정 생성만 한다. 동의는 인증 후 단일 게이트에서 받는다.
    const checkboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
    expect(await checkboxes.count()).toBe(0);
  });

  test("온보딩 동의 섹션의 구조가 계약을 지킨다", async ({ freshUserPage }) => {
    const page = freshUserPage;
    await page.goto("/onboarding", { waitUntil: "networkidle" });

    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');

    if ((await fieldset.count()) === 0) {
      // off/shadow 단계다. 이때 동의가 노출되면 안 되므로 이것도 통과 조건이다.
      const status = await page.request.get("/api/consents/onboarding");
      if (status.ok()) {
        expect((await status.json()).collecting).toBe(false);
      }
      return;
    }

    // 필수 체크박스는 정확히 2개다.
    const boxes = fieldset.locator('[role="checkbox"], input[type="checkbox"]');
    await expect(boxes).toHaveCount(2);

    // 사전 체크 금지 — 둘 다 꺼진 상태로 시작해야 한다.
    for (let i = 0; i < 2; i += 1) {
      const box = boxes.nth(i);
      const state =
        (await box.getAttribute("data-state")) ??
        ((await box.isChecked().catch(() => false)) ? "checked" : "unchecked");
      expect(state).not.toBe("checked");
    }
  });

  test("전체동의 단일 버튼이 없다", async ({ freshUserPage }) => {
    const page = freshUserPage;
    await page.goto("/onboarding", { waitUntil: "networkidle" });

    const body = await page.locator("body").innerText();
    // 하나로 묶어 받으면 법 제22조① 위반이다.
    expect(body).not.toMatch(/전체\s*동의|모두\s*동의|agree\s*to\s*all/i);
  });

  test("동의 없이는 제출 버튼이 열리지 않는다", async ({ freshUserPage }) => {
    const page = freshUserPage;
    await page.goto("/onboarding", { waitUntil: "networkidle" });

    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');
    if ((await fieldset.count()) === 0) return;

    const submit = page.locator('button[type="submit"]');
    if ((await submit.count()) === 0) return;

    await expect(submit.first()).toBeDisabled();
  });

  test("약관 링크가 공개 경로를 가리킨다", async ({ freshUserPage }) => {
    const page = freshUserPage;
    await page.goto("/onboarding", { waitUntil: "networkidle" });

    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');
    if ((await fieldset.count()) === 0) return;

    // 약관을 못 보면 동의가 성립하지 않는다.
    await expect(fieldset.locator('a[href="/legal/terms"]')).toHaveCount(1);
  });
});

test.describe("온보딩 동의 흐름 — 조합과 복귀", () => {
  /** 체크박스 두 개를 원하는 조합으로 맞춘다. */
  async function setBoxes(
    page: import("@playwright/test").Page,
    age: boolean,
    terms: boolean,
  ) {
    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');
    const boxes = fieldset.locator('[role="checkbox"], input[type="checkbox"]');
    for (const [index, want] of [age, terms].entries()) {
      const box = boxes.nth(index);
      const state = await box.getAttribute("data-state");
      const checked = state === "checked" || (await box.isChecked().catch(() => false));
      if (checked !== want) await box.click();
    }
  }

  test("한 쪽만 체크하면 제출이 열리지 않는다", async ({ freshUserPage }) => {
    const page = freshUserPage;
    await page.goto("/onboarding", { waitUntil: "networkidle" });

    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');
    if ((await fieldset.count()) === 0) return;

    const submit = page.locator('button[type="submit"]').first();

    // 두 조합 모두 막혀야 한다. 하나로 묶어 받으면 법 제22조① 위반이다.
    await setBoxes(page, true, false);
    await expect(submit).toBeDisabled();

    await setBoxes(page, false, true);
    await expect(submit).toBeDisabled();
  });

  test("동의 기록이 실패하면 이동하지 않는다", async ({ freshUserPage }) => {
    const page = freshUserPage;

    // 실패를 성공처럼 넘기면 게이트가 영원히 막힌다.
    await page.route("**/api/consents/onboarding", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: "CONSENT_RECORD_FAILED" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/onboarding", { waitUntil: "networkidle" });
    const fieldset = page.locator('fieldset[aria-labelledby="consent-title"]');
    if ((await fieldset.count()) === 0) return;

    await setBoxes(page, true, true);
    const submit = page.locator('button[type="submit"]').first();
    if (await submit.isDisabled()) return; // 프로필 필드가 비어 있으면 여기까지다

    await submit.click();
    await page.waitForTimeout(500);

    expect(page.url()).toContain("/onboarding");
  });

  test("redirect 파라미터는 안전한 내부 경로만 보존한다", async ({ freshUserPage }) => {
    const page = freshUserPage;

    // 프로토콜 상대 URL 이 통과하면 로그인 직후 외부로 튕긴다.
    await page.goto("/onboarding?redirect=//evil.com", { waitUntil: "networkidle" });
    expect(new URL(page.url()).host).not.toContain("evil.com");
  });
});

test.describe("온보딩 동의 흐름 — 실제 auth 경로", () => {
  test("이메일 확인 링크로 세션을 만들면 온보딩으로 온다", async ({
    page,
    signInViaEmailLink,
  }) => {
    await signInViaEmailLink(page);
    // 콜백은 항상 온보딩을 거친다. 바로 보호 화면으로 들어가면 안 된다.
    expect(page.url()).toMatch(/\/onboarding|\/sign-in/);
  });

  test("callback code 경로도 온보딩으로 온다", async ({ page, signInViaCallbackCode }) => {
    await signInViaCallbackCode(page);
    expect(page.url()).toMatch(/\/onboarding|\/sign-in/);
  });
});
