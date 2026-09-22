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

/** 비밀번호 쌍 검증 결과 — 화면이 next-intl 키로 바꿔 쓴다. */
export type PasswordPairError =
  | "newPasswordTooShort"
  | "passwordMismatch"
  | null;

/**
 * 새 비밀번호 + 확인란을 검증한다.
 *
 * 순서가 의미를 갖는다: 길이를 먼저 본다. 둘 다 틀렸을 때 "일치하지 않습니다"
 * 를 먼저 보여주면, 사용자가 확인란을 고친 뒤에야 길이 문제를 알게 된다.
 */
export function validatePasswordPair(
  password: string,
  confirm: string
): PasswordPairError {
  if (password.length < PASSWORD_MIN_LENGTH) return "newPasswordTooShort";
  if (password !== confirm) return "passwordMismatch";
  return null;
}
