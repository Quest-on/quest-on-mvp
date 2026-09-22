"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";
import { createSupabaseClient } from "@/lib/supabase-client";
import {
  PASSWORD_MIN_LENGTH,
  validatePasswordPair,
} from "@/lib/password-policy";

type SessionState = "checking" | "ready" | "missing";

/**
 * 새 비밀번호 설정 화면 (#318).
 *
 * 복구 링크 → `/auth/v1/verify` → `/auth/callback?code=…&next=/reset-password`
 * → 콜백이 세션 쿠키를 심고 여기로 보낸다. 즉 **이 화면에 도달했다는 건 이미
 * 로그인된 상태**라는 뜻이다. 그래서 현재 비밀번호를 묻지 않는다(묻을 수도 없다 —
 * 잊어서 온 것이다).
 *
 * 세션이 없으면 폼을 아예 안 보여준다. 링크가 만료됐거나 주소만 직접 친
 * 경우인데, 폼을 보여주면 다 입력한 뒤에야 실패한다.
 */
export function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tField = useTranslations("auth.changePassword");
  const router = useRouter();

  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  /** 다른 기기 세션까지 실제로 끊겼는지 — 실패해도 재설정은 성공이다. */
  const [othersRevoked, setOthersRevoked] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSessionState(data.session ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pairError = validatePasswordPair(password, confirm);
    if (pairError) {
      setError(tField(pairError, { minLength: PASSWORD_MIN_LENGTH }));
      return;
    }

    setError(null);
    setSubmitting(true);
    const supabase = createSupabaseClient();
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        // 서버 원문을 그대로 띄우지 않는다.
        //
        // GoTrue 메시지는 영문이고 개발자용이다. 한국어 화면 한가운데
        // "New password should be different from the old password." 가 뜬다.
        // `updateError.message` 는 비는 법이 없어서 `||` 폴백은 영영 안 쓰인다.
        // 같은 교훈이 `app/(app)/join/page.tsx` 에도 적혀 있다.
        setError(
          updateError.code === "same_password"
            ? t("samePassword")
            : tField("updateFailed")
        );
        setSubmitting(false);
        return;
      }

      // 비밀번호를 잊었다는 건 남이 알고 있었을 가능성도 포함한다. 재설정 뒤엔
      // 다른 기기 세션을 끊는 게 기본값이어야 한다 — 설정 화면(선택 체크박스)과
      // 달리 여기서는 묻지 않는다.
      //
      // 실패해도 재설정 자체는 성공했으므로 막지 않는다. 다만 사용자가 "다
      // 끊겼겠거니" 하고 넘어가지 않도록 문구를 달리한다.
      //
      // **던지는 경우도 같이 잡는다.** 이 호출을 바깥 try 에 맡기면 네트워크가
      // 끊겼을 때 catch 가 돌아 "처리 중 오류" 가 뜬다 — 비밀번호는 이미
      // 바뀌었는데 사용자는 실패로 읽고 같은 값으로 다시 시도하다가 "기존과
      // 다른 비밀번호를 입력하세요" 를 본다. 되돌릴 수 없는 작업 뒤의 부수
      // 작업이므로 실패를 여기서 삼킨다.
      let signedOutOthers = true;
      try {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "others",
        });
        signedOutOthers = !signOutError;
      } catch {
        signedOutOthers = false;
      }

      setOthersRevoked(signedOutOthers);
      setDone(true);
      // 새 비밀번호로 바뀐 세션을 서버 컴포넌트에도 반영한다.
      router.refresh();
    } catch {
      setError(tField("genericError"));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background p-8">
      <Link href="/" className="flex items-center gap-2 self-start">
        <Image
          src="/qstn_logo_svg.svg"
          alt={t("logoAlt")}
          width={30}
          height={30}
          className="w-8 h-8"
          priority
        />
        <span className="text-lg font-bold text-foreground dark:text-white">
          Quest-On
        </span>
      </Link>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-8">
          {sessionState === "checking" && (
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {sessionState === "missing" && (
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-foreground dark:text-white">
                {t("linkInvalidTitle")}
              </h1>
              <p className="text-muted-foreground">{t("linkInvalidBody")}</p>
              <Button asChild className="w-full min-h-[44px]">
                <Link href="/forgot-password">{t("requestAgain")}</Link>
              </Button>
            </div>
          )}

          {sessionState === "ready" && done && (
            <div className="space-y-4">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-3xl font-bold text-foreground dark:text-white">
                {t("doneTitle")}
              </h1>
              <p className="text-muted-foreground">
                {othersRevoked ? t("doneBody") : t("doneBodyPartial")}
              </p>
              <Button asChild className="w-full min-h-[44px]">
                <Link href="/">{t("continueBtn")}</Link>
              </Button>
            </div>
          )}

          {sessionState === "ready" && !done && (
            <>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground dark:text-white">
                  {t("title")}
                </h1>
                <p className="text-muted-foreground">{t("subtitle")}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField
                  id="new-password"
                  label={tField("newPasswordLabel")}
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((v) => !v)}
                  toggleAriaLabel={
                    showPassword
                      ? tField("hidePassword")
                      : tField("showPassword")
                  }
                  autoComplete="new-password"
                  placeholder={tField("newPasswordPlaceholder", {
                    minLength: PASSWORD_MIN_LENGTH,
                  })}
                />

                <PasswordField
                  id="confirm-password"
                  label={tField("confirmPasswordLabel")}
                  value={confirm}
                  onChange={setConfirm}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((v) => !v)}
                  toggleAriaLabel={
                    showPassword
                      ? tField("hidePassword")
                      : tField("showPassword")
                  }
                  autoComplete="new-password"
                  placeholder={tField("confirmPasswordPlaceholder")}
                  error={mismatch ? tField("confirmMismatch") : null}
                />

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full min-h-[44px]"
                  size="lg"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="font-bold">{t("submitBtn")}</span>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
