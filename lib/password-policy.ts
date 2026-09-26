/**
 * 비밀번호 정책 한 곳.
 *
 * 예전엔 `components/settings/ChangePasswordForm.tsx` 안에 `MIN_PASSWORD_LENGTH = 8`
 * 이 혼자 있었다. 비밀번호를 설정하는 화면이 하나뿐일 땐 문제가 안 됐지만,
 * 재설정 화면(#318)이 생기면서 같은 숫자가 두 곳에 놓이게 됐다. 그런 쌍은 한쪽만
 * 고쳐지고, 그러면 "8자 이상" 이라고 써 놓고 7자를 받는 화면이 생긴다.
 *
 * 참고 — Supabase 프로젝트 설정의 `password_min_length` 는 staging·프로덕션 모두
 * 6 이다. 즉 서버가 강제하는 하한보다 앱이 더 빡빡하다. 앱 쪽이 느슨해지면
 * 서버가 안 막아주므로, 이 상수는 서버 설정과 별개로 지켜야 한다.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * 상한 — **UTF-8 바이트**다. Supabase(GoTrue)가 bcrypt 한계에 맞춰
 * `len(password) > 72` 로 거절하고, Go 의 `len` 은 바이트를 센다. 한글은 한
 * 글자가 3바이트라 24자가 끝이다. 글자 수로 세면 화면은 통과시키고 서버는
 * 거절해, 사용자는 원인 모를 실패를 본다.
 */
export const PASSWORD_MAX_BYTES = 72;

/** 비밀번호 쌍 검증 결과 — 화면이 next-intl 키로 바꿔 쓴다. */
export type PasswordPairError =
  | "newPasswordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | null;

/** 문구 키가 쓰는 값. 두 화면이 같은 값을 넘기게 한 곳에 둔다. */
export const PASSWORD_MESSAGE_VALUES = {
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_BYTES,
} as const;

const utf8 = new TextEncoder();

/**
 * 새 비밀번호 + 확인란을 검증한다.
 *
 * 순서가 의미를 갖는다: 길이를 먼저 본다. 둘 다 틀렸을 때 "일치하지 않습니다"
 * 를 먼저 보여주면, 사용자가 확인란을 고친 뒤에야 길이 문제를 알게 된다.
 *
 * 서버 라우트도 `validatePasswordPair(p, p)` 로 같은 규칙을 쓴다.
 */
export function validatePasswordPair(
  password: string,
  confirm: string
): PasswordPairError {
  if (password.length < PASSWORD_MIN_LENGTH) return "newPasswordTooShort";
  if (utf8.encode(password).length > PASSWORD_MAX_BYTES) return "passwordTooLong";
  if (password !== confirm) return "passwordMismatch";
  return null;
}

/**
 * `updateUser({ password })` 실패를 화면 문구 키로 옮긴다 (#447).
 *
 * SDK 의 `error.message` 는 영문 원문이라 그대로 띄우지 않는다.
 *
 * - `reauthentication_needed` — Supabase "Secure password change" 가 켜져 있고
 *   세션이 24시간보다 오래됐다. 다시 로그인하면 풀린다.
 * - `weak_password` — 서버 하한(Supabase `password_min_length`, #461)에 걸렸다.
 *   화면 검증과 같은 값이라 보통은 여기까지 오지 않는다.
 */
export type PasswordUpdateErrorKey =
  | "reauthRequired"
  | "newPasswordTooShort"
  | "updateFailed";

export function passwordUpdateErrorKey(
  code: string | undefined
): PasswordUpdateErrorKey {
  if (code === "reauthentication_needed") return "reauthRequired";
  if (code === "weak_password") return "newPasswordTooShort";
  return "updateFailed";
}
