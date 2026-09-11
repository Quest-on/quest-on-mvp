import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * AC-S4 — 025 마이그레이션과 Prisma 모델이 명세의 스키마 계약을 구조적으로 강제하는지
 * 검사한다. 이 테스트는 DB 에 붙지 않는다(정적 검사). live RLS/trigger 동작은
 * e2e/api/consent-schema-security.spec.ts 가 별도로 확인한다.
 *
 * 여기서 잡으려는 사고:
 *   · 원장에 user_id 나 ip_hash 가 슬그머니 다시 들어오는 것
 *   · append-only 를 애플리케이션 규율로만 두고 DB 강제를 빼먹는 것
 *   · anon/authenticated 에 권한이 열린 채 배포되는 것
 *   · 3년을 1095일 상수로 쓰는 것
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATION_PATH = path.join(REPO_ROOT, "database", "025_consent_records.sql");
const PRISMA_PATH = path.join(REPO_ROOT, "prisma", "schema.prisma");

const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
const prisma = fs.readFileSync(PRISMA_PATH, "utf-8");

/**
 * 주석을 제거한 SQL. 주석에 적힌 설명 문구가 검사에 걸리는 것을 막는다.
 * (예: "1095일 상수를 쓰면 안 된다" 라는 주석이 1095 금지 검사에 걸리는 문제)
 */
const sqlCode = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/** `CREATE TABLE ... public.<name> ( ... );` 본문만 잘라낸다. */
function tableBody(name: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
  expect(start, `${name} 테이블 정의를 찾지 못했다`).toBeGreaterThan(-1);
  const end = sql.indexOf("\n);", start);
  expect(end, `${name} 테이블 정의가 닫히지 않았다`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** prisma `model <name> { ... }` 본문만 잘라낸다. */
function prismaModel(name: string): string {
  const start = prisma.indexOf(`model ${name} {`);
  expect(start, `prisma model ${name} 을 찾지 못했다`).toBeGreaterThan(-1);
  const end = prisma.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return prisma.slice(start, end);
}

describe("025 consent schema — 업무 필드 계약", () => {
  const BUSINESS_FIELDS = [
    "subject_ref",
    "controller_type",
    "consent_key",
    "granted",
    "policy_version",
    "recorded_at",
  ] as const;

  it("consent_records 의 승인 업무 필드 6개가 전부 NOT NULL 이다", () => {
    const body = tableBody("consent_records");
    for (const field of BUSINESS_FIELDS) {
      const line = body
        .split("\n")
        .find((l) => new RegExp(`^\\s+${field}\\s`).test(l));
      expect(line, `${field} 컬럼이 없다`).toBeDefined();
      expect(line, `${field} 가 NOT NULL 이 아니다`).toContain("NOT NULL");
    }
  });

  it("surrogate id 는 DB 가 생성하는 PK 이며 업무 필드 검사 대상이 아니다", () => {
    // ARCH-06 은 Critic 반대검토로 기각됐다. id 는 개인정보도 클라이언트 payload 도
    // 아니고 append-only 를 훼손하지 않으며, 감사 시 특정 행을 지목하는 데 필요하다.
    const body = tableBody("consent_records");
    expect(body).toMatch(/id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  });

  it("금지 컬럼이 consent_records 에 없다", () => {
    const body = tableBody("consent_records");
    // user_id: Option C 의 핵심 — 원 식별자를 원장에 두지 않는다.
    // source/ip_hash/user_agent: 제16조 최소수집.
    // institution/tenant/contract: 기관 controller 분기는 이번 범위 밖.
    for (const forbidden of [
      "user_id",
      "source",
      "ip_hash",
      "user_agent",
      "institution",
      "tenant_id",
      "contract_id",
    ]) {
      expect(
        new RegExp(`^\\s+${forbidden}\\s`, "m").test(body),
        `consent_records 에 금지 컬럼 ${forbidden} 이 있다`,
      ).toBe(false);
    }
  });

  it("controller_type 은 DEFAULT 'platform' 이고 CHECK 로 고정된다", () => {
    const body = tableBody("consent_records");
    expect(body).toContain("controller_type text        NOT NULL DEFAULT 'platform'");
    expect(sql).toMatch(/CHECK \(controller_type = 'platform'\)/);
  });
});

describe("025 consent schema — append-only 불변식", () => {
  it("consent_records 의 UPDATE 를 trigger 가 거부한다", () => {
    expect(sql).toContain("consent_records is append-only: UPDATE is not permitted");
    expect(sql).toMatch(/CREATE TRIGGER trg_consent_records_no_update[\s\S]*BEFORE UPDATE ON public\.consent_records/);
  });

  it("consent_records 의 DELETE 는 purge 경로에서만 허용된다", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_consent_records_no_delete[\s\S]*BEFORE DELETE ON public\.consent_records/);
    // 세션 변수는 SECURITY DEFINER purge RPC 안에서만 켜진다.
    expect(sql).toContain("current_setting('app.consent_purge', true)");
    expect(sql).toContain("set_config('app.consent_purge', 'on', true)");
  });

  it("정책 릴리스는 UPDATE·DELETE 를 모두 거부한다", () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.consent_policy_releases/);
    expect(sql).toContain("consent_policy_releases is immutable");
  });

  it("025 는 최초 릴리스 seed 를 넣지 않는다 (027 이 소유)", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.consent_policy_releases/);
  });
});

describe("025 consent schema — 탈퇴와 보존", () => {
  it("탈퇴는 매핑 1행 DELETE 이며 원장을 건드리지 않는다", () => {
    const start = sql.indexOf("FUNCTION public.retire_consent_subject");
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("DELETE FROM public.consent_subject_map WHERE user_id = p_user_id");
    expect(
      /DELETE FROM public\.consent_records/.test(body),
      "탈퇴 경로가 원장을 삭제하려 한다",
    ).toBe(false);
  });

  it("3년 보존 기한을 달력 기준 interval 로 DB 가 강제한다", () => {
    expect(sql).toContain("CHECK (destroy_after = deleted_at + interval '3 years')");
    // 일(day) 단위 상수로 3년을 표현하면 윤년에서 어긋난다.
    // 주석은 제외하고 실제 SQL 코드만 검사한다.
    expect(sqlCode).not.toMatch(/interval\s+'\d+\s*days?'/i);
    expect(sqlCode).not.toContain("1095");
  });

  it("purge 는 dry-run 기본값을 갖는다", () => {
    expect(sql).toMatch(/p_dry_run boolean DEFAULT true/);
  });
});

describe("025 consent schema — 권한", () => {
  const TABLES = [
    "consent_records",
    "consent_subject_map",
    "consent_policy_releases",
    "consent_retention_index",
    "consent_purge_runs",
  ] as const;

  it("모든 consent 테이블에 RLS 가 켜져 있다", () => {
    for (const table of TABLES) {
      const enabled = new RegExp(
        `ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`,
      ).test(sqlCode);
      expect(enabled, `${table} 에 RLS 가 없다`).toBe(true);
    }
  });

  it("anon/authenticated 권한이 전부 회수된다", () => {
    for (const table of TABLES) {
      const revoked = new RegExp(
        `REVOKE ALL ON public\\.${table}\\s+FROM anon, authenticated`,
      ).test(sql);
      expect(revoked, `${table} 의 anon/authenticated 권한이 회수되지 않았다`).toBe(true);
    }
  });

  it("매핑과 보존 인덱스는 service_role 직접 권한도 회수된다", () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.consent_subject_map\s+FROM service_role/);
    expect(sql).toMatch(/REVOKE ALL ON public\.consent_retention_index\s+FROM service_role/);
  });

  it("전용 감사 role 은 SELECT 만 받는다", () => {
    expect(sql).toContain("CREATE ROLE consent_auditor NOLOGIN");
    expect(sql).toContain("GRANT SELECT ON public.consent_subject_map     TO consent_auditor");
    // 감사 role 에 쓰기 권한이 붙으면 안 된다.
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^\n]*TO consent_auditor/);
  });
});

describe("025 consent schema — Prisma 모델 일치", () => {
  it("5개 모델이 전부 존재한다", () => {
    for (const model of [
      "consent_records",
      "consent_subject_map",
      "consent_policy_releases",
      "consent_retention_index",
      "consent_purge_runs",
    ]) {
      expect(prisma, `prisma model ${model} 이 없다`).toContain(`model ${model} {`);
    }
  });

  it("Prisma consent_records 에도 금지 컬럼이 없다", () => {
    const model = prismaModel("consent_records");
    for (const forbidden of ["user_id", "ip_hash", "user_agent"]) {
      expect(
        new RegExp(`^\\s+${forbidden}\\s`, "m").test(model),
        `prisma consent_records 에 ${forbidden} 이 있다`,
      ).toBe(false);
    }
    expect(model).toContain("subject_ref");
  });

  it("Prisma 의 controller_type 기본값이 platform 이다", () => {
    expect(prismaModel("consent_records")).toContain('@default("platform")');
  });
});

describe("025 consent schema — 마이그레이션 형태", () => {
  it("단일 트랜잭션이다", () => {
    expect(sql.trimStart().startsWith("--") || sql.includes("BEGIN;")).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("025 가 database 디렉터리의 다음 순번이다", () => {
    const files = fs.readdirSync(path.join(REPO_ROOT, "database"));
    expect(files).toContain("025_consent_records.sql");
    const twentyFives = files.filter((f) => f.startsWith("025_"));
    expect(twentyFives).toHaveLength(1);
  });

  it("027 정책 seed도 database 디렉터리에서 유일한 순번이다", () => {
    const files = fs.readdirSync(path.join(REPO_ROOT, "database"));
    expect(files).toContain("027_seed_consent_policy_release.sql");
    expect(files.filter((file) => file.startsWith("027_"))).toHaveLength(1);
  });
});
