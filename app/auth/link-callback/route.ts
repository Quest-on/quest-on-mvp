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
 * 순서가 중요하다:
 * 1. **의도 쿠키를 먼저 본다.** 없으면 code 교환도 하지 않는다 — 교환부터 하면
 *    이 URL 을 로그인 우회로로 쓸 수 있다.
 * 2. **교환 전에 현재 세션이 의도를 만든 사용자인지 대조한다.** 링크는 로그인된
 *    사용자만 시작하므로 콜백 시점에 그 사용자가 아니면 교환할 이유가 없다.
 * 3. 교환 뒤 세션 사용자를 다시 대조한다. `exchangeCodeForSession` 은 성공하면
 *    쿠키를 **code 소유자의 세션으로 덮어쓴다.** 다른 사람의 code 였다면 여기서
 *    잡히는데, 그냥 302 만 주면 덮어쓴 쿠키가 응답에 실려 나가 피해자 브라우저가
 *    공격자 계정으로 로그인된다(세션 고정의 역방향). 그래서 실패 경로는 **반드시
 *    signOut 해서 바뀜 세션을 끊는다.** 독립 red-team 이 잡은 구멍.
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

  // (2) 교환 전: 지금 로그인된 사람이 의도를 만든 사람인가.
  const before = await supabase.auth.getUser();
  const beforeId = before.data?.user?.id;
  if (before.error || !beforeId || !safeEqual(beforeId, intent.userId)) {
    clearIntent(cookieStore);
    return fail();
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  // (3) 교환 후: 세션이 여전히 같은 사람인가. 다르면 남의 code 였다 — 바뀜 세션을
  // 끊지 않으면 피해자가 공격자 계정으로 로그인된 채 돌아간다.
  const after = await supabase.auth.getUser();
  const afterId = after.data?.user?.id;
  if (after.error || !afterId || !safeEqual(afterId, intent.userId)) {
    await supabase.auth.signOut();
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
