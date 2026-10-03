/**
 * 비밀번호 재설정 기능을 사용자에게 열 것인가 (이슈 #318).
 *
 * 리뷰 네 번 동안 매번 수정이 새 구멍을 만들어 한동안 `return false` 로 닫아
 * 뒀다. 남은 셋(의도 쿠키가 사용자에 묶이지 않음, 쿠키 미소비, `amr: otp` 가
 * 매직링크와 구분되지 않음 — #456)은 위협 모델을 다시 써서 풀었다
 * (`lib/password-reset-intent.ts`). 새 설계는 **staging 에서만** 연다.
 * production 은 staging 실측 뒤 별도 승인으로 연다 — 이 파일의 목록에
 * `production` 을 넣는 한 줄이 그 승인이다.
 *
 * ## 무엇을 근거로 환경을 보는가
 *
 * `getAppEnv()` 를 쓰지 않는다. 그건 선언이 없으면 `VERCEL_ENV` 로 폴백하는데,
 * 이 값은 **클라이언트 번들에 없다.** `CustomSignIn`(클라이언트)과 서버가 같은
 * 배포에서 다른 답을 내면 "링크는 보이는데 누르면 404" 가 된다. 그래서 양쪽이
 * 똑같이 읽는 두 값만 본다 — `NEXT_PUBLIC_APP_ENV`(빌드 때 박힌다)와
 * `NODE_ENV`.
 *
 *   - 선언이 있으면 선언만 본다. staging·development·test 에서 열린다.
 *   - 선언이 없으면 로컬 빌드(`NODE_ENV` development·test)에서만 열린다.
 *     선언 없는 production 빌드 — 프로덕션이든 선언을 빠뜨린 preview 든 —
 *     는 닫힌다. 모를 때 여는 게 이 기능이 매번 새던 방식이다.
 *
 * ## 이 값 하나가 막는 곳
 *
 *   - `/sign-in` 의 "비밀번호를 잊으셨나요?" 링크 (`CustomSignIn`)
 *   - `/forgot-password` · `/auth/recovery` · `/reset-password` 페이지 (404)
 *   - `POST /api/auth/password-reset` · `…/verify` · `…/complete` (404)
 *   - `proxy.ts` 의 의도 쿠키 예외
 *
 * 공개 라우트 목록(`proxy.ts` · `consent-route-policy`)에서는 빼지 않는다.
 * 처음 배포가 한 번도 동작하지 않은 원인이 그 두 곳을 빠뜨린 것이었다 —
 * 이 값만 뒤집으면 전부 돌아오게 둔다.
 */

type AvailabilityInput = {
  NEXT_PUBLIC_APP_ENV?: string;
  NODE_ENV?: string;
};

/** 선언이 있을 때 재설정이 열리는 환경. */
const OPEN_DECLARED_ENVS: readonly string[] = ["staging", "development", "test"];

/** 선언이 없을 때 재설정이 열리는 빌드 모드. */
const OPEN_UNDECLARED_NODE_ENVS: readonly string[] = ["development", "test"];

export function resolvePasswordResetEnabled(env: AvailabilityInput): boolean {
  const declared = env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (declared) return OPEN_DECLARED_ENVS.includes(declared);
  return OPEN_UNDECLARED_NODE_ENVS.includes(env.NODE_ENV ?? "");
}

export function isPasswordResetEnabled(): boolean {
  // 리터럴 접근이어야 클라이언트 번들에 값이 박힌다. 구조분해하면 undefined 다.
  return resolvePasswordResetEnabled({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
}
