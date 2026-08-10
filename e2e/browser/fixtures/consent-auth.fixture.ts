import { test as base, type Page } from "@playwright/test";
import { assertLocalTestEnv } from "../../helpers/assert-local-test-env";
import { getTestSupabase } from "../../helpers/supabase-test-client";

/**
 * 동의 흐름 전용 실제 인증 fixture.
 *
 * 쿠키를 직접 주입하지 않는다. 그렇게 하면 `app/auth/callback` 의 코드 교환과
 * 온보딩 리다이렉트가 통째로 검증되지 않아, 정작 우리가 바꾼 경로가 테스트를
 * 안 거치게 된다. 실제 GoTrue 를 거쳐 세션을 만든다.
 *
 * 로컬 Supabase 에서만 동작한다 — 세 조건을 먼저 강제한다.
 */

export interface ConsentAuthFixtures {
  /** 방금 만들어진, 아직 온보딩을 마치지 않은 사용자로 로그인된 페이지. */
  freshUserPage: Page;
  /** 이 테스트가 만든 사용자 id. cleanup 에 쓴다. */
  freshUserId: string;
}

function uniqueEmail(): string {
  return `consent-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export const test = base.extend<ConsentAuthFixtures>({
  freshUserId: async ({}, use) => {
    assertLocalTestEnv();

    const supabase = getTestSupabase();
    const email = uniqueEmail();
    const password = `Pw-${Math.random().toString(36).slice(2)}-1A!`;

    // admin API 로 계정을 만들되 확인 상태로 둔다. 이메일 왕복은
    // 로컬 Inbucket 의존성을 만들어 CI 를 불안정하게 한다.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`test user creation failed: ${error?.message}`);
    }

    // 비밀번호를 이후 로그인 단계에서 쓴다.
    process.env.__CONSENT_E2E_EMAIL = email;
    process.env.__CONSENT_E2E_PASSWORD = password;

    await use(data.user.id);

    // 남기면 다음 실행의 미완료 계정 purge 후보가 된다.
    await supabase.auth.admin.deleteUser(data.user.id);
    delete process.env.__CONSENT_E2E_EMAIL;
    delete process.env.__CONSENT_E2E_PASSWORD;
  },

  freshUserPage: async ({ page, freshUserId }, use) => {
    void freshUserId;

    const email = process.env.__CONSENT_E2E_EMAIL!;
    const password = process.env.__CONSENT_E2E_PASSWORD!;

    // UI 를 통해 로그인한다. 쿠키 주입이 아니라 실제 세션 수립이다.
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    await use(page);
  },
});

export { expect } from "@playwright/test";
