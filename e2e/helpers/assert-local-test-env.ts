import fs from "fs";
import path from "path";

/**
 * DB 안전 멈춤 규칙 (AGENTS.md) 의 코드 강제.
 *
 * 이 저장소의 E2E/API 테스트는 실제 Postgres 에 DDL 을 적용하고 seed·cleanup 을 돌린다.
 * 그 대상이 개발자의 실서비스 DB 로 잡히면 복구 불가능한 데이터 손실이 난다.
 *
 * 기존 `global-setup.ts` 는 `.env.test` 를 dotenv 로 읽기만 하고 호스트를 검사하지 않았다.
 * 즉 `.env.test` 에 원격 URL 이 들어 있으면 그대로 원격을 파괴한다(fail-open).
 * 이 헬퍼는 그 경로를 fail-closed 로 바꾼다.
 *
 * 세 조건을 모두 만족하지 못하면 **DB 에 접속하기 전에** throw 한다.
 *   1. 저장소 루트에 `.env.test` 가 존재한다
 *   2. `DISPOSABLE_LOCAL_DB_CONFIRMED === "1"` (폐기 가능한 로컬 DB 임을 사람이 명시 확인)
 *   3. `NEXT_PUBLIC_SUPABASE_URL` 과 `DATABASE_URL` 의 host 가 localhost / 127.0.0.1
 *
 * `.env.local` 은 절대 읽지 않는다. 그 파일은 실서비스 자격증명을 담는다.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const ENV_TEST_PATH = path.join(REPO_ROOT, ".env.test");

/** 로컬로 인정하는 host 목록. IPv6 루프백까지 포함한다. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class LocalTestEnvError extends Error {
  constructor(message: string) {
    super(
      `${message}\n\n` +
        `DB 안전 멈춤 규칙에 의해 중단했다 (AGENTS.md).\n` +
        `테스트는 폐기 가능한 로컬 Supabase 에서만 실행한다.\n` +
        `해결: supabase start 로 로컬 스택을 띄우고 저장소 루트에 .env.test 를 만든 뒤\n` +
        `DISPOSABLE_LOCAL_DB_CONFIRMED=1 을 설정한다. .env.local 은 절대 사용하지 않는다.`,
    );
    this.name = "LocalTestEnvError";
  }
}

/** URL 문자열에서 host 를 뽑는다. postgres:// 도 URL 로 파싱된다. */
function extractHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

function assertLocalUrl(varName: string, rawUrl: string | undefined): void {
  if (!rawUrl || rawUrl.trim() === "") {
    throw new LocalTestEnvError(`${varName} 이(가) 비어 있다.`);
  }

  const host = extractHost(rawUrl);
  if (host === null) {
    throw new LocalTestEnvError(`${varName} 을(를) URL 로 파싱할 수 없다.`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    // 값 전체를 찍으면 자격증명이 로그에 남는다. host 만 노출한다.
    throw new LocalTestEnvError(
      `${varName} 의 host 가 로컬이 아니다: ${host}. 원격 DB 에 테스트를 실행할 수 없다.`,
    );
  }
}

/**
 * 세 조건을 검사한다. 하나라도 어긋나면 throw.
 * DB 클라이언트 생성·마이그레이션·seed·cleanup 보다 **먼저** 호출해야 한다.
 */
export function assertLocalTestEnv(): void {
  if (!fs.existsSync(ENV_TEST_PATH)) {
    throw new LocalTestEnvError(`.env.test 가 저장소 루트에 없다: ${ENV_TEST_PATH}`);
  }

  if (process.env.DISPOSABLE_LOCAL_DB_CONFIRMED !== "1") {
    throw new LocalTestEnvError(
      `DISPOSABLE_LOCAL_DB_CONFIRMED 가 "1" 이 아니다. ` +
        `이 DB 를 지워도 되는지 사람이 확인해야 한다.`,
    );
  }

  assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  assertLocalUrl("DATABASE_URL", process.env.DATABASE_URL);
}

/** 테스트에서 조건 충족 여부만 알고 싶을 때 쓴다. throw 하지 않는다. */
export function isLocalTestEnvSatisfied(): boolean {
  try {
    assertLocalTestEnv();
    return true;
  } catch {
    return false;
  }
}
