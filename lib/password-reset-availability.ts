/**
 * 비밀번호 재설정 기능을 사용자에게 열 것인가 (이슈 #318).
 *
 * 지금은 닫는다. 리뷰 네 번 동안 매번 수정이 새 구멍을 만들었고, 남은 셋
 * (의도 쿠키가 사용자에 묶이지 않음, 쿠키 미소비, `amr: otp` 가 매직링크와
 * 구분되지 않음 — #456)은 패치가 아니라 위협 모델부터 다시 써야 풀린다.
 * 그 사이 이 기능 때문에 다른 변경의 승격을 멈출 수는 없어서, 코드는 남기고
 * 도달만 막는다.
 *
 * 이 값 하나가 막는 곳:
 *
 *   - `/sign-in` 의 "비밀번호를 잊으셨나요?" 링크 (`CustomSignIn`)
 *   - `/forgot-password` · `/reset-password` 페이지 (404)
 *   - `POST /api/auth/password-reset` (404 — 재설정 메일을 보내지 않는다)
 *   - `/auth/callback` 의 복구 분기 (의도 쿠키를 심지 않는다)
 *   - `proxy.ts` 의 의도 쿠키 예외
 *
 * 공개 라우트 목록(`proxy.ts` · `consent-route-policy`)에서는 빼지 않는다.
 * 다시 열 때 그 두 곳을 빠뜨린 게 처음 배포가 한 번도 동작하지 않은 원인이었다
 * — 이 값만 뒤집으면 전부 돌아오게 둔다.
 */
export function isPasswordResetEnabled(): boolean {
  return false;
}
