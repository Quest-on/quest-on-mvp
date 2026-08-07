/**
 * 런타임 환경 식별자 (single source of truth).
 *
 * 기존 코드는 환경 분기를 전부 `NODE_ENV === "production"` 으로 했다. Vercel 위에
 * 올라간 스테이징 배포도 `NODE_ENV=production` 이므로, 그 분기는 "프로덕션인가"가
 * 아니라 "빌드가 프로덕션 모드인가"만 뜻한다. 둘을 구분하지 않으면
 *
 *   - 스테이징에서 E2E 바이패스가 throw 하고 (lib/supabase-auth.ts)
 *   - 스테이징이 검색엔진에 색인되고
 *   - 프로덕션 전용 오리진/도메인 기본값이 스테이징에 그대로 적용된다.
 *
 * 해석 우선순위:
 *   1. NEXT_PUBLIC_APP_ENV — 명시 선언. 스테이징을 **별도 Vercel 프로젝트**로 두면
 *      그쪽도 VERCEL_ENV=production 이 되므로, 스테이징에서는 이 값이 필수다.
 *   2. VERCEL_ENV — preview 배포는 staging 으로 본다.
 *   3. NODE_ENV — 로컬/CI 폴백.
 *
 * 값이 오타면 조용히 폴백하지 않는다. `assertValidAppEnvDeclaration()` 이
 * next.config.ts 에서 빌드를 깨뜨린다 (스테이징이 프로덕션으로 오인되는 사고 방지).
 */

export const APP_ENVS = ["development", "test", "staging", "production"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

export type AppEnvInput = {
  NEXT_PUBLIC_APP_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

function parseDeclared(value: string | undefined): AppEnv | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (APP_ENVS as readonly string[]).includes(normalized)
    ? (normalized as AppEnv)
    : null;
}

export function resolveAppEnv(env: AppEnvInput): AppEnv {
  const declared = parseDeclared(env.NEXT_PUBLIC_APP_ENV);
  if (declared) return declared;

  switch (env.VERCEL_ENV) {
    case "production":
      return "production";
    case "preview":
      return "staging";
    case "development":
      return "development";
  }

  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "test") return "test";
  return "development";
}

/**
 * NEXT_PUBLIC_APP_ENV 가 설정됐는데 허용값이 아니면 에러 메시지를 돌려준다.
 * 빌드 타임(next.config.ts)에서 호출해 잘못된 선언으로 배포되는 걸 막는다.
 */
export function invalidAppEnvDeclaration(
  value: string | undefined
): string | null {
  if (!value || !value.trim()) return null;
  if (parseDeclared(value)) return null;
  return `NEXT_PUBLIC_APP_ENV="${value}" is not a valid app environment. Use one of: ${APP_ENVS.join(", ")}.`;
}

/**
 * NEXT_PUBLIC_* 은 빌드 시 인라인되므로 반드시 리터럴 접근으로 읽는다
 * (process.env[name] 같은 동적 접근은 클라이언트 번들에서 undefined 가 된다).
 */
export function getAppEnv(): AppEnv {
  return resolveAppEnv({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
}

/** 실제 사용자 데이터가 있는 환경인가. 보안 게이트는 전부 이걸 기준으로 fail-closed. */
export function isProductionApp(): boolean {
  return getAppEnv() === "production";
}

export function isStagingApp(): boolean {
  return getAppEnv() === "staging";
}

/**
 * 테스트 바이패스(TEST_BYPASS_SECRET) 를 켤 수 있는 환경인가.
 *
 * 스테이징은 **허용하지 않는다**. 스테이징에는 Vercel 계정이 없는 외부 QA 참여자가
 * 실제 도메인으로 들어오므로, 인증 경로가 프로덕션과 100% 같아야 한다. 헤더/쿠키
 * 하나로 임의 사용자가 되는 문은 로컬과 CI 에만 존재한다.
 */
export function isAuthBypassAllowedEnv(): boolean {
  const appEnv = getAppEnv();
  return appEnv === "development" || appEnv === "test";
}
