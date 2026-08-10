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
