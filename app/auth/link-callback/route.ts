import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  ACCOUNT_LINK_COOKIE,
  ACCOUNT_LINK_CALLBACK_PATH,
  parseIntent,
} from "@/lib/account-link-intent";

/**
 * 계정 연결 전용 콜백 (PR-2 / 스펙 f46, AC-16).
 *
 * `linkIdentity({ options: { redirectTo } })` 가 여기로 돌아온다. 기존
 * `/auth/callback` 은 성공한 code 를 무조건 `/onboarding` 으로 보내므로 연결에
 * 쓸 수 없다 — 연결 끝내고 신규 가입 온보딩으로 튕긴다.
 *
 * 순서가 중요하다: **의도 쿠키를 먼저 본다.** 쿠키가 없으면 code 교환도 하지
 * 않는다. 교환부터 하면 이 URL 을 그냥 로그인 우회로로 쓸 수 있다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const fail = () =>
    NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", origin));

  const cookieStore = await cookies();
  const intentCookie = cookieStore.get(ACCOUNT_LINK_COOKIE);
  const intent = intentCookie ? parseIntent(intentCookie.value) : null;
  if (!intent) return fail();

  const code = searchParams.get("code");
  if (!code) return fail();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  // 교환 뒤 세션 사용자가 의도를 만든 사용자여야 한다. 다르면 남의 code 를
  // 내 의도 쿠키에 붙인 것이다.
  const { data, error: userError } = await supabase.auth.getUser();
  const sessionUserId = data?.user?.id;
  if (userError || !sessionUserId || !safeEqual(sessionUserId, intent.userId)) {
    clearIntent(cookieStore);
    return fail();
  }

  // 1회 소비.
  clearIntent(cookieStore);

  const done = new URL("/settings", origin);
  done.searchParams.set("linked", intent.provider);
  return NextResponse.redirect(done);
}

function clearIntent(store: Awaited<ReturnType<typeof cookies>>) {
  store.set(ACCOUNT_LINK_COOKIE, "", { path: ACCOUNT_LINK_CALLBACK_PATH, maxAge: 0 });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
