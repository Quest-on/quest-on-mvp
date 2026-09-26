import { createHmac, timingSafeEqual } from "crypto";

/**
 * 비밀번호 재설정 의도 (이슈 #456 · #318).
 *
 * `/reset-password` 는 **방금 복구 링크로 만들어진 그 세션에게만, 한 번** 열려야
 * 한다. 복구 링크는 세션을 만들기 때문에 "로그인했는가" 로는 그 사람과 평범한
 * 로그인 사용자를 구분할 수 없다. 이전 설계가 매번 새던 자리가 여기다.
 *
 *   1. `?next=/reset-password` — 사용자가 붙일 수 있는 값이다. 평범한 OAuth
 *      로그인에 붙이면 필수 동의 게이트를 건너뛰었다(#456).
 *   2. access token 의 `amr: otp` — 매직링크 세션과 구분되지 않는다.
 *   3. 값이 `"1"` 인 쿠키 — 사용자·세션에 묶이지 않고, 소비되지도 않았다.
 *      같은 브라우저에서 10분 안에 로그인한 **다른 계정**에도 화면이 열렸다.
 *
 * 지금 설계는 근거를 "세션이 어떻게 생겼나" 에서 **"누가 세션을 만들었나"** 로
 * 옮긴다. 세션을 만드는 곳이 서버의 `POST /api/auth/password-reset/verify`
 * 하나이고, 거기서 부르는 게 `verifyOtp({ type: "recovery" })` 이므로, 그
 * 응답으로 받은 세션은 **정의상** 복구 세션이다. 추론이 아니다.
 *
 * verify 가 그 세션의 `(user_id, session_id)` 에 HMAC 을 붙여 쿠키로 남기고,
 * 화면과 완료 API 는 **지금 요청의 검증된 세션**이 쿠키에 적힌 것과 같은지
 * 대조한다. 그래서:
 *
 *   - 다른 계정·다른 세션에는 열리지 않는다 (사용자·세션 결합)
 *   - 쿠키를 손으로 만들 수 없다 (HMAC, 서버만 아는 키)
 *   - 한 번 쓰면 끝난다 — 완료 API 가 쿠키를 지우고 **그 세션을 포함한 모든
 *     세션을 끊는다.** 쿠키가 남아도 묶인 세션이 없다.
 *   - 10분 뒤에는 서명이 맞아도 거절한다 (값 안의 만료 시각)
 *
 * 키(`PASSWORD_RESET_INTENT_SECRET`)가 없으면 발급도 검증도 실패한다.
 * 모를 때 열어주면 그게 구멍이다.
 */

export const PASSWORD_RESET_COOKIE = "password_reset_intent";

/** 새 비밀번호를 정하는 화면. */
export const PASSWORD_RESET_PATH = "/reset-password";

/**
 * 메일의 링크가 여는 확인 화면. 링크를 여는 것만으로는 토큰을 쓰지 않는다 —
 * 메일 보안 스캐너가 링크를 미리 열어 1회용 토큰을 태우는 일이 흔하다.
 * 사람이 버튼을 눌러야(POST) verify 가 돈다.
 */
export const PASSWORD_RESET_RECOVERY_PATH = "/auth/recovery";

/**
 * 메일 링크의 `token_hash` 형식. 확인 화면이 폼을 그릴지와 verify 가 받을지를
 * 같은 값으로 판단한다 — 어긋나면 화면은 버튼을 주는데 누르면 "쓸 수 없는
 * 링크" 가 된다.
 */
export const RECOVERY_TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;

/**
 * 10분. 링크를 누르고 새 비밀번호를 정하는 데 충분하고, 잊힌 의도가 남아
 * 있을 만큼 길지 않다.
 */
export const PASSWORD_RESET_COOKIE_MAX_AGE = 600;

const KEY_ENV = "PASSWORD_RESET_INTENT_SECRET";
const MIN_KEY_BYTES = 32;
const VERSION = "v1";

/** user_id·session_id 는 UUID 다. 구분자(`.`)가 섞일 여지를 형식에서 없앤다. */
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function loadKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw || raw.trim() === "") return null;
  const key = Buffer.from(raw, "base64");
  // 값은 어디에도 남기지 않는다. 짧으면 없는 것으로 본다.
  return key.length >= MIN_KEY_BYTES ? key : null;
}

/** 키가 준비돼 있는지. 발송 라우트가 받는 쪽이 동작할 수 없을 때 메일을 안 보내려고 본다. */
export function isPasswordResetIntentKeyConfigured(): boolean {
  return loadKey() !== null;
}

function mac(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body, "utf8").digest("base64url");
}

/** 의도가 묶이는 대상 — 복구로 만들어진 바로 그 세션. */
export type PasswordResetBinding = {
  userId: string;
  sessionId: string;
};

/**
 * 의도 값을 만든다. 키가 없거나 식별자 형식이 이상하면 null — 호출부는 복구를
 * 진행하지 않는다.
 */
export function issuePasswordResetIntent(
  binding: PasswordResetBinding,
  now: number = Date.now()
): string | null {
  const key = loadKey();
  if (!key) return null;
  if (!ID_PATTERN.test(binding.userId) || !ID_PATTERN.test(binding.sessionId)) {
    return null;
  }
  const exp = Math.floor(now / 1000) + PASSWORD_RESET_COOKIE_MAX_AGE;
  const body = `${VERSION}.${binding.userId}.${binding.sessionId}.${exp}`;
  return `${body}.${mac(key, body)}`;
}

/**
 * 쿠키 값의 서명·형식·만료를 확인하고 묶인 대상을 돌려준다.
 *
 * 여기서는 **지금 세션과의 대조를 하지 않는다.** 그건 검증된 세션을 가진
 * 호출부가 `matchesPasswordResetBinding` 으로 한다. 이 함수만 통과했다고
 * 화면을 열면 안 된다.
 */
export function readPasswordResetIntent(
  raw: string | null | undefined,
  now: number = Date.now()
): PasswordResetBinding | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  const key = loadKey();
  if (!key) return null;

  const parts = raw.split(".");
  if (parts.length !== 5) return null;
  const [version, userId, sessionId, expRaw, signature] = parts;
  if (version !== VERSION) return null;
  if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(sessionId)) return null;
  if (!/^\d{1,12}$/.test(expRaw)) return null;

  const expected = Buffer.from(mac(key, `${version}.${userId}.${sessionId}.${expRaw}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }

  const nowSec = Math.floor(now / 1000);
  const exp = Number(expRaw);
  // 만료 뒤는 물론, 발급 창보다 먼 미래도 거절한다 — 키가 새도 수명을 못 늘린다.
  if (exp <= nowSec || exp > nowSec + PASSWORD_RESET_COOKIE_MAX_AGE) return null;

  return { userId, sessionId };
}

/**
 * 검증된 세션 클레임에서 대조할 대상을 꺼낸다.
 *
 * `claims` 는 반드시 **검증된** 출처여야 한다 — `auth.getClaims()` 의 결과,
 * 또는 verify 라우트가 Supabase 에서 방금 직접 받은 토큰.
 */
export function bindingFromClaims(
  claims: Record<string, unknown> | null | undefined
): PasswordResetBinding | null {
  const userId = claims?.sub;
  const sessionId = claims?.session_id;
  if (typeof userId !== "string" || typeof sessionId !== "string") return null;
  if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(sessionId)) return null;
  return { userId, sessionId };
}

/**
 * access token 의 payload 를 읽는다. **서명을 보지 않는다.**
 *
 * verify 라우트가 `verifyOtp` 응답으로 Supabase 에게서 방금 직접 받은 토큰에만
 * 쓴다. 브라우저에서 온 토큰에 쓰면 아무 값이나 믿는 게 된다 — 그쪽은
 * `auth.getClaims()` 를 쓴다.
 */
export function decodeTrustedAccessToken(
  accessToken: string | null | undefined
): Record<string, unknown> | null {
  if (typeof accessToken !== "string") return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return typeof claims === "object" && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 쿠키에 적힌 대상과 지금 세션이 같은가. 둘 다 있어야 참이다. */
export function matchesPasswordResetBinding(
  intent: PasswordResetBinding | null,
  current: PasswordResetBinding | null
): boolean {
  return (
    intent !== null &&
    current !== null &&
    intent.userId === current.userId &&
    intent.sessionId === current.sessionId
  );
}

type IntentCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "strict";
    path: string;
    maxAge: number;
  };
};

/**
 * 쿠키의 **유일한** 정의. 이름·값·속성을 한 덩어리로 돌려준다.
 *
 * `account-link-intent` 가 겪은 것과 같은 이유다 — 발급하는 곳과 지우는 곳이
 * 속성을 따로 적으면, 한쪽만 바뀌었을 때 삭제가 조용히 실패한다.
 *
 * `Path` 가 `/` 인 이유: 읽는 곳이 `/reset-password`(화면)와
 * `/api/auth/password-reset/complete`(완료) 둘이다. 넓어진 대신 값은 그 자체로
 * 권한이 아니다 — 묶인 세션이 없으면 아무 데서도 통하지 않는다.
 * `SameSite=Strict` 라 다른 사이트에서 시작된 요청에는 실리지 않는다.
 */
export function passwordResetIntentCookie(
  value: string,
  secure: boolean
): IntentCookie {
  return {
    name: PASSWORD_RESET_COOKIE,
    value,
    options: {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: PASSWORD_RESET_COOKIE_MAX_AGE,
    },
  };
}

/** 소비 후 지우는 쿠키. **발급과 같은 정의에서 나온다.** */
export function clearPasswordResetIntentCookie(secure: boolean): IntentCookie {
  const issued = passwordResetIntentCookie("", secure);
  return { ...issued, options: { ...issued.options, maxAge: 0 } };
}
