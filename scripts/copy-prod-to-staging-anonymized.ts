/**
 * prod → staging 익명화 단방향 복사 파이프라인 (G006)
 *
 * 안전 원칙:
 *  - 기본 모드는 --dry-run. 실제 쓰기는 --write --confirm-staging-ref <ref> 필수.
 *  - prod URL === staging URL 이면 즉시 중단. staging 이 prod ref 면 즉시 중단.
 *  - copy 대상 table 의 모든 column 이 SCRUB_ALLOWLIST 에 분류돼야 함(미분류 → 중단, PII 누출 방지).
 *  - raw/compressed mirror 둘 다 스크럽. write 전 sample PII scan.
 *  - 데이터 산출물 파일을 생성하지 않는다(메모리 내 처리, counts/stats 만 출력).
 *  - auth.users / auth.identities 는 read-source/classification 전용 — staging user 는 Admin API 로 생성.
 *
 * 실행 예:
 *   npx tsx scripts/copy-prod-to-staging-anonymized.ts            # dry-run
 *   npx tsx scripts/copy-prod-to-staging-anonymized.ts --write --confirm-staging-ref <ref> --limit 50
 *
 * 필수 env: PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE_KEY,
 *           STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { SCRUB_ALLOWLIST, scrubRow, findPiiLeaks } from "@/lib/staging/scrub";
import { extractSupabaseRef, assertNotProd, assertStagingTarget } from "@/lib/env-target";

interface Args {
  write: boolean;
  confirmStagingRef: string | null;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const write = argv.includes("--write");
  const refIdx = argv.indexOf("--confirm-staging-ref");
  const confirmStagingRef = refIdx >= 0 ? argv[refIdx + 1] ?? null : null;
  const limIdx = argv.indexOf("--limit");
  const limit = limIdx >= 0 ? Number(argv[limIdx + 1] ?? "100") : 100;
  return { write, confirmStagingRef, limit };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[copy] 필수 환경변수 누락: ${name}`);
  }
  return v;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const prodUrl = requireEnv("PROD_SUPABASE_URL");
  const prodKey = requireEnv("PROD_SUPABASE_SERVICE_ROLE_KEY");
  const stagingUrl = requireEnv("STAGING_SUPABASE_URL");
  const stagingKey = requireEnv("STAGING_SUPABASE_SERVICE_ROLE_KEY");

  // ── 안전 가드 (fail-closed) ──────────────────────────────────────────────
  const prodRef = extractSupabaseRef(prodUrl);
  const stagingRef = extractSupabaseRef(stagingUrl);
  if (!prodRef || !stagingRef) {
    throw new Error("[copy] prod/staging Supabase URL 에서 ref 를 해석할 수 없습니다.");
  }
  if (prodUrl === stagingUrl || prodRef === stagingRef) {
    throw new Error("[copy] prod 와 staging 이 동일 프로젝트입니다. 중단합니다.");
  }
  // staging 타깃이 prod ref 를 포함하면 중단
  assertNotProd(stagingUrl, [prodRef]);
  // --write 시 confirm-staging-ref 가 실제 staging ref 와 일치해야 함
  if (args.write) {
    if (!args.confirmStagingRef) {
      throw new Error("[copy] --write 에는 --confirm-staging-ref <ref> 가 필요합니다.");
    }
    assertStagingTarget(stagingUrl, args.confirmStagingRef);
  }

  const mode = args.write ? "WRITE" : "DRY-RUN";
  console.log(`[copy] mode=${mode} prodRef=${prodRef} stagingRef=${stagingRef} limit=${args.limit}`);

  const prod = createClient(prodUrl, prodKey, { auth: { persistSession: false } });
  const staging = createClient(stagingUrl, stagingKey, { auth: { persistSession: false } });

  const stats: Record<string, { read: number; scrubbed: number; written: number; piiHits: number }> = {};

  for (const [table, allow] of Object.entries(SCRUB_ALLOWLIST)) {
    const { data, error } = await prod.from(table).select("*").limit(args.limit);
    if (error) {
      console.error(`[copy] table ${table} 읽기 실패: ${error.message}`);
      continue;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    let piiHits = 0;
    const scrubbed = rows.map((row, i) => {
      const out = scrubRow(table, row, allow, `${table}:${i}`);
      const leaks = findPiiLeaks(JSON.stringify(out));
      if (leaks.length > 0) piiHits += 1;
      return out;
    });

    if (piiHits > 0) {
      throw new Error(
        `[copy] table ${table} 에서 스크럽 후에도 PII 패턴 ${piiHits}건 발견 — write 중단(allowlist 보강 필요).`
      );
    }

    let written = 0;
    if (args.write && scrubbed.length > 0) {
      const { error: upErr } = await staging.from(table).upsert(scrubbed);
      if (upErr) {
        console.error(`[copy] table ${table} 쓰기 실패: ${upErr.message}`);
      } else {
        written = scrubbed.length;
      }
    }
    stats[table] = { read: rows.length, scrubbed: scrubbed.length, written, piiHits: 0 };
  }

  console.log("[copy] 결과(파일 산출물 없음, counts only):");
  for (const [t, s] of Object.entries(stats)) {
    console.log(`  ${t}: read=${s.read} scrubbed=${s.scrubbed} written=${s.written}`);
  }
  console.log(
    "[copy] 주의: auth.users/auth.identities 는 직접 SQL write 하지 않음 — staging 계정은 seed-staging-baseline 또는 Admin API 로 생성하고 id-map 을 적용하세요."
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
