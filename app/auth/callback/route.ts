import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import { PASSWORD_RESET_PATH } from "@/lib/password-reset-intent";

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
      const onboardingUrl = new URL("/onboarding", origin);
      // 비밀번호 재설정은 이 콜백을 지나지 않는다 (#318) — 메일 링크는
      // `/auth/recovery` 로 가고 거기서 서버가 직접 토큰을 확인한다.
      //
      // 예전에는 여기서 `next=/reset-password` 를 보고 복구로 분기했는데, 그건
      // 사용자가 붙일 수 있는 값이라 평범한 OAuth 로그인에 붙이면 필수 동의
      // 게이트가 열렸다(#456). 이제 이 경로로 그 화면을 목적지로 이어 주지 않는다.
      if (next && next !== PASSWORD_RESET_PATH) {
        onboardingUrl.searchParams.set("redirect", next);
      }
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", origin));
}
