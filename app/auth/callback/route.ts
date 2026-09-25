import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import {
  PASSWORD_RESET_PATH,
  isRecoverySession,
  passwordResetIntentCookie,
} from "@/lib/password-reset-intent";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";

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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 비밀번호 재설정만 온보딩을 거치지 않는다 (#318).
      //
      // 복구 링크를 누른 사람은 "비밀번호를 바꾸러" 온 것이다. 이 콜백이 무조건
      // /onboarding 으로 보내면 필수 동의가 남은 사용자는 비밀번호를 바꾸기 전에
      // 동의 화면에 갇히고, 그 상태로 탭을 닫으면 **로그인은 된 채 잊어버린
      // 비밀번호는 그대로** 남는다.
      //
      // 판정 근거가 `next` 값이면 안 된다 (이슈 #456). 그건 사용자가 붙일 수
      // 있는 값이라, 평범한 OAuth 로그인에 붙이면 동의 게이트가 그대로 열렸다.
      // **교환된 세션이 실제 복구 세션인지**를 본다.
      //
      // 그리고 그 사실을 HttpOnly 의도 쿠키로 남긴다 — `/reset-password` 가
      // "로그인했는가" 가 아니라 "복구로 왔는가" 로 문을 열 수 있게.
      if (
        isPasswordResetEnabled() &&
        next === PASSWORD_RESET_PATH &&
        isRecoverySession(data.session?.access_token)
      ) {
        const intent = passwordResetIntentCookie(
          new URL(request.url).protocol === "https:"
        );
        cookieStore.set(intent.name, intent.value, intent.options);
        return NextResponse.redirect(new URL(PASSWORD_RESET_PATH, origin));
      }

      const onboardingUrl = new URL("/onboarding", origin);
      // 재설정이 닫혀 있으면 그 화면을 목적지로 이어 주지 않는다 — 404 로 끝난다.
      if (next && !(next === PASSWORD_RESET_PATH && !isPasswordResetEnabled())) {
        onboardingUrl.searchParams.set("redirect", next);
      }
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", origin));
}
