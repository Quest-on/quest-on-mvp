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
 * 그래서 **인증된 시작점**(`POST /api/account/identities`)이 의도를 HttpOnly
 * 쿠키에 담고, 링크 전용 pathname(`/auth/link-callback`)이 1회 소비한다.
 * 실제로 막는 것은 넷이다:
 *
 *   1. **HttpOnly** — 스크립트가 읽지도 쓰지도 못한다.
 *   2. **`Path` 한정** — 링크 콜백 외의 요청에는 아예 실리지 않는다.
 *   3. **`userId` 결합** — 콜백이 쿠키의 `userId` 와 실제 세션 사용자를 대조해
 *      남의 code 를 내 의도에 붙이는 시도를 막는다. 이게 핵심 통제다.
 *   4. **짧은 TTL + 1회 소비** — 잊힌 의도가 다음 로그인을 오염시키지 않는다.
 *
 * 예전에는 여기에 opaque `nonce` 가 있었다. 만들어서 쿠키에 담고 파싱까지 했지만
 * **대조하는 곳이 없어** 아무 일도 하지 않았다(이슈 #414). 발급분을 서버에 담아
 * 두고 검증하면 "HttpOnly 쿠키를 탈취당한 뒤의 재생" 하나를 더 막을 수 있는데,
 * 그 시나리오는 이미 계정이 넘어간 상태다. 왕복 비용만큼의 값을 못 한다.
 * 없는 통제를 있다고 적어 두는 쪽이 더 위험해서 지웠다.
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
  userId: string;
  provider: LinkableProvider;
};

function encodeIntent(intent: LinkIntent): string {
  return encodeURIComponent(JSON.stringify(intent));
}

/**
 * 쿠키의 **유일한** 정의. 이름·값·속성을 한 덩어리로 돌려준다.
 *
 * 예전에는 `Set-Cookie` 헤더 문자열을 만드는 함수가 따로 있었는데 프로덕션
 * 라우트는 그걸 안 쓰고 `response.cookies.set(...)` 로 같은 형식을 다시 썼다.
 * 그래서 테스트가 **안 쓰이는 쪽**을 검증했고, 실제 쿠키 속성을 깨뜨려도
 * 초록이었다(이슈 #414). 라우트가 이 함수의 결과를 그대로 넘기게 해서
 * 검증 대상과 배포 대상을 같게 만든다.
 *
 * `Path` 를 링크 콜백으로 좁혀 다른 요청에는 실리지 않게 한다.
 */
export function linkIntentCookie(
  intent: LinkIntent,
  secure: boolean
): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
} {
  return {
    name: ACCOUNT_LINK_COOKIE,
    value: encodeIntent(intent),
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: ACCOUNT_LINK_CALLBACK_PATH,
      maxAge: ACCOUNT_LINK_COOKIE_MAX_AGE,
    },
  };
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
  const { userId, provider } = obj as Record<string, unknown>;
  if (typeof userId !== "string" || !userId) return null;
  if (!isLinkableProvider(provider)) return null;

  return { userId, provider };
}
