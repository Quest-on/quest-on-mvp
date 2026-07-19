"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * 언어 스위처용 서버 액션 — 로케일을 쿠키에 1년간 저장.
 * (로그인 유저의 DB 저장/기기 간 동기화는 후속 PR)
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
