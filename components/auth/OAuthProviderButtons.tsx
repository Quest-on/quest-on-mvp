"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 로그인·가입 화면이 함께 쓰는 소셜 로그인 버튼 묶음.
 *
 * 예전에는 같은 SVG path 네 벌, 같은 카카오 브랜드 클래스 문자열, 같은 안내
 * 문구 두 줄이 두 파일에 그대로 복제돼 있었다. 가입 화면 주석에 "브랜드 규정은
 * CustomSignIn.tsx 의 같은 버튼 주석 참조" 라고 적혀 있을 만큼 알려진 중복이었고,
 * 이미 갈라지기 시작했다 — 가입 화면만 역할 선택 전에 버튼을 잠갔다.
 *
 * 두 화면의 메시지 네임스페이스가 다르므로(`auth.signIn` / `auth.signUp`)
 * 네임스페이스를 받아 안에서 푼다. 키 이름은 양쪽이 같다.
 */
export function OAuthProviderButtons({
  namespace,
  oauthLoading,
  googleUnavailable,
  kakaoUnavailable,
  blocked = false,
  onSelect,
}: {
  namespace: "auth.signIn" | "auth.signUp";
  oauthLoading: string | null;
  googleUnavailable: boolean;
  kakaoUnavailable: boolean;
  /** 추가 잠금. 가입 화면은 역할을 고르기 전까지 막는다. */
  blocked?: boolean;
  onSelect: (provider: "google" | "azure" | "kakao") => void;
}) {
  const t = useTranslations(namespace);
  const busy = !!oauthLoading;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full min-h-[44px]"
        disabled={busy || googleUnavailable || blocked}
        onClick={() => onSelect("google")}
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
        <span className="flex items-center gap-2 font-medium">{t("googleBtn")}</span>
      </Button>
      {/*
        잠긴 이유는 버튼 밖에 둔다.

        disabled 버튼은 opacity 0.5 라 안에 넣으면 안내까지 같이 흐려진다.
        다크에서 실측 10.79 -> 3.95 로 떨어져 왜 못 누르는지 읽을 수 없었다.
        버튼은 흐려도 되지만 이유는 읽혀야 한다.
      */}
      {googleUnavailable ? (
        <p className="type-hint text-center" role="note">
          {t("providerUnavailable")}
        </p>
      ) : null}

      {/*
        카카오 버튼은 브랜드 규정이 고정이다 — 컨테이너 #FEE500, 심볼·레이블
        #000000(레이블은 85%), radius 12px, 문구는 "카카오 로그인" 만.
        outline variant 는 bg-background + rounded-md 라 정면 충돌하므로
        className 으로 덮는다. 다크모드에서도 색을 바꾸지 않는다 —
        공식 가이드에 다크 변형이 없다.
      */}
      <Button
        type="button"
        variant="outline"
        className={cn(
          "w-full min-h-[44px] rounded-xl",
          "border-[#FEE500] bg-[#FEE500] text-black hover:bg-[#FEE500]/90 hover:text-black",
          "dark:border-[#FEE500] dark:bg-[#FEE500] dark:text-black dark:hover:bg-[#FEE500]/90"
        )}
        disabled={busy || kakaoUnavailable || blocked}
        onClick={() => onSelect("kakao")}
      >
        {oauthLoading === "kakao" ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#000000" aria-hidden="true">
            <path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.86 5.32 4.66 6.74-.15.53-.96 3.43-.99 3.66 0 0-.02.17.09.23.11.06.24.01.24.01.32-.04 3.7-2.42 4.28-2.83.56.08 1.13.12 1.72.12 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
          </svg>
        )}
        <span className="flex items-center gap-2 font-medium text-black/85">{t("kakaoBtn")}</span>
      </Button>
      {kakaoUnavailable ? (
        <p className="type-hint text-center" role="note">
          {t("providerUnavailable")}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="w-full min-h-[44px]"
        disabled
        onClick={() => onSelect("azure")}
      >
        <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
          <path d="M0 0h11.5v11.5H0V0z" fill="#F25022" />
          <path d="M11.5 0H23v11.5H11.5V0z" fill="#7FBA00" />
          <path d="M0 11.5h11.5V23H0V11.5z" fill="#00A4EF" />
          <path d="M11.5 11.5H23V23H11.5V11.5z" fill="#FFB900" />
        </svg>
        <span className="flex items-center gap-2 font-medium">{t("microsoftBtn")}</span>
      </Button>
      {/*
        '준비중' 도 버튼 밖에 둔다.

        disabled 버튼은 opacity 0.5 라 안에 두면 같이 흐려진다. 왜 못 누르는지를
        알려주는 정보가 흐려지면 사용자는 버튼이 죽은 이유를 모른다.
      */}
      <p className="type-hint text-center" role="note">
        {t("comingSoon")}
      </p>
    </div>
  );
}
