/**
 * SQL-first 마이그레이션 매니페스트 로직 (G004) — 순수 함수, 단위 테스트 대상.
 *
 * 적용 순서: 000_baseline → database/NNN_*.sql(번호 오름차순) → database 비번호 legacy(이름순)
 *           → sql/*.sql(함수/RPC, 이름순).
 * 분류:
 *  - concurrent: `CREATE INDEX CONCURRENTLY` 포함 → 트랜잭션 밖에서 실행해야 함.
 *  - adoptedOnly: 파일 상단 `-- migration: historical-adopted-only` 지시어 →
 *    기존 DB 채택 시 본문 실행 없이 ledger 에 mark 만 함(파괴적/비멱등 SQL 보호).
 *  - checksum: 적용 후 ledger 에 기록, 재실행 시 동일 checksum 은 skip.
 */
import { createHash } from "node:crypto";

export type MigrationClass = "baseline" | "numbered" | "legacy" | "function";

export interface ManifestEntry {
  path: string;
  order: number;
  className: MigrationClass;
  concurrent: boolean;
  adoptedOnly: boolean;
  checksum: string;
}

export interface BuildInput {
  path: string;
  content: string;
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isConcurrent(sql: string): boolean {
  return /create\s+index\s+concurrently/i.test(sql);
}

/** 파일 상단 `-- migration: <directive>` 추출 */
export function parseDirective(sql: string): string | null {
  const m = sql.match(/--\s*migration:\s*([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function numericPrefix(path: string): number | null {
  const m = baseName(path).match(/^(\d+)[_-]/);
  return m ? parseInt(m[1], 10) : null;
}

interface Ranked extends ManifestEntry {
  _group: number;
  _sub: number;
  _base: string;
}

export function buildOrderedManifest(files: BuildInput[]): ManifestEntry[] {
  const ranked: Ranked[] = files.map((f) => {
    const base = baseName(f.path);
    let className: MigrationClass;
    let group: number;
    let sub = 0;

    if (base === "000_baseline.sql") {
      className = "baseline";
      group = 0;
    } else if (f.path.startsWith("sql/")) {
      className = "function";
      group = 3;
    } else {
      const n = numericPrefix(base);
      if (n !== null) {
        className = "numbered";
        group = 1;
        sub = n;
      } else {
        className = "legacy";
        group = 2;
      }
    }

    return {
      path: f.path,
      order: 0,
      className,
      concurrent: isConcurrent(f.content),
      adoptedOnly: parseDirective(f.content) === "historical-adopted-only",
      checksum: sha256Hex(f.content),
      _group: group,
      _sub: sub,
      _base: base,
    };
  });

  ranked.sort((a, b) => a._group - b._group || a._sub - b._sub || a._base.localeCompare(b._base));

  return ranked.map((e, i) => ({
    path: e.path,
    order: i,
    className: e.className,
    concurrent: e.concurrent,
    adoptedOnly: e.adoptedOnly,
    checksum: e.checksum,
  }));
}

/** ledger 테이블 DDL (성공 후 row insert). 적용 스크립트가 사용. */
export const LEDGER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.queston_migration_ledger (
  path text PRIMARY KEY,
  checksum text NOT NULL,
  class text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  adopted boolean NOT NULL DEFAULT false
);`;

/** advisory lock 키(동시 마이그레이션 방지) */
export const MIGRATION_ADVISORY_LOCK_KEY = 873214567;
