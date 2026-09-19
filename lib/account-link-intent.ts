/**
 * 계정 연결 의도 (PR-2 / 스펙 f46).
 *
 * 로그인한 사용자가 설정에서 "카카오 연결"을 누르면 `linkIdentity()` 가 OAuth
 * 리다이렉트를 탄다. 돌아왔을 때 "이건 로그인이 아니라 연결이었다"를 서버가
 * 믿을 수 있게 알아야 한다. 세 가지는 쓸 수 없다:
 *
 * - OAuth `state` — SDK/GoTrue 가 PKCE-CSRF 용으로 소유한다. 덮어쓰면 안 된다.
 * - `?flow=link` 같은 URL 마커 — 사용자가 붙일 수 있어 단독으로 못 믿는다.
 * - `onboarding_role` 쿠키 재사용 — 비-HttpOnly 라 인가 판단에 쓰지 말라고
 *   그 파일이 명시한다.
 *
 * 그래서 서버 라우트가 opaque nonce 를 만들어 **HttpOnly** 쿠키에 담고, 링크
 * 전용 pathname(`/auth/link-callback`)이 그 쿠키를 1회 소비한다. nonce 자체가
 * 비밀이라 서명이 필요 없다 — 스크립트가 못 읽으니 위조할 재료가 없다.
 * 콜백은 쿠키의 `userId` 와 실제 세션 사용자를 대조해 남의 code 를 내 의도에
 * 붙이는 시도를 막는다.
 */

import type { OAuthProvider } from "./oauth-providers";

export const ACCOUNT_LINK_COOKIE = "account_link_intent";

/** 링크 전용 콜백. 기존 `/auth/callback` 은 손대지 않는다. */
export const ACCOUNT_LINK_CALLBACK_PATH = "/auth/link-callback";

/**
 * 5분. 설정 → provider → 콜백 왕복에 충분하고, 잊힌 의도가 다음 로그인을
 * 오염시킬 만큼 길지 않다.
 */
export const ACCOUNT_LINK_COOKIE_MAX_AGE = 300;

/** 연결을 허용하는 provider. Azure 는 아직 '준비중'이라 뺀다. */
const LINKABLE: readonly OAuthProvider[] = ["google", "kakao"];

export type LinkableProvider = (typeof LINKABLE)[number];

export function isLinkableProvider(value: unknown): value is LinkableProvider {
  return typeof value === "string" && (LINKABLE as readonly string[]).includes(value);
}

export type LinkIntent = {
  nonce: string;
  userId: string;
  provider: LinkableProvider;
};

function encodeIntent(intent: LinkIntent): string {
  return encodeURIComponent(JSON.stringify(intent));
}

/**
 * `Set-Cookie` 헤더 값. 서버에서만 만든다.
 *
 * `Path` 를 링크 콜백으로 좁혀 다른 요청에는 아예 실리지 않게 한다.
 */
export function buildLinkIntentCookie(
  intent: LinkIntent & { secure: boolean }
): string {
  const { secure, ...payload } = intent;
  const attrs = [
    `${ACCOUNT_LINK_COOKIE}=${encodeIntent(payload)}`,
    `Max-Age=${ACCOUNT_LINK_COOKIE_MAX_AGE}`,
    `Path=${ACCOUNT_LINK_CALLBACK_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/**
 * Cookie 헤더 문자열에서 의도를 읽는다. 형식이 어긋나면 null.
 */
export function readLinkIntentCookie(
  cookieString: string | undefined | null
): LinkIntent | null {
  if (!cookieString) return null;

  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ACCOUNT_LINK_COOKIE) continue;

    return parseIntent(part.slice(eq + 1).trim());
  }
  return null;
}

/** 쿠키 값 하나(이미 잘라낸 것)를 해석한다. */
export function parseIntent(raw: string): LinkIntent | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  let obj: unknown;
  try {
    obj = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  const { nonce, userId, provider } = obj as Record<string, unknown>;
  if (typeof nonce !== "string" || !nonce) return null;
  if (typeof userId !== "string" || !userId) return null;
  if (!isLinkableProvider(provider)) return null;

  return { nonce, userId, provider };
}
