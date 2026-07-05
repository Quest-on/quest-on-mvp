import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * 현재 요청의 로케일을 해석한다.
 * v1 우선순위: NEXT_LOCALE 쿠키 → 기본값(ko).
 * (유저 프로필 기반 기기 간 동기화는 후속 PR — profiles.language 컬럼 마이그레이션 필요)
 */
export async function resolveLocale(): Promise<Locale> {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  return defaultLocale;
}
