"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  PASSWORD_MESSAGE_VALUES,
  PASSWORD_MIN_LENGTH,
  validatePasswordPair,
} from "@/lib/password-policy";

type Stage = "form" | "invalid" | "done";

/**
 * 새 비밀번호 입력 폼 (#318).
 *
 * 폼을 보여줄지는 `app/(auth)/reset-password/page.tsx` 가 서버에서 정한다 —
 * 여기에 왔다는 건 복구 링크 확인이 만든 세션이라는 뜻이다. 그래서 현재
 * 비밀번호를 묻지 않는다(묻을 수도 없다 — 잊어서 온 것이다).
 *
 * 저장은 브라우저가 Supabase 를 직접 부르지 않고 `POST
 * /api/auth/password-reset/complete` 로 한다. 서버가 같은 대조를 다시 하고,
 * 바꾼 뒤 **이 세션을 포함한 모든 세션을 끊는다.** 그래서 끝나면 로그인
 * 화면으로 보낸다.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("auth.resetPassword");
  const tField = useTranslations("auth.changePassword");

  const [stage, setStage] = useState<Stage>("form");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 모든 세션이 실제로 끊겼는지 — 실패해도 재설정은 성공이다. */
  const [revoked, setRevoked] = useState(true);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pairError = validatePasswordPair(password, confirm);
    if (pairError) {
      setError(tField(pairError, PASSWORD_MESSAGE_VALUES));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        revoked?: boolean;
      } | null;

      if (res.ok) {
        // 비밀번호는 이미 바뀌었다. 세션 정리가 일부 실패했으면 문구만 달리한다.
        setRevoked(body?.revoked !== false);
        setStage("done");
        return;
      }

      // 서버 원문을 그대로 띄우지 않는다. 코드만 보고 이 화면의 문구로 바꾼다.
      switch (body?.error) {
        case "UNAUTHORIZED":
        case "INTENT_INVALID":
          // 10분이 지났거나 세션이 바뀌었다. 폼을 계속 보여주면 몇 번을
          // 눌러도 같은 실패다.
          setStage("invalid");
          break;
        case "SAME_PASSWORD":
          setError(t("samePassword"));
          break;
        case "WEAK_PASSWORD":
          setError(tField("newPasswordTooShort", PASSWORD_MESSAGE_VALUES));
          break;
        // INVALID_INPUT 은 위의 validatePasswordPair 와 같은 규칙이라 여기까지
        // 오지 않는다. 오면 어느 문구가 맞는지 모르니 일반 실패로 둔다 — 예전엔
        // 72자를 넘겨도 "8자 이상" 이라고 말했다.
        case "RATE_LIMITED":
          setError(t("rateLimited"));
          break;
        default:
          setError(tField("updateFailed"));
      }
    } catch {
      setError(tField("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "invalid") {
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

  if (stage === "done") {
    return (
      <AuthPageShell logoAlt={t("logoAlt")}>
        <div className="space-y-4">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-3xl font-bold text-foreground dark:text-white">
            {t("doneTitle")}
          </h1>
          <p className="text-muted-foreground">
            {revoked ? t("doneBody") : t("doneBodyPartial")}
          </p>
          <Button asChild className="w-full min-h-[44px]">
            <Link href="/sign-in">{t("continueBtn")}</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell logoAlt={t("logoAlt")}>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground dark:text-white">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle", { email })}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 비밀번호 관리자가 어느 계정의 새 비밀번호인지 알게 한다. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />

        <PasswordField
          id="new-password"
          label={tField("newPasswordLabel")}
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          toggleAriaLabel={
            showPassword ? tField("hidePassword") : tField("showPassword")
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
            showPassword ? tField("hidePassword") : tField("showPassword")
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
    </AuthPageShell>
  );
}
