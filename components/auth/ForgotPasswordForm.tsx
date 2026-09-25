"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * 비밀번호 재설정 요청 화면 (#318).
 *
 * 발송은 `/api/auth/password-reset` 이 한다 — 레이트리밋과 "계정 존재 여부를
 * 흘리지 않는 응답" 이 서버에 있어야 하기 때문이다. 자세한 건 그 라우트 주석.
 *
 * 그래서 이 화면은 **성공/미가입을 구분해 보여줄 수 없다.** 제출 후 문구가
 * "보냈습니다" 가 아니라 "가입된 주소라면 메일이 갑니다" 인 이유다. 구분해서
 * 보여주면 서버에서 막아둔 계정 열거가 화면에서 그대로 새어 나간다.
 */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError(t("rateLimited"));
        return;
      }
      if (!res.ok) {
        setError(t("requestFailed"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("requestFailed"));
    } finally {
      setLoading(false);
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
          {sent ? (
            <div className="space-y-4">
              <MailCheck className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-3xl font-bold text-foreground dark:text-white">
                {t("sentTitle")}
              </h1>
              {/* 주소를 그대로 되비춘다 — 오타로 못 받는 경우가 가장 흔하다. */}
              <p className="text-muted-foreground">
                {t("sentBody", { email })}
              </p>
              <p className="type-hint">{t("sentHint")}</p>
              {/*
                * PKCE verifier 가 **요청한 브라우저의 쿠키**에 있다. 노트북에서
                * 요청하고 휴대폰에서 링크를 열면 교환이 실패하는데, 화면은
                * 만료된 링크와 구분되지 않는다 — 가장 흔한 복구 동선이 그것이라
                * 미리 알린다.
                */}
              <p className="type-hint">{t("sameDeviceHint")}</p>
              <Button asChild variant="outline" className="w-full min-h-[44px]">
                <Link href="/sign-in">{t("backToSignIn")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground dark:text-white">
                  {t("title")}
                </h1>
                <p className="text-muted-foreground">{t("subtitle")}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full min-h-[44px]"
                  size="lg"
                  disabled={loading || email.trim().length === 0}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="font-bold">{t("submitBtn")}</span>
                  )}
                </Button>
              </form>

              <div className="text-center text-sm text-muted-foreground">
                <Link
                  href="/sign-in"
                  className="font-medium text-black dark:text-white hover:underline"
                >
                  {t("backToSignIn")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
