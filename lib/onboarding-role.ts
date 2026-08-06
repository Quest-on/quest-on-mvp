/**
 * 가입 시점의 역할 의도 해석 (이슈 #81 / AC-1 / ADR-006).
 *
 * 라우팅 권위는 `profiles.role` 이다(`lib/supabase-auth.ts`). 여기서 다루는 것은
 * "가입할 때 무엇을 고르려 했는가"라는 **의도**이며, 온보딩에서 같은 질문을
 * 두 번 하지 않기 위해서만 쓴다. 인가 판단에 쓰면 안 된다 —
 * `user_metadata` 는 `supabase.auth.updateUser()` 로 사용자가 직접 고칠 수 있다.
 *
 * 경로별 의도 저장 위치:
 * - 이메일 가입: `signUp({ options: { data: { role } } })` → auth `user_metadata.role`
 * - OAuth 가입: `signInWithOAuth` 가 `data` 옵션을 지원하지 않는다.
 *   리다이렉트가 프론트엔드 상태를 파괴하므로 서버가 읽는 단명 쿠키로 전달한다.
 *   **쿠키를 쓰는 쪽은 #87 이다.** 그전까지 OAuth 사용자는 의도가 해석되지 않아
 *   역할 단계를 그대로 보게 되며, 이는 기존 동작과 같아 안전하다.
 */

export const ONBOARDING_ROLE_COOKIE = "onboarding_role";

export type SignupRole = "instructor" | "student";

export function isSignupRole(value: unknown): value is SignupRole {
  return value === "instructor" || value === "student";
}

/**
 * `document.cookie` 문자열에서 역할 의도 쿠키를 읽는다.
 * 형식이 어긋나거나 값이 역할이 아니면 null 을 돌려준다.
 */
export function readRoleCookie(cookieString: string | undefined | null): SignupRole | null {
  if (!cookieString) return null;

  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ONBOARDING_ROLE_COOKIE) continue;

    let raw = part.slice(eq + 1).trim();
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // 잘못 인코딩된 값은 원문으로 판정한다 — 어차피 아래에서 걸러진다.
    }
    return isSignupRole(raw) ? raw : null;
  }

  return null;
}

/**
 * 역할 의도를 해석한다 (AC-1).
 *
 * 우선순위는 auth metadata → 쿠키. metadata 는 가입 시점에 서버가 받은 값이라
 * 쿠키보다 신뢰도가 높다.
 *
 * **해석할 수 없으면 null 을 돌려준다.** 호출부는 이때 역할 단계를 보여줘야 한다.
 * 추측해서 건너뛰면 잘못된 역할로 계정이 굳는다.
 */
export function resolveSignupRole(sources: {
  metadataRole?: unknown;
  cookieString?: string | null;
}): SignupRole | null {
  if (isSignupRole(sources.metadataRole)) return sources.metadataRole;
  return readRoleCookie(sources.cookieString);
}
