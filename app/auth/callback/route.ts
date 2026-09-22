import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";

/**
 * 세션 교환 뒤 온보딩을 거치지 않고 곧장 보낼 경로.
 *
 * 온보딩은 필수 동의를 강제하는 게이트다. 그 게이트를 지나치는 예외는
 * "동의보다 먼저 끝내야 하는 계정 복구" 뿐이다. 편의를 위해 넓히지 않는다.
 */
const NEXT_PATHS_SKIPPING_ONBOARDING: readonly string[] = ["/reset-password"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
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
    if (!error) {
      // 비밀번호 재설정은 온보딩을 거치지 않는다 (#318).
      //
      // 복구 링크를 누른 사람은 "비밀번호를 바꾸러" 온 것이다. 그런데 이 콜백은
      // 무조건 /onboarding 으로 보내므로, 필수 동의가 남아 있으면 비밀번호를
      // 바꾸기 전에 동의 화면에 갇힌다. 더 나쁜 건 그 상태로 탭을 닫는 경우다 —
      // 복구 링크는 이미 세션을 만들었으므로 **로그인은 된 채, 잊어버린 비밀번호는
      // 그대로** 남는다. 사용자는 다음에 또 못 들어온다.
      //
      // 그래서 온보딩을 건너뛸 경로를 명시적으로 열거한다. `next` 는 이미
      // safeInternalPath 를 통과한 내부 경로지만, 여기서 다시 정확히 일치하는
      // 것만 받는다 — 온보딩 게이트를 우회하는 문이므로 넓히지 않는다.
      if (next && NEXT_PATHS_SKIPPING_ONBOARDING.includes(next)) {
        return NextResponse.redirect(new URL(next, origin));
      }

      const onboardingUrl = new URL("/onboarding", origin);
      if (next) onboardingUrl.searchParams.set("redirect", next);
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", origin));
}
