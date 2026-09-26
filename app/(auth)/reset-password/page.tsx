import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import {
  PASSWORD_RESET_COOKIE,
  bindingFromClaims,
  matchesPasswordResetBinding,
  readPasswordResetIntent,
} from "@/lib/password-reset-intent";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * 새 비밀번호 설정 화면 (이슈 #318).
 *
 * 폼을 보여줄지 **서버가** 정한다. 검증된 세션(`getClaims`)이 의도 쿠키에 적힌
 * `(user_id, session_id)` 와 같을 때만 — 즉 복구 링크 확인이 만든 바로 그
 * 세션일 때만 폼이 나온다. 예전에는 브라우저가 `getSession()` 으로 "세션이
 * 있는가" 만 봤고, 로그인한 누구에게나 폼이 열렸다.
 *
 * 저장(`POST /api/auth/password-reset/complete`)이 같은 대조를 다시 한다. 이
 * 화면의 판단은 "다 입력한 뒤에야 실패" 를 막는 안내일 뿐, 문은 저장 쪽이다.
 */
export default async function Page() {
  // 재설정이 닫힌 환경에서는 없는 화면이다. lib/password-reset-availability.ts 참조.
  if (!isPasswordResetEnabled()) notFound();

  const email = await recoveryEmail();
  if (email !== null) return <ResetPasswordForm email={email} />;

  const t = await getTranslations("auth.resetPassword");
  return (
    <AuthPageShell logoAlt={t("logoAlt")}>
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-foreground dark:text-white">
          {t("linkInvalidTitle")}
        </h1>
        <p className="text-muted-foreground">{t("linkInvalidBody")}</p>
        <Button asChild className="w-full min-h-[44px]">
          <Link href="/forgot-password">{t("requestAgain")}</Link>
        </Button>
      </div>
    </AuthPageShell>
  );
}

/** 복구 세션이면 그 계정의 이메일, 아니면 null. 모르면 null 이다. */
async function recoveryEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          // 서버 컴포넌트는 쿠키를 쓸 수 없다(쓰면 던진다). 세션 갱신은 이
          // 요청 앞의 proxy 가 이미 했다 — 여기서는 읽기만 한다.
          setAll: () => {},
        },
      }
    );

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;

    const intent = readPasswordResetIntent(cookieStore.get(PASSWORD_RESET_COOKIE)?.value);
    if (!matchesPasswordResetBinding(intent, bindingFromClaims(data.claims))) return null;

    // 폼 안내 문구와 비밀번호 관리자에 넘길 계정. 없으면 빈 값으로 둔다.
    return typeof data.claims.email === "string" ? data.claims.email : "";
  } catch {
    return null;
  }
}
