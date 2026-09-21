"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Users, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createSupabaseClient } from "@/lib/supabase-client";
import { buildRoleCookie } from "@/lib/onboarding-role";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { authEmailErrorKey } from "@/lib/auth-email-error";
import { useTranslations } from "next-intl";
import { useOAuthProviders } from "@/lib/use-oauth-providers";
import { isProviderUnavailable } from "@/lib/oauth-providers";
import { OAuthProviderButtons } from "@/components/auth/OAuthProviderButtons";
import { cn } from "@/lib/utils";

type Step = "start" | "verify";

export function CustomSignUp() {
  const t = useTranslations("auth.signUp");
  const router = useRouter();
  /**
   * 고르기 전에는 아무것도 선택하지 않는다.
   *
   * 기본값을 두면 "계정 유형을 선택해주세요" 라고 적어 놓고 이미 하나를
   * 칠해 둔 꼴이 된다. 그 값은 `options.data.role` 로 나가고
   * `lib/supabase-auth.ts` 가 프로필 역할을 최초 1회 확정하므로,
   * 교수자가 안 누르면 영구히 학생이 된다.
   *
   * `role` 은 여러 곳에서 문자열로 쓰여 nullable 로 바꾸면 파급이 크다.
   * 온보딩(#287)과 같이 선택 여부만 따로 든다.
   */
  const [role, setRole] = useState<"instructor" | "student">("instructor");
  const [roleChosen, setRoleChosen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const providers = useOAuthProviders();
  const googleUnavailable = isProviderUnavailable(providers, "google");
  const kakaoUnavailable = isProviderUnavailable(providers, "kakao");

  // 역할 의도는 쿠키로 남긴다 (#87). localStorage 는 서버가 못 읽어서, OAuth
  // 리다이렉트로 돌아온 뒤 서버가 역할을 클레임할 방법이 없었다.
  const rememberRole = (value: "instructor" | "student") => {
    document.cookie = buildRoleCookie(value, {
      secure: window.location.protocol === "https:",
    });
  };

  const handleRoleChange = (value: "instructor" | "student") => {
    setRole(value);
    setRoleChosen(true);
    rememberRole(value);
  };

  const handleOAuth = async (provider: "google" | "azure" | "kakao") => {
    if (oauthLoading) return;
    setOauthLoading(provider);
    rememberRole(role);

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role },
        emailRedirectTo: getAuthCallbackUrl(window.location.origin),
      },
    });

    if (signUpError) {
      setError(t(authEmailErrorKey(signUpError)));
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("verify");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });

    if (verifyError) {
      setError(t("invalidOtp"));
      setLoading(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign Up Form */}
      <div className="flex-1 flex flex-col px-6 py-10 sm:p-8 bg-background">
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
          <div className="w-full max-w-md mx-auto">
            {step === "start" ? (
              <>
                <div className="space-y-2 mb-6">
                  <h1 className="text-3xl font-bold text-foreground dark:text-white">
                    {t("heading")}
                  </h1>
                  <p className="text-muted-foreground">
                    {t("subtitle")}
                  </p>
                </div>

                {/* 역할 선택 */}
                <div className="mb-6">
                  <div className="mb-2">
                    <Label className="type-field-label">{t("roleLabel")}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("roleSubtitle")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRoleChange("instructor")}
                      className={cn(
                        "flex-1 flex flex-col items-start p-4 border-2 rounded-lg transition-all",
                        roleChosen && role === "instructor"
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-border hover:border-input dark:hover:border-input"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground dark:text-white">
                          {t("instructorRole")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground text-left">
                        {t("instructorRoleDesc")}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoleChange("student")}
                      className={cn(
                        "flex-1 flex flex-col items-start p-4 border-2 rounded-lg transition-all",
                        roleChosen && role === "student"
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-border hover:border-input dark:hover:border-input"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground dark:text-white">
                          {t("studentRole")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground text-left">
                        {t("studentRoleDesc")}
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col space-y-4">
                  {/* 소셜 로그인 */}
                  {/*
                    역할을 고르기 전에는 소셜 로그인도 막는다. handleOAuth 가
                    rememberRole(role) 을 부르고 role 초기값이 instructor 라,
                    안 막으면 학생이 교수자로 굳는다. 이메일 제출과 같은 이유다.
                  */}
                  <OAuthProviderButtons
                    namespace="auth.signUp"
                    oauthLoading={oauthLoading}
                    googleUnavailable={googleUnavailable}
                    kakaoUnavailable={kakaoUnavailable}
                    blocked={!roleChosen}
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
                  <form onSubmit={handleSignUp} className="space-y-4">
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
                      <Label htmlFor="password">{t("passwordLabel")}</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("passwordPlaceholder")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={6}
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
                      // 역할을 고르기 전에는 가입시키지 않는다. 기본값으로 계정이 굳는다.
                      disabled={loading || !roleChosen}
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <span className="font-bold">{t("submitBtn")}</span>
                      )}
                    </Button>
                  </form>

                  <div className="text-center text-sm text-muted-foreground mt-6">
                    {t("hasAccount")}{" "}
                    <Link
                      href="/sign-in"
                      className="font-medium text-black dark:text-white hover:underline"
                    >
                      {t("signInLink")}
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              /* 이메일 인증 Step */
              <>
                <div className="space-y-2 mb-6">
                  <h1 className="text-3xl font-bold text-foreground dark:text-white">
                    {t("verifyHeading")}
                  </h1>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground dark:text-white">
                      {email}
                    </span>
                    {t("verifyDesc")}
                  </p>
                </div>

                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t("otpLabel")}</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("otpPlaceholder")}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
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
                      <span className="font-bold">{t("verifyBtn")}</span>
                    )}
                  </Button>

                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:underline"
                    onClick={() => { setStep("start"); setError(null); }}
                  >
                    {t("backToEmail")}
                  </button>
                </form>
              </>
            )}
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
