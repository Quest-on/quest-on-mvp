import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { RECOVERY_TOKEN_HASH_PATTERN } from "@/lib/password-reset-intent";

/**
 * 복구 링크 확인 화면 (이슈 #318).
 *
 * 메일 링크(`/auth/recovery?token_hash=…&type=recovery`)가 여기로 온다. 이
 * 화면은 **토큰을 쓰지 않는다.** 버튼이 `POST /api/auth/password-reset/verify`
 * 로 폼을 보내고, 거기서 서버가 확인한다.
 *
 * 메일 보안 스캐너는 링크를 미리 열어 본다. 링크를 여는 것만으로 1회용 토큰이
 * 타면 사람이 누를 때는 이미 "만료된 링크" 다. 스캐너는 버튼을 누르지 않는다.
 *
 * 폼은 JS 없이 동작하는 기본 제출이다 — 응답이 303 이라 브라우저가 따라가며
 * 쿠키를 받는다. fetch 로 보내면 리다이렉트와 쿠키 처리를 손으로 다시 짜야 한다.
 */

export const metadata: Metadata = {
  // 주소에 1회용 토큰이 있다. 이 화면에서 나가는 요청에 실리면 안 된다.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  // 재설정이 닫힌 환경에서는 없는 화면이다. lib/password-reset-availability.ts 참조.
  if (!isPasswordResetEnabled()) notFound();

  const params = await searchParams;
  const tokenHash = single(params.token_hash);
  const type = single(params.type);
  const error = single(params.error);
  const t = await getTranslations("auth.recovery");

  const usable =
    tokenHash !== undefined &&
    RECOVERY_TOKEN_HASH_PATTERN.test(tokenHash) &&
    type === "recovery" &&
    error !== "invalid_link";

  if (!usable) {
    return (
      <AuthPageShell logoAlt={t("logoAlt")}>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground dark:text-white">
            {t("invalidTitle")}
          </h1>
          <p className="text-muted-foreground">{t("invalidBody")}</p>
          <Button asChild className="w-full min-h-[44px]">
            <Link href="/forgot-password">{t("requestAgain")}</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell logoAlt={t("logoAlt")}>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground dark:text-white">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>

      <form method="post" action="/api/auth/password-reset/verify" className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value="recovery" />
        {error === "rate_limited" && (
          <p className="text-sm text-destructive" role="alert">
            {t("rateLimited")}
          </p>
        )}
        <Button type="submit" className="w-full min-h-[44px]" size="lg">
          <span className="font-bold">{t("confirmBtn")}</span>
        </Button>
      </form>
    </AuthPageShell>
  );
}
