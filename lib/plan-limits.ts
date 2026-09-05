import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 요금제 한도 (Epic #79 / 이슈 #80 / ADR-006).
 *
 * 한도값은 코드 상수가 아니라 `plan_limits` 테이블에서 온다.
 * 한도 판정의 유일한 지점은 `admit_exam_session` SQL 함수다. 이 모듈은 표시용
 * 잔여량 계산과 한도 조회만 맡는다. 판정식을 TypeScript에 다시 넣으면 SQL과
 * 갈라져 어느 한쪽에서만 학생을 막거나 통과시키게 된다.
 * 사고로 정상 교수자가 차단되면 복구 수단이 revert 뿐이어서는 안 된다 —
 * CI 전 계열을 거쳐 배포되는 동안 모든 free 교수자가 막히기 때문이다.
 * 테이블이면 `UPDATE plan_limits SET max_publishes = NULL` 한 줄로 즉시 해제된다.
 */

export type PlanLimits = {
  plan: string;
  /** null = 무제한 */
  maxPublishes: number | null;
  /** null = 무제한 */
  maxStudents: number | null;
  aiDemoGeneration: boolean;
};

/** DB 조회 실패 시 사용하는 최소 제약 폴백. 막는 쪽이 아니라 여는 쪽으로 실패한다. */
export const FALLBACK_LIMITS: PlanLimits = {
  plan: "free",
  maxPublishes: null,
  maxStudents: null,
  aiDemoGeneration: false,
};

type CacheEntry = { value: PlanLimits; expiresAt: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** 테스트 및 한도 변경 직후 무효화용. */
export function clearPlanLimitsCache(): void {
  cache.clear();
}

type PlanLimitsRow = {
  plan: string;
  max_publishes: number | null;
  max_students: number | null;
  ai_demo_generation: boolean | null;
};

export function rowToPlanLimits(row: PlanLimitsRow): PlanLimits {
  return {
    plan: row.plan,
    maxPublishes: row.max_publishes,
    maxStudents: row.max_students,
    aiDemoGeneration: row.ai_demo_generation ?? false,
  };
}

/**
 * `plan_limits` 에서 한도를 읽는다. 60초 캐시.
 *
 * 조회에 실패하거나 등급이 없으면 `FALLBACK_LIMITS`(무제한)를 돌려준다.
 * 한도 조회 장애로 교수자가 시험을 못 여는 것보다, 잠시 한도가 풀리는 쪽이 낫다.
 */
export async function getPlanLimits(plan: string): Promise<PlanLimits> {
  const now = Date.now();
  const cached = cache.get(plan);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("plan_limits")
      .select("plan, max_publishes, max_students, ai_demo_generation")
      .eq("plan", plan)
      .maybeSingle();

    if (error || !data) return { ...FALLBACK_LIMITS, plan };

    const value = rowToPlanLimits(data as PlanLimitsRow);
    cache.set(plan, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    return { ...FALLBACK_LIMITS, plan };
  }
}

/**
 * RPC 가 일시적으로 실패한 것이 아니라 아예 존재하지 않는가.
 *
 * migration을 `database/[NNN]_*.sql`로 수기 적용하는 운영에서 028/030 누락으로
 * ai_events 기록과 자동 채점이 20일간 멈춘 전례가 있다. 게이트 RPC도 같은 방식으로
 * 사라질 수 있으므로, PGRST202(함수·시그니처 미발견)와 PGRST204(스키마 캐시의
 * 객체 미발견)는 잠깐의 장애가 아니라 한도 기능이 꺼진 상태로 따로 관측한다.
 */
export function isQuotaGateMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST202" || code === "PGRST204";
}

/**
 * 교수자의 발행 횟수 (AC-11, AC-17).
 *
 * "발행"은 상태 전이가 아니라 `exams.first_published_at`(첫 학생 세션 생성 시
 * COALESCE 기록)이다. 그래서 재발행은 카운트를 늘리지 않는다.
 *
 * 이 함수가 유일한 카운트 지점이어야 한다. 호출부마다 쿼리를 다시 쓰면 언젠가
 * 한 곳이 `is_demo` 를 빠뜨리고, 데모를 만들어 본 교수자가 무료 한도를 한 칸
 * 잃는다.
 */
export async function countPublishedExams(instructorId: string): Promise<number> {
  const supabase = getSupabaseServer();
  const { count, error } = await supabase
    .from("exams")
    .select("id", { count: "exact", head: true })
    .eq("instructor_id", instructorId)
    .eq("is_demo", false)
    .not("first_published_at", "is", null);

  if (error) throw error;
  return count ?? 0;
}
