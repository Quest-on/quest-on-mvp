/**
 * 비밀번호 재설정 의도 (이슈 #456 · #318).
 *
 * `/reset-password` 는 **복구 링크를 타고 온 사람에게만** 열려야 한다. 그런데
 * 복구 링크는 세션을 만들기 때문에, "로그인했는가" 로는 그 사람과 평범한
 * 로그인 사용자를 구분할 수 없다. 처음엔 콜백이 받은 `?next=/reset-password`
 * 를 근거로 삼았는데, 그건 **사용자가 붙일 수 있는 값**이다.
 *
 *   supabase.auth.signInWithOAuth({ provider: "google", options: {
 *     redirectTo: origin + "/auth/callback?next=/reset-password" } })
 *
 * anon 키는 공개이고 `redirect_to` 는 허용목록의 `/auth/callback` 에 맞으며
 * 쿼리스트링은 보존된다. 그래서 평범한 OAuth 로그인으로 **필수 동의 게이트를
 * 건너뛰고**, 현재 비밀번호를 묻지 않는 화면에 도달할 수 있었다.
 *
 * `lib/account-link-intent.ts` 가 같은 함정을 이미 적어 뒀다 — *"`?flow=link`
 * 같은 URL 마커는 사용자가 붙일 수 있어 단독으로 못 믿는다."* 그 파일의 해법을
 * 그대로 쓴다: **인증된 시작점이 HttpOnly 쿠키에 의도를 담고, 그 경로만 읽는다.**
 *
 * 여기서 인증된 시작점은 `/auth/callback` 이고, 의도를 담는 조건은 교환된
 * 세션이 **실제 복구 세션**이라는 것이다(아래 `isRecoverySession`).
 *
 * 실제로 막는 것은 넷이다.
 *
 *   1. **HttpOnly** — 스크립트가 읽지도 쓰지도 못한다.
 *   2. **`Path` 한정** — `/reset-password` 외의 요청에는 실리지 않는다.
 *   3. **복구 세션에서만 발급** — OAuth·비밀번호 로그인으로는 생기지 않는다.
 *   4. **짧은 TTL** — 잊힌 의도가 오래 남지 않는다.
 */

export const PASSWORD_RESET_COOKIE = "password_reset_intent";

/** 이 쿠키가 실리는 유일한 경로. */
export const PASSWORD_RESET_PATH = "/reset-password";

/**
 * 10분. 링크를 누르고 새 비밀번호를 정하는 데 충분하고, 잊힌 의도가 같은
 * 브라우저의 다음 사용을 오염시킬 만큼 길지 않다.
 */
export const PASSWORD_RESET_COOKIE_MAX_AGE = 600;

/** 값 자체에는 의미가 없다 — 존재 여부가 곧 의도다. */
const INTENT_VALUE = "1";

/**
 * 교환된 세션이 **복구 링크에서 온 것인가.**
 *
 * GoTrue 는 access token 의 `amr`(authentication methods references)에 인증
 * 수단을 남긴다. staging 에서 직접 비교했다.
 *
 *   비밀번호 로그인   amr = [{ "method": "password", … }]
 *   복구 링크 세션    amr = [{ "method": "otp", … }]
 *   OAuth 로그인      amr = [{ "method": "oauth", … }]
 *
 * 토큰은 우리가 Supabase 에 직접 요청해 받은 것이므로 서명 검증 없이 payload
 * 만 읽는다. 검증은 Supabase 가 이미 했고, 여기서 하는 판단은 "인가" 가 아니라
 * "이 세션이 어떤 경로로 생겼나" 다.
 *
 * `otp` 는 매직링크에도 쓰인다. 이 앱은 매직링크를 쓰지 않지만(`signInWithOtp`
 * 호출 0건), 그 사실에만 기대지 않으려고 의도 쿠키와 **함께** 쓴다. 나중에
 * 매직링크가 생겨도 이 함수만 좁히면 된다.
 */
export function isRecoverySession(
  accessToken: string | null | undefined
): boolean {
  if (typeof accessToken !== "string") return false;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return false;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const claims = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    ) as { amr?: unknown };

    if (!Array.isArray(claims.amr)) return false;
    return claims.amr.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { method?: unknown }).method === "otp"
    );
  } catch {
    // 읽을 수 없으면 복구가 아니라고 본다. 모를 때 열어주면 그게 구멍이다.
    return false;
  }
}

type IntentCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

/**
 * 쿠키의 **유일한** 정의. 이름·값·속성을 한 덩어리로 돌려준다.
 *
 * `account-link-intent` 가 겪은 것과 같은 이유다 — 발급하는 곳과 지우는 곳이
 * 속성을 따로 적으면, 한쪽만 바뀌었을 때 삭제가 조용히 실패한다.
 */
export function passwordResetIntentCookie(secure: boolean): IntentCookie {
  return {
    name: PASSWORD_RESET_COOKIE,
    value: INTENT_VALUE,
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: PASSWORD_RESET_PATH,
      maxAge: PASSWORD_RESET_COOKIE_MAX_AGE,
    },
  };
}

/** 소비 후 지우는 쿠키. **발급과 같은 정의에서 나온다.** */
export function clearPasswordResetIntentCookie(secure: boolean): IntentCookie {
  const issued = passwordResetIntentCookie(secure);
  return {
    name: issued.name,
    value: "",
    options: { ...issued.options, maxAge: 0 },
  };
}

/** 쿠키 값 하나가 유효한 의도인가. */
export function hasPasswordResetIntent(
  raw: string | null | undefined
): boolean {
  return raw === INTENT_VALUE;
}
