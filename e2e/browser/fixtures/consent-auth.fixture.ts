import { test as base, type Page, type APIRequestContext } from "@playwright/test";
import { assertLocalTestEnv } from "../../helpers/assert-local-test-env";
import { getTestSupabase } from "../../helpers/supabase-test-client";

/**
 * 동의 흐름 전용 실제 인증 fixture.
 *
 * 쿠키를 직접 주입하지 않는다. 그렇게 하면 `app/auth/callback` 의 코드 교환과
 * 온보딩 리다이렉트가 통째로 검증되지 않아, 정작 이번에 바꾼 경로가 테스트를
 * 안 거치게 된다.
 *
 * 두 경로를 모두 준비한다:
 *   · 이메일 — 실제 UI 가입 → Mailpit 확인 링크 → PKCE callback
 *   · OAuth  — 실제 Google 버튼 → 로컬 OIDC stub → GoTrue/app callback
 *
 * 로컬 Supabase 에서만 동작한다. 세 조건을 먼저 강제한다.
 */

/** 로컬 Supabase 가 띄우는 메일 캐처. */
const INBUCKET_URL = process.env.INBUCKET_URL ?? "http://127.0.0.1:54324";

export interface ConsentAuthFixtures {
  /** 온보딩을 마치지 않은 신규 사용자로 로그인된 페이지. */
  freshUserPage: Page;
  /** 이 테스트가 만든 사용자 id. */
  freshUserId: string;
  /** UI 가입과 이메일 확인 링크를 실제로 소비해 세션을 만든다. */
  signUpViaEmailLink: (page: Page) => Promise<void>;
  /** Google 버튼에서 로컬 OIDC stub을 거쳐 실제 callback 세션을 만든다. */
  signUpViaGoogleOAuthStub: (page: Page) => Promise<void>;
}

function uniqueEmail(): string {
  return `consent-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function deleteAuthUserByEmail(email: string): Promise<void> {
  const supabase = getTestSupabase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`test user lookup failed: ${error.message}`);

  const user = data.users.find((candidate) => candidate.email === email);
  if (user) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(`test user cleanup failed: ${deleteError.message}`);
  }
}

/** Mailpit 에서 해당 주소로 온 가장 최근 메일의 본문을 꺼낸다. */
async function latestMailpitBody(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const deadline = Date.now() + 10_000;

  // Supabase CLI 2.x 는 예전 Inbucket 대신 Mailpit 을 띄운다. API 는
  // `/api/v1/messages` 와 `/api/v1/message/:id` 이다. 메일 발송과 반영은
  // 비동기이므로 해당 수신자가 나타날 때까지 짧게 polling 한다.
  while (Date.now() < deadline) {
    const listRes = await request.get(`${INBUCKET_URL}/api/v1/messages`);
    if (!listRes.ok()) {
      throw new Error(`Mailpit messages unavailable: ${listRes.status()}`);
    }

    const list = (await listRes.json()) as {
      messages?: Array<{
        ID: string;
        To?: Array<{ Address?: string }>;
      }>;
    };
    const message = list.messages?.find((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    );

    if (message) {
      const msgRes = await request.get(`${INBUCKET_URL}/api/v1/message/${message.ID}`);
      if (!msgRes.ok()) {
        throw new Error(`Mailpit message unavailable: ${msgRes.status()}`);
      }
      const msg = (await msgRes.json()) as { Text?: string; HTML?: string };
      // Text 본문은 쿼리 구분자가 그대로 `&` 이다. HTML 을 먼저 쓰면
      // `&amp;` 를 URL 일부로 넘겨 verify 가 token 하나만 읽게 된다.
      return msg.Text ?? msg.HTML ?? "";
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("no confirmation mail arrived within 10s");
}

/** 메일 본문에서 확인 링크를 뽑는다. */
function extractLink(body: string): string {
  const match = body.match(/https?:\/\/[^\s"'<>]+/);
  if (!match) throw new Error("confirmation link not found in mail body");
  return match[0];
}

export const test = base.extend<ConsentAuthFixtures>({
  freshUserId: async ({}, use) => {
    assertLocalTestEnv();

    const supabase = getTestSupabase();
    const email = uniqueEmail();
    const password = `Pw-${Math.random().toString(36).slice(2)}-1A!`;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`test user creation failed: ${error?.message}`);
    }

    process.env.__CONSENT_E2E_EMAIL = email;
    process.env.__CONSENT_E2E_PASSWORD = password;

    await use(data.user.id);

    // 남기면 다음 실행의 미완료 계정 purge 후보가 된다.
    await supabase.auth.admin.deleteUser(data.user.id);
    delete process.env.__CONSENT_E2E_EMAIL;
    delete process.env.__CONSENT_E2E_PASSWORD;
  },

  signUpViaEmailLink: async ({ request }, use) => {
    assertLocalTestEnv();
    const email = uniqueEmail();
    const password = `Pw-${Math.random().toString(36).slice(2)}-1A!`;

    await use(async (page: Page) => {
      const requestFailures: string[] = [];
      page.on("requestfailed", (request) => {
        requestFailures.push(
          `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`,
        );
      });
      // 실제 사용자가 타는 UI sign-up 경로에서 PKCE verifier를 브라우저에
      // 만들고, Mailpit 확인 링크를 같은 context에서 소비한다.
      // 실제 auth 버튼은 React handler가 붙은 뒤 눌러야 한다. dev server에서
      // DOMContentLoaded 직후 클릭하면 빈 state로 signUp이 호출돼 flake한다.
      await page.goto("/sign-up", { waitUntil: "networkidle" });
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click('form button[type="submit"]');
      try {
        await page.waitForSelector("#otp", { state: "visible", timeout: 10_000 });
      } catch {
        const visibleError = await page.locator("p.text-destructive").textContent().catch(() => null);
        throw new Error(
          `UI sign-up did not reach verification. error=${visibleError ?? "none"}; ` +
            `requestFailures=${requestFailures.join(" | ") || "none"}`,
        );
      }

      const body = await latestMailpitBody(request, email);
      await page.goto(extractLink(body), { waitUntil: "networkidle" });
      await page.waitForURL(/\/onboarding(?:\?|$)/, { timeout: 15_000 });
    });

    await deleteAuthUserByEmail(email);
  },

  signUpViaGoogleOAuthStub: async ({}, use) => {
    assertLocalTestEnv();
    const email = "consent-google-e2e@example.test";
    await deleteAuthUserByEmail(email);

    await use(async (page: Page) => {
      let sawGoogleAuthorize = false;
      const oauthEvents: string[] = [];
      page.on("requestfailed", (request) => {
        const url = new URL(request.url());
        oauthEvents.push(`FAILED ${url.origin}${url.pathname} ${request.failure()?.errorText ?? ""}`);
      });
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.pathname.includes("/auth/") || url.pathname.includes("/oauth/")) {
          oauthEvents.push(`${response.status()} ${url.origin}${url.pathname}`);
        }
      });

      // GoTrue built-in Google issuer는 override 불가다. 로컬에서만 실제
      // Google 버튼의 authorize 요청을 configurable OIDC adapter로 바꾼다.
      // PKCE query와 redirect_to는 그대로 보존한다.
      // GoTrue 컨테이너는 host.docker.internal 로 mock server를 보지만,
      // Windows Chromium은 그 호스트명을 해석하지 못한다. 브라우저가 provider
      // authorize 화면으로 갈 때만 같은 서버의 127.0.0.1 주소로 바꾼다.
      // 로그인 화면은 /auth/v1/settings 를 읽어 꺼진 provider 버튼을 잠근다.
      // 로컬 스택은 스텁을 keycloak 으로 등록해서 google: false 를 돌려주는데,
      // 이 흐름에서는 아래 authorize 인터셉트 덕분에 Google 가입이 실제로
      // 동작한다. 설정 응답만 사실과 어긋나서 버튼이 잠기고 클릭이 30초
      // 타임아웃으로 죽는다.
      //
      // authorize 를 이미 스텁하고 있으니 설정도 같은 사실을 말하게 맞춘다.
      await page.route("**/auth/v1/settings**", async (route) => {
        const res = await route.fetch();
        const body = await res.json().catch(() => null);
        if (!body?.external) {
          await route.continue();
          return;
        }
        await route.fulfill({
          response: res,
          json: { ...body, external: { ...body.external, google: true } },
        });
      });

      await page.route("**/oauth/keycloak/**", async (route) => {
        const url = new URL(route.request().url());
        url.hostname = "127.0.0.1";
        await route.continue({ url: url.toString() });
      });

      await page.route("**/auth/v1/authorize**", async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("provider") !== "google") {
          await route.continue();
          return;
        }

        sawGoogleAuthorize = true;
        const redirectTo = url.searchParams.get("redirect_to") ?? "";
        if (!redirectTo.includes("/auth/callback")) {
          throw new Error("Google authorize request lost the app callback redirect");
        }
        url.searchParams.set("provider", "keycloak");
        await route.continue({ url: url.toString() });
      });

      await page.goto("/sign-up", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Google/i }).click();
      try {
        await page.waitForURL(/\/onboarding(?:\?|$)/, { timeout: 20_000 });
      } catch {
        throw new Error(
          `Google OAuth stub did not return to onboarding; url=${page.url()}; ` +
            `events=${oauthEvents.join(" | ") || "none"}`,
        );
      }

      if (!sawGoogleAuthorize) {
        throw new Error("Google button did not initiate a GoTrue authorize request");
      }
    });

    await deleteAuthUserByEmail(email);
  },

  freshUserPage: async ({ page, freshUserId }, use) => {
    void freshUserId;

    const email = process.env.__CONSENT_E2E_EMAIL!;
    const password = process.env.__CONSENT_E2E_PASSWORD!;

    // 기본 경로는 UI 로그인이다. 쿠키 주입이 아니라 실제 세션 수립이다.
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    await use(page);
  },
});

export { expect } from "@playwright/test";
