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
 * 감사 대상(파일 또는 셸 환경)의 선언이 요청한 환경과 어긋나는지 검사한다.
 *
 * `npm run env:check -- --env staging --file .env.staging` 은 "이 파일을 스테이징
 * 정책으로 감사하라"는 뜻인데, 정작 파일 안에 `NEXT_PUBLIC_APP_ENV=production` 이
 * 들어 있으면 감사만 통과하고 실제 배포는 프로덕션으로 뜬다 — 색인 허용,
 * 배지 없음, 프로덕션 CORS 기본값. 프리플라이트가 막으려던 상황이 그대로 난다.
 *
 * 선언이 아예 없으면 어긋남이 아니다(프로덕션은 선언이 선택 사항이다).
 */
export function appEnvDeclarationConflict(
  declared: string | undefined,
  requested: AppEnv
): string | null {
  if (!declared || !declared.trim()) return null;

  const invalid = invalidAppEnvDeclaration(declared);
  if (invalid) return invalid;

  const parsed = parseDeclared(declared);
  if (parsed === requested) return null;

  return `NEXT_PUBLIC_APP_ENV="${declared.trim()}" contradicts the requested environment "${requested}". The deployment would honor "${parsed}".`;
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

/**
 * 테스트 바이패스(TEST_BYPASS_SECRET) 를 켤 수 있는 환경인가.
 *
 * 두 단계로 막는다.
 *
 * 1. **배포 신호 hard-deny.** `VERCEL`/`VERCEL_ENV` 가 있거나 `NODE_ENV=production`
 *    이면 라벨이 뭐라고 적혀 있든 무조건 거부한다. `NEXT_PUBLIC_APP_ENV` 는 사람이
 *    Vercel 대시보드에 손으로 넣는 값이라 `development` 나 `test` 로 잘못 들어갈 수
 *    있는데, 그 오타 하나가 인증 바이패스를 여는 일은 없어야 한다. 이 신호들은
 *    플랫폼이 주입하므로 라벨보다 신뢰도가 높다.
 * 2. 그다음 APP_ENV 가 development/test 일 때만 허용.
 *
 * 스테이징도 허용하지 않는다. 스테이징에는 Vercel 계정이 없는 외부 QA 참여자가
 * 실제 도메인으로 들어오므로, 인증 경로가 프로덕션과 100% 같아야 한다. 헤더/쿠키
 * 하나로 임의 사용자가 되는 문은 로컬과 CI 에만 존재한다.
 */
export function isAuthBypassAllowedEnv(): boolean {
  // 플랫폼이 주입하는 배포 신호. 라벨보다 우선한다.
  // VERCEL_ENV 는 **존재 여부**로 판정한다. Vercel 은 항상 값을 채우므로,
  // 빈 문자열이라면 사람이 손으로 넣었다는 뜻이고 그건 신뢰할 근거가 못 된다.
  if (process.env.VERCEL) return false;
  if (process.env.VERCEL_ENV !== undefined) return false;
  if (process.env.NODE_ENV === "production") return false;

  const appEnv = getAppEnv();
  return appEnv === "development" || appEnv === "test";
}
