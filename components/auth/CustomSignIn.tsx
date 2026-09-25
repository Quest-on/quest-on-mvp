"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createSupabaseClient } from "@/lib/supabase-client";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { safeInternalPath } from "@/lib/safe-redirect";
import { useTranslations } from "next-intl";
import { useOAuthProviders } from "@/lib/use-oauth-providers";
import { isProviderUnavailable } from "@/lib/oauth-providers";
import { OAuthProviderButtons } from "@/components/auth/OAuthProviderButtons";

export function CustomSignIn() {
  const t = useTranslations("auth.signIn");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const providers = useOAuthProviders();
  const googleUnavailable = isProviderUnavailable(providers, "google");
  const kakaoUnavailable = isProviderUnavailable(providers, "kakao");

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(t("invalidCredentials"));
      setLoading(false);
      return;
    }

    // 로그인 전에 가려던 곳으로 되돌린다.
    //
    // redirect 는 URL 쿼리(= 사용자 입력)라 그대로 믿으면 안 된다.
    // startsWith("/") 만으로는 //evil.com 이 통과해 외부로 튕긴다.
    const redirect = safeInternalPath(
      new URLSearchParams(window.location.search).get("redirect")
    );
    router.push(redirect ?? "/");
    router.refresh();
  };

  const handleOAuth = async (provider: "google" | "azure" | "kakao") => {
    if (oauthLoading) return;
    setOauthLoading(provider);
    const supabase = createSupabaseClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthCallbackUrl(window.location.origin),
      },
    });

    // 성공하면 브라우저가 이미 떠났으므로 여기 안 온다. 여기 왔다는 건
    // 실패했다는 뜻이다. 로딩만 걸어두면 버튼이 영영 도는 채로 남는다.
    if (oauthError) {
      setOauthLoading(null);
      setError(t("providerUnavailable"));
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign In Form */}
      <div className="flex-1 flex flex-col p-8 bg-background">
        {/* 로고 - 왼쪽 상단 */}
        <Link
          href="/"
          className="flex items-center gap-2 self-start"
        >
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

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground dark:text-white">
                {t("welcome")}
              </h1>
              <p className="text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>

            <div className="space-y-6">
              {/* 소셜 로그인 버튼들 */}
              <OAuthProviderButtons
                namespace="auth.signIn"
                oauthLoading={oauthLoading}
                googleUnavailable={googleUnavailable}
                kakaoUnavailable={kakaoUnavailable}
                onSelect={handleOAuth}
              />

              {/* 구분선 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("divider")}
                  </span>
                </div>
              </div>

              {/* 이메일/비밀번호 폼 */}
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("passwordLabel")}</Label>
                    {/*
                     * 비밀번호 찾기 (#318). 이메일로 가입한 사용자는 이 링크가
                     * 없으면 복구 수단이 전혀 없다 — staging 은 Google 이 꺼져
                     * 있어 이메일 가입만 가능하다.
                     *
                     * 지금은 닫혀 있다 — lib/password-reset-availability.ts.
                     */}
                    {isPasswordResetEnabled() && (
                      <Link
                        href="/forgot-password"
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {t("forgotPasswordLink")}
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full min-h-[44px]"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="font-bold">{t("submitBtn")}</span>
                  )}
                </Button>
              </form>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link
                href="/sign-up"
                className="font-medium text-black dark:text-white hover:underline"
              >
                {t("signUpLink")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Right Section - Visual Element */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center p-8 relative overflow-hidden"
        style={{ backgroundColor: "#365FC6" }}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src="/wqstn.png"
            alt={t("logoAltRight")}
            width={400}
            height={400}
            className="w-auto h-auto max-w-[51%] max-h-[51%] object-contain"
            priority
          />
        </div>
      </div>
    </div>
  );
}
