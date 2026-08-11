import { test as base, type Page, type APIRequestContext } from "@playwright/test";
import { assertLocalTestEnv } from "../../helpers/assert-local-test-env";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import { createClient } from "@supabase/supabase-js";

/**
 * 동의 흐름 전용 실제 인증 fixture.
 *
 * 쿠키를 직접 주입하지 않는다. 그렇게 하면 `app/auth/callback` 의 코드 교환과
 * 온보딩 리다이렉트가 통째로 검증되지 않아, 정작 이번에 바꾼 경로가 테스트를
 * 안 거치게 된다.
 *
 * 두 경로를 모두 준비한다:
 *   · 이메일 — 로컬 Inbucket 에서 확인 링크를 꺼내 실제 GoTrue 왕복을 탄다
 *   · OAuth  — admin `generateLink` 로 실제 one-time code 를 받아 callback 을 탄다
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
  /** 이메일 확인 링크를 실제로 소비해 세션을 만든다. */
  signInViaEmailLink: (page: Page) => Promise<void>;
  /** OAuth 처럼 one-time code 를 callback 에 넘겨 세션을 만든다. */
  signInViaCallbackCode: (page: Page) => Promise<void>;
}

function uniqueEmail(): string {
  return `consent-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Inbucket 에서 해당 주소로 온 가장 최근 메일의 본문을 꺼낸다. */
async function latestInbucketBody(
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

  signInViaEmailLink: async ({ request, freshUserId }, use) => {
    void freshUserId;
    const email = process.env.__CONSENT_E2E_EMAIL!;

    await use(async (page: Page) => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      // admin.generateLink 는 링크만 만들고 메일을 보내지 않는다. 실제
      // GoTrue → SMTP → Inbucket 경로를 타려면 OTP 요청을 사용해야 한다.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
      });
      if (error) throw new Error(`magiclink request failed: ${error.message}`);

      const body = await latestInbucketBody(request, email);
      await page.goto(extractLink(body), { waitUntil: "networkidle" });
    });
  },

  signInViaCallbackCode: async ({ freshUserId }, use) => {
    void freshUserId;
    const email = process.env.__CONSENT_E2E_EMAIL!;

    await use(async (page: Page) => {
      const supabase = getTestSupabase();
      // OAuth 도 결국 callback 에 one-time code 를 넘긴다. 그 마지막 구간을
      // 실제로 태워서 `app/auth/callback` 의 코드 교환과 리다이렉트를 검증한다.
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data?.properties?.hashed_token) {
        throw new Error(`callback code generation failed: ${error?.message}`);
      }

      const verifyUrl =
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify` +
        `?token=${data.properties.hashed_token}&type=magiclink` +
        `&redirect_to=${encodeURIComponent("http://localhost:3000/auth/callback")}`;

      await page.goto(verifyUrl, { waitUntil: "networkidle" });
    });
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
