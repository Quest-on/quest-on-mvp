/**
 * SQL-first 마이그레이션 적용 플래너 (G004)
 *
 * 안전을 위해 in-process 로 SQL 을 쪼개 실행하지 않는다(함수 본문의 `;` 등으로 깨지기 쉬움).
 * 대신 결정적 "적용 계획"과 운영자가 실행할 psql 명령 + ledger SQL 을 emit 한다.
 * 실제 DB 적용은 운영자가 psql 로 수행(런북: docs/staging/rollout-runbook.md).
 *
 * 모드:
 *   (기본) --dry-run     : 순서/분류/checksum 계획만 출력(DB 불필요, 지금 검증 가능).
 *   --emit-apply --confirm-ref <ref>  : 새 DB 에 적용할 psql 시퀀스 + ledger insert emit(env 가드).
 *   --emit-adopt --confirm-ref <ref>  : 기존 DB 채택 — 본문 미실행, ledger mark 만 emit(파괴적 SQL 보호).
 *
 * emit 모드 env: NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL), DATABASE_URL(교차검증용, 선택)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildOrderedManifest,
  LEDGER_TABLE_SQL,
  MIGRATION_ADVISORY_LOCK_KEY,
  type BuildInput,
} from "@/lib/staging/sql-manifest";
import { assertSupabaseTarget } from "@/lib/env-target";

function collectSqlFiles(): BuildInput[] {
  const out: BuildInput[] = [];
  for (const dir of ["database", "sql"]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".sql")) continue;
      const path = `${dir}/${name}`;
      out.push({ path, content: readFileSync(join(process.cwd(), path), "utf8") });
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const emitApply = argv.includes("--emit-apply");
  const emitAdopt = argv.includes("--emit-adopt");
  const refIdx = argv.indexOf("--confirm-ref");
  const confirmRef = refIdx >= 0 ? argv[refIdx + 1] ?? null : null;

  const manifest = buildOrderedManifest(collectSqlFiles());

  if (!emitApply && !emitAdopt) {
    console.log("[apply-sql] DRY-RUN — 적용 계획(순서/분류/concurrent/adoptedOnly/checksum):");
    for (const e of manifest) {
      const flags = [e.concurrent ? "CONCURRENTLY(txn밖)" : "", e.adoptedOnly ? "adopted-only" : ""]
        .filter(Boolean)
        .join(",");
      console.log(`  ${String(e.order).padStart(2, "0")}  ${e.className.padEnd(9)}  ${e.path}  ${e.checksum.slice(0, 12)}  ${flags}`);
    }
    console.log(`[apply-sql] 총 ${manifest.length}개. emit 하려면 --emit-apply|--emit-adopt --confirm-ref <ref>.`);
    return;
  }

  // ── emit 모드: env 타깃 가드 ──────────────────────────────────────────────
  if (!confirmRef) throw new Error("[apply-sql] --emit-apply/--emit-adopt 에는 --confirm-ref <ref> 가 필요합니다.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("[apply-sql] NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL) 환경변수가 필요합니다.");
  assertSupabaseTarget({
    url,
    databaseUrl: process.env.DATABASE_URL,
    context: "script",
    expectedRef: confirmRef,
  });

  console.log(`-- target ref=${confirmRef}  mode=${emitAdopt ? "ADOPT(본문 미실행)" : "APPLY"}`);
  console.log(`-- 1) ledger 테이블 보장 + advisory lock`);
  console.log(LEDGER_TABLE_SQL.trim());
  console.log(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY});`);
  console.log("");

  for (const e of manifest) {
    const ledgerInsert =
      `INSERT INTO public.queston_migration_ledger(path, checksum, class, adopted) ` +
      `VALUES ('${e.path}', '${e.checksum}', '${e.className}', ${emitAdopt || e.adoptedOnly}) ` +
      `ON CONFLICT (path) DO NOTHING;`;

    if (emitAdopt || e.adoptedOnly) {
      console.log(`-- [${e.order}] ${e.path}  (mark-applied-after-verify, 본문 미실행)`);
      console.log(ledgerInsert);
    } else if (e.concurrent) {
      console.log(`-- [${e.order}] ${e.path}  (CONCURRENTLY — 트랜잭션 밖에서 별도 실행)`);
      console.log(`-- psql "$DATABASE_URL" -f ${e.path}`);
      console.log(ledgerInsert);
    } else {
      console.log(`-- [${e.order}] ${e.path}`);
      console.log(`\\i ${e.path}`);
      console.log(ledgerInsert);
    }
    console.log("");
  }
  console.log(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_KEY});`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
