import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildCallbackRedirectUrl } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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
      // next 는 사용자가 URL 로 넣는 값이다. 문자열 결합하면 next=@evil.com 이
      // 호스트를 바꿔치기해 로그인 성공 직후 외부로 튕긴다 (이슈 #99).
      return NextResponse.redirect(buildCallbackRedirectUrl(origin, next));
    }
  }

  return NextResponse.redirect(
    buildCallbackRedirectUrl(origin, "/sign-in?error=auth_callback_failed")
  );
}
