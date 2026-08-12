/**
 * 환경변수 매니페스트 — 어떤 변수가 어느 환경에서 필수인지 한 곳에 적는다.
 *
 * 소비자:
 *   - `/api/health` (관리자 진단): 배포된 환경에 뭐가 빠졌는지
 *   - `scripts/setup-staging-env.mjs`: 스테이징에 주입할 목록
 *   - `.env.example` / `.env.staging.example`: 사람이 읽는 사본
 *
 * 값(시크릿)은 절대 여기 넣지 않는다. 이름과 정책만 둔다.
 */

import type { AppEnv } from "./app-env";

export type EnvLevel = "required" | "recommended" | "optional" | "forbidden";

export type EnvSpec = {
  name: string;
  purpose: string;
  /** 환경별 정책. 지정하지 않은 환경은 "optional". */
  levels: Partial<Record<AppEnv, EnvLevel>>;
};

const ALL_DEPLOYED: Partial<Record<AppEnv, EnvLevel>> = {
  production: "required",
  staging: "required",
};

export const ENV_MANIFEST: readonly EnvSpec[] = [
  {
    name: "NEXT_PUBLIC_APP_ENV",
    purpose:
      "런타임 환경 선언. 스테이징을 별도 Vercel 프로젝트로 두면 VERCEL_ENV=production 이라 이 값이 없으면 프로덕션으로 오인된다.",
    levels: { staging: "required", production: "optional" },

  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    purpose:
      "이 배포의 안정 도메인. QStash 콜백/절대 URL 생성 기준 (배포마다 바뀌는 VERCEL_URL 폴백 방지).",
    levels: ALL_DEPLOYED,

  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    purpose: "Supabase 프로젝트 URL. 스테이징은 프로덕션과 다른 프로젝트여야 한다.",
    levels: { production: "required", staging: "required", development: "required" },

  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    purpose: "브라우저 Supabase 클라이언트 / 인증 세션 키.",
    levels: { production: "required", staging: "required", development: "required" },

  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    purpose: "서버 런타임 쿼리(getSupabaseServer). RLS 우회 키 — 절대 클라이언트 노출 금지.",
    levels: { production: "required", staging: "required", development: "required" },
  },
  {
    name: "DATABASE_URL",
    purpose: "Prisma 스키마 조회/마이그레이션 도구용 직접 연결 문자열.",
    levels: { production: "recommended", staging: "recommended" },
  },
  {
    name: "OPENAI_API_KEY",
    purpose: "AI 출제/채점 호출. 스테이징은 예산 한도를 건 별도 키를 쓴다.",
    levels: { production: "required", staging: "required", development: "recommended" },
  },
  {
    name: "CONSENT_SUBJECT_HMAC_KEY_V1",
    purpose:
      "동의 원장의 subject_ref 파생 키(base64 32바이트 이상). 원장은 user_id 대신 HMAC 값만 저장한다. " +
      "분실하면 기존 원장의 재식별 경로가 영구 소실되므로 환경별 escrow 와 복구 리허설이 필요하다. " +
      "기존 원장 만료 전 회전 금지. repo/DB/로그에 절대 남기지 않는다.",
    levels: { production: "required", staging: "required", development: "required" },
  },
  {
    name: "ADMIN_USERNAME",
    purpose: "관리자 로그인 ID.",
    levels: ALL_DEPLOYED,
  },
  {
    name: "ADMIN_PASSWORD",
    purpose: "관리자 로그인 비밀번호.",
    levels: ALL_DEPLOYED,
  },
  {
    name: "ADMIN_SESSION_SECRET",
    purpose: "관리자 세션 서명키. 미설정 시 프로덕션에서 admin-auth 가 throw 한다.",
    levels: ALL_DEPLOYED,
  },
  {
    name: "INTERNAL_API_SECRET",
    purpose: "/api/internal/* 호출 인증 헤더 (x-internal-secret).",
    levels: ALL_DEPLOYED,
  },
  {
    name: "CRON_SECRET",
    purpose:
      "Vercel Cron bearer 토큰. 미설정 시 배포 환경(VERCEL=1)에서 cron 라우트가 전부 401 로 닫힌다.",
    levels: ALL_DEPLOYED,
  },
  {
    name: "QSTASH_TOKEN",
    purpose: "채점 작업 발행. 없으면 배포 환경에서 채점이 큐잉되지 않는다.",
    levels: { production: "required", staging: "recommended" },
  },
  {
    name: "QSTASH_CURRENT_SIGNING_KEY",
    purpose:
      "QStash 워커 서명 검증. 없으면 배포 환경에서 워커 라우트가 fail-closed 로 거부된다.",
    levels: { production: "required", staging: "recommended" },
  },
  {
    name: "QSTASH_NEXT_SIGNING_KEY",
    purpose: "QStash 서명키 로테이션 대비 키.",
    levels: { production: "required", staging: "recommended" },
  },
  {
    name: "QSTASH_WORKER_BASE_URL",
    purpose:
      "QStash 가 콜백할 베이스 URL. 미설정 시 NEXT_PUBLIC_APP_URL → VERCEL_URL 순으로 폴백.",
    levels: { production: "recommended", staging: "recommended" },
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    purpose: "레이트리밋/AI 캐시. 없으면 인스턴스별 in-memory 폴백(부정확).",
    levels: { production: "required", staging: "recommended" },
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    purpose: "Upstash Redis 인증 토큰.",
    levels: { production: "required", staging: "recommended" },
  },
  {
    name: "ALLOWED_ORIGINS",
    purpose:
      "CORS 허용 오리진. 미설정 시 프로덕션 기본 목록이 쓰이므로 스테이징은 반드시 자기 도메인을 선언해야 한다.",
    levels: { staging: "required", production: "optional" },
  },
  {
    name: "MEMORY_EXTRACTION_DISABLED",
    purpose: "교수 메모리 추출 워커 긴급 중지. 정확히 1일 때만 추출을 중지한다.",
    levels: {},
  },
  {
    name: "MEMORY_STORAGE_DISABLED",
    purpose: "교수 메모리 후보 저장 긴급 중지. 정확히 1일 때만 쓰기를 중지한다.",
    levels: {},
  },
  {
    name: "MEMORY_SELECTION_DISABLED",
    purpose: "교수 메모리 선택 긴급 중지. 정확히 1일 때 읽기를 중지한다.",
    levels: {},
  },
  {
    name: "MEMORY_RENDERING_DISABLED",
    purpose: "선택된 교수 메모리 블록 렌더링 긴급 중지. 정확히 1일 때만 중지한다.",
    levels: {},
  },
  {
    name: "MEMORY_INJECTION_ENABLED",
    purpose: "교수 메모리 프롬프트 주입 허용. shadow 기본값을 유지하며 정확히 1일 때만 켠다.",
    levels: {},
  },
  {
    name: "MEMORY_SCORE_PATH_INJECTION_ENABLED",
    purpose: "점수 생성 프롬프트의 교수 메모리 주입 추가 허용. 일반 주입도 함께 켜져야 한다.",
    levels: {},
  },
  {
    name: "MEMORY_QUARANTINED_EXTRACTOR_VERSION",
    purpose: "선택에서 제외할 교수 메모리 extractor_version. 저장 행은 변경하지 않는다.",
    levels: {},
  },
  {
    name: "TEST_BYPASS_SECRET",
    purpose:
      "E2E 인증 바이패스. 배포 환경(프로덕션·스테이징)에 존재하면 인증이 무력화되므로 금지 (코드도 throw 한다).",
    levels: { production: "forbidden", staging: "forbidden", test: "optional" },
  },
  {
    name: "NEXT_PUBLIC_TEST_BYPASS_ENABLED",
    purpose: "클라이언트 측 바이패스 활성 플래그. 배포 환경 금지.",
    levels: { production: "forbidden", staging: "forbidden", test: "optional" },

  },
];

export type EnvAudit = {
  appEnv: AppEnv;
  missingRequired: string[];
  missingRecommended: string[];
  forbiddenPresent: string[];
};

function levelFor(spec: EnvSpec, appEnv: AppEnv): EnvLevel {
  return spec.levels[appEnv] ?? "optional";
}

function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function auditEnv(
  env: Record<string, string | undefined>,
  appEnv: AppEnv
): EnvAudit {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const forbiddenPresent: string[] = [];

  for (const spec of ENV_MANIFEST) {
    const present = isSet(env[spec.name]);
    switch (levelFor(spec, appEnv)) {
      case "required":
        if (!present) missingRequired.push(spec.name);
        break;
      case "recommended":
        if (!present) missingRecommended.push(spec.name);
        break;
      case "forbidden":
        if (present) forbiddenPresent.push(spec.name);
        break;
      case "optional":
        break;
    }
  }

  return {
    appEnv,
    missingRequired,
    missingRecommended,
    forbiddenPresent,
  };
}

/** 배포를 막아야 하는 수준의 문제인가. recommended 누락은 healthy 로 본다. */
export function isEnvAuditHealthy(audit: EnvAudit): boolean {
  return audit.missingRequired.length === 0 && audit.forbiddenPresent.length === 0;
}

/**
 * dotenv 형식 최소 파서 (따옴표/주석/빈 줄 처리).
 * 감사 대상 파일을 읽을 때만 쓴다 — 값은 반환할 뿐 로깅하지 않는다.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}
