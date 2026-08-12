/**
 * 교수 메모리 모니터링 지표 리포트.
 *
 * 사용법:
 *   npx tsx scripts/memory-metrics.ts --release-at=2026-08-01T00:00:00Z [--days=30] [--json]
 *
 * 왜 관리자 화면이 아니라 스크립트인가:
 *   · 이 네 숫자는 릴리스 리뷰 때 몇 번 읽는 운영 지표이지 상시 대시보드가 아니다.
 *   · 지표 4 는 "릴리스 시각" 이라는 인자를 필요로 하는데, 이 인자는 UI 에 놓을 자연스러운
 *     자리가 없다. 배포 시각을 아는 것은 운영자이지 화면이 아니다.
 *   · 교수 전체의 메모리를 가로질러 읽는 HTTP 표면을 새로 여는 것은, shadow 모드로 나가는
 *     기능에 비해 노출 면적이 지나치게 넓다. 읽기 권한을 운영자 셸에 묶어 두는 편이 낫다.
 *
 * 계산은 lib/memory-metrics.ts 가 한다. 이 파일은 행을 읽어 넘기고 결과를 찍기만 한다.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import {
  computeMemoryMetrics,
  type GradeRow,
  type MemoryEventRow,
  type MemorySnapshotRow,
  type PromptTokenRow,
} from "@/lib/memory-metrics";

type Args = { releaseAt: string; days: number; json: boolean };

function parseArgs(argv: readonly string[]): Args {
  const get = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

  const releaseAt = get("release-at");
  if (!releaseAt || Number.isNaN(new Date(releaseAt).getTime())) {
    throw new Error(
      "--release-at=<ISO timestamp> is required, e.g. --release-at=2026-08-01T00:00:00Z",
    );
  }

  const daysRaw = get("days");
  const days = daysRaw === undefined ? 30 : Number(daysRaw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("--days must be a positive number");
  }

  return { releaseAt, days, json: argv.includes("--json") };
}

function percent(value: number | null): string {
  return value === null ? "n/a (denominator is zero)" : `${(value * 100).toFixed(2)}%`;
}

function number(value: number | null): string {
  return value === null ? "n/a (denominator is zero)" : value.toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseServer();

  const [eventsResult, snapshotsResult, aiEventsResult, gradesResult] = await Promise.all([
    supabase
      .from("instructor_memory_events")
      .select("instructor_id,operation,occurred_at")
      .gte("occurred_at", since),
    supabase
      .from("memory_application_snapshots")
      .select("instructor_id,estimated_tokens,prompt_hash,created_at")
      .gte("created_at", since),
    supabase
      .from("ai_events")
      .select("metadata,input_tokens,created_at")
      .gte("created_at", since),
    supabase.from("grades").select("*").gte("created_at", since),
  ]);

  for (const result of [eventsResult, snapshotsResult, aiEventsResult, gradesResult]) {
    if (result.error) throw result.error;
  }

  const promptTokens: PromptTokenRow[] = (aiEventsResult.data ?? []).map((row) => {
    const metadata = (row as { metadata?: unknown }).metadata;
    const promptHash =
      typeof metadata === "object" && metadata !== null
        ? (metadata as Record<string, unknown>).prompt_hash
        : null;
    return {
      prompt_hash: typeof promptHash === "string" ? promptHash : null,
      input_tokens: (row as { input_tokens?: number | null }).input_tokens ?? null,
      created_at: String((row as { created_at?: unknown }).created_at ?? ""),
    };
  });

  const metrics = computeMemoryMetrics({
    events: (eventsResult.data ?? []) as unknown as MemoryEventRow[],
    snapshots: (snapshotsResult.data ?? []) as unknown as MemorySnapshotRow[],
    promptTokens,
    grades: (gradesResult.data ?? []) as unknown as GradeRow[],
    releaseAt: args.releaseAt,
  });

  if (args.json) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  const writes = metrics.writesPerInstructorPerDay;
  console.log(`instructor memory metrics — last ${args.days}d, release ${args.releaseAt}\n`);

  console.log("1. writes per instructor per day");
  console.log(`   total writes        : ${writes.totalWrites}`);
  console.log(`   instructor-days     : ${writes.instructorDays}`);
  console.log(`   mean per day        : ${number(writes.meanWritesPerInstructorDay)}`);
  console.log(`   busiest day         : ${writes.maxWritesInADay ?? "n/a (no writes)"}`);

  console.log("\n2. contradiction rate (supersede / writes)");
  console.log(`   supersedes / writes : ${metrics.contradictionRate.supersedes} / ${metrics.contradictionRate.writes}`);
  console.log(`   rate                : ${percent(metrics.contradictionRate.rate)}`);

  console.log("\n3. memory token share of the prompt");
  console.log(`   memory tokens       : ${metrics.memoryTokenShare.memoryTokens}`);
  console.log(`   prompt input tokens : ${metrics.memoryTokenShare.promptTokens}`);
  console.log(`   share               : ${percent(metrics.memoryTokenShare.share)}`);
  console.log(
    `   snapshot coverage   : ${metrics.memoryTokenShare.matchedSnapshots} matched, ${metrics.memoryTokenShare.unmatchedSnapshots} unmatched`,
  );

  const shift = metrics.aiScoreEditRateShift;
  console.log("\n4. instructor edit rate on AI-proposed scores, before vs after release");
  console.log(`   basis               : ${shift.basis}`);
  if (!shift.available) console.log(`   DEGRADED            : ${shift.degradedReason}`);
  console.log(`   before              : ${shift.before.edited} / ${shift.before.total} = ${percent(shift.before.rate)}`);
  console.log(`   after               : ${shift.after.edited} / ${shift.after.total} = ${percent(shift.after.rate)}`);
  console.log(`   delta               : ${shift.delta === null ? "n/a (denominator is zero)" : `${(shift.delta * 100).toFixed(2)}pp`}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
