import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 적용 스냅샷 기록 — 어떤 메모리가 어떤 모델 호출에 실제로 들어갔는지 남긴다.
 * 분쟁이 생긴 채점을 나중에 재구성하기 위한 유일한 근거다.
 *
 * 이 모듈은 모델을 호출하지 않고, 모델 호출을 감싸는 트랜잭션도 열지 않으며,
 * 사용자 응답 경로의 쓰기 트랜잭션 안에 들어가지 않는다. 준비된 draft 를 그대로 INSERT 한다.
 */

/** `memory_application_snapshots` 한 행에 대응하는 입력. 컬럼 이름은 아래 insert 에서 매핑한다. */
export interface MemoryApplicationSnapshotDraft {
  /** instructor_id (text NOT NULL) */
  instructorId: string;
  /** exam_id (uuid, nullable) */
  examId?: string | null;
  /** session_id (uuid, nullable) */
  sessionId?: string | null;
  /** q_idx (int, nullable) */
  qIdx?: number | null;
  /** feature (text NOT NULL) — ai_events.feature 와 같은 어휘 */
  feature: string;
  /** prompt_hash (text, nullable) — ai_events.metadata.prompt_hash 와 조인 */
  promptHash?: string | null;
  /** applied_memory_ids (uuid[] NOT NULL) */
  appliedMemoryIds: string[];
  /** applied_versions (int[] NOT NULL) — appliedMemoryIds 와 같은 길이·같은 순서 */
  appliedVersions: number[];
  /** rendered_block (text NOT NULL) — 렌더링된 블록 원문 */
  renderedBlock: string;
  /** renderer_version (text NOT NULL) */
  rendererVersion: string;
  /** selector_version (text NOT NULL) */
  selectorVersion: string;
  /** estimated_tokens (int NOT NULL) */
  estimatedTokens: number;
}

export interface MemoryApplicationSnapshotRow {
  id: string;
}

/**
 * 스냅샷 한 행을 INSERT 하고 생성된 id 를 돌려준다.
 *
 * @throws id 배열과 version 배열의 길이가 다르면(증거로 쓸 수 없는 행) 즉시 실패한다.
 * @throws INSERT 가 실패하면 실패한다. 호출자가 채점 실패로 볼지 로깅만 할지 결정한다.
 */
export async function recordMemoryApplication(
  draft: MemoryApplicationSnapshotDraft
): Promise<MemoryApplicationSnapshotRow> {
  if (draft.appliedMemoryIds.length !== draft.appliedVersions.length) {
    throw new Error(
      "memory application snapshot: appliedMemoryIds and appliedVersions must have the same length " +
        `(got ${draft.appliedMemoryIds.length} ids, ${draft.appliedVersions.length} versions)`
    );
  }

  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("memory_application_snapshots")
    .insert({
      instructor_id: draft.instructorId,
      exam_id: draft.examId ?? null,
      session_id: draft.sessionId ?? null,
      q_idx: draft.qIdx ?? null,
      feature: draft.feature,
      prompt_hash: draft.promptHash ?? null,
      applied_memory_ids: draft.appliedMemoryIds,
      applied_versions: draft.appliedVersions,
      rendered_block: draft.renderedBlock,
      renderer_version: draft.rendererVersion,
      selector_version: draft.selectorVersion,
      estimated_tokens: draft.estimatedTokens,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`memory application snapshot insert failed: ${error.message}`);
  }

  return { id: (data as { id: string }).id };
}
