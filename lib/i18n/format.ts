import { intlLocaleMap, type Locale } from "./config";

/**
 * 로케일 인식 포맷 유틸.
 * 기존 toLocaleDateString("ko-KR") / date-fns ko 하드코딩을 대체한다.
 */

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(
  value: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }
): string {
  return new Intl.DateTimeFormat(intlLocaleMap[locale], options).format(toDate(value));
}

export function formatDateTime(
  value: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  return new Intl.DateTimeFormat(intlLocaleMap[locale], options).format(toDate(value));
}

export function formatTime(
  value: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
): string {
  return new Intl.DateTimeFormat(intlLocaleMap[locale], options).format(toDate(value));
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(intlLocaleMap[locale], options).format(value);
}
