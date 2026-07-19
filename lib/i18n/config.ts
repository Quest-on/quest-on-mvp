/**
 * i18n 로케일 설정 — 지원 로케일, 기본값, 타입 가드.
 * 서버/클라이언트 어디서나 import 가능한 순수 상수 모듈.
 */
export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

/** 쿠키 키 — next-intl 관례에 맞춰 NEXT_LOCALE 사용 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Intl 로케일 매핑 (ko → ko-KR, en → en-US) */
export const intlLocaleMap: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
