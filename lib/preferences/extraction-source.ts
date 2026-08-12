import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorySourceTable } from "@/lib/preferences/extraction";

/** 추출 소스 조회 인자. */
export interface ExtractionSourceLookup {
  /** 허용된 소스 테이블 (MEMORY_SOURCE_TABLES 어휘) */
  table: MemorySourceTable;
  /** 소스 메시지가 속한 세션(또는 grading session) id */
  sessionId: string;
  /** 문제 인덱스 — grading_chats 처럼 문제 단위로 나뉜 소스에만 넘긴다. */
  qIdx?: number;
}

/**
 * 커밋 시점의 메모리 추출 소스 = 해당 세션에서 가장 최근의 "타이핑된 교수(user) 메시지".
 * bulk-grade / case-grade 두 커밋 라우트가 이 선택 규칙을 공유한다.
 *
 * `created_at` 동률은 `id` 내림차순으로 가른다 — 이 tie-break 가 있어야 재시도·
 * 중복 커밋이 항상 같은 sourceRefId 를 QStash 에 넣어 추출 멱등성이 유지된다.
 * 이 정렬을 빼는 회귀는 __tests__/memory-extraction-worker.test.ts 의
 * "source selection tie-break for idempotency" 블록이 잡는다.
 */
export async function findLatestExtractionSource(
  supabase: SupabaseClient,
  { table, sessionId, qIdx }: ExtractionSourceLookup,
) {
  let query = supabase
    .from(table)
    .select("id")
    .eq("session_id", sessionId);

  if (qIdx !== undefined) {
    query = query.eq("q_idx", qIdx);
  }

  return query
    .eq("role", "user")
    .eq("input_origin", "typed")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
}
