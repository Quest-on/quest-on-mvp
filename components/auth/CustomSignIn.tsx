"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { createSupabaseClient } from "@/lib/supabase-client";
import { useTranslations } from "next-intl";

export function CustomSignIn() {
  const t = useTranslations("auth.signIn");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

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

    router.push("/");
    router.refresh();
  };

  const handleOAuth = async (provider: "google" | "azure") => {
    if (oauthLoading) return;
    setOauthLoading(provider);
    const supabase = createSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950 relative">
        {/* 로고 - 왼쪽 상단 */}
        <Link
          href="/"
          className="absolute top-8 left-8 flex items-center gap-2 z-10"
        >
          <Image
            src="/qstn_logo_svg.svg"
            alt={t("logoAlt")}
            width={30}
            height={30}
            className="w-8 h-8"
            priority
          />
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            Quest-On
          </span>
        </Link>

        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t("welcome")}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t("subtitle")}
            </p>
          </div>

          <div className="space-y-6">
            {/* 소셜 로그인 버튼들 */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                disabled={!!oauthLoading}
                onClick={() => handleOAuth("google")}
              >
                {oauthLoading === "google" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                <span className="font-medium">{t("googleBtn")}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                disabled
                onClick={() => handleOAuth("azure")}
              >
                <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                  <path d="M0 0h11.5v11.5H0V0z" fill="#F25022" />
                  <path d="M11.5 0H23v11.5H11.5V0z" fill="#7FBA00" />
                  <path d="M0 11.5h11.5V23H0V11.5z" fill="#00A4EF" />
                  <path d="M11.5 11.5H23V23H11.5V11.5z" fill="#FFB900" />
                </svg>
                <span className="flex items-center gap-2 font-medium">
                  {t("microsoftBtn")}
                  <Badge variant="secondary" className="text-[10px]">
                    {t("comingSoon")}
                  </Badge>
                </span>
              </Button>
            </div>

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
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
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

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
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
