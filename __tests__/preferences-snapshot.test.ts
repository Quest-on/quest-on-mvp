import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordMemoryApplication,
  type MemoryApplicationSnapshotDraft,
} from "@/lib/preferences/snapshot";

/**
 * memory_application_snapshots INSERT 계약.
 *
 * 잡으려는 사고:
 *   · DDL 에 없는 컬럼을 보내거나 NOT NULL 컬럼을 빠뜨리는 것
 *   · id 배열과 version 배열의 길이가 어긋난 채 기록돼 증거로 못 쓰게 되는 것
 *   · INSERT 실패를 삼키고 성공한 척하는 것
 */

/** database/030_instructor_memory.sql 이 정의한, 기본값이 없는 쓰기 대상 컬럼. */
const DDL_COLUMNS = [
  "applied_memory_ids",
  "applied_versions",
  "estimated_tokens",
  "exam_id",
  "feature",
  "instructor_id",
  "prompt_hash",
  "q_idx",
  "rendered_block",
  "renderer_version",
  "selector_version",
  "session_id",
];

const supabaseMock = vi.hoisted(() => {
  const state: {
    tables: string[];
    payloads: Record<string, unknown>[];
    selects: string[];
    error: { message: string } | null;
  } = { tables: [], payloads: [], selects: [], error: null };

  const client = {
    from: (table: string) => {
      state.tables.push(table);
      return {
        insert: (payload: Record<string, unknown>) => {
          state.payloads.push(payload);
          return {
            select: (columns: string) => {
              state.selects.push(columns);
              return {
                single: async () =>
                  state.error
                    ? { data: null, error: state.error }
                    : { data: { id: "snapshot-row-1" }, error: null },
              };
            },
          };
        },
      };
    },
  };

  return { state, client };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock.client,
}));

function draft(
  overrides: Partial<MemoryApplicationSnapshotDraft> = {}
): MemoryApplicationSnapshotDraft {
  return {
    instructorId: "instructor-1",
    examId: "8a4c1f2e-0000-4000-8000-000000000001",
    sessionId: "8a4c1f2e-0000-4000-8000-000000000002",
    qIdx: 3,
    feature: "bulk_grading_score",
    promptHash: "b".repeat(64),
    appliedMemoryIds: [
      "11111111-2222-4333-8444-000000000001",
      "11111111-2222-4333-8444-000000000002",
    ],
    appliedVersions: [1, 4],
    renderedBlock: "※ 참고 데이터\n- [11111111-2222-4333-8444-000000000001] ...",
    rendererVersion: "memory-renderer/1",
    selectorVersion: "memory-selector/1",
    estimatedTokens: 412,
    ...overrides,
  };
}

describe("preferences snapshot", () => {
  beforeEach(() => {
    supabaseMock.state.tables.length = 0;
    supabaseMock.state.payloads.length = 0;
    supabaseMock.state.selects.length = 0;
    supabaseMock.state.error = null;
  });

  it("memory_application_snapshots 에 DDL 컬럼과 정확히 일치하는 payload 를 넣는다", async () => {
    const result = await recordMemoryApplication(draft());

    expect(supabaseMock.state.tables).toEqual(["memory_application_snapshots"]);
    expect(supabaseMock.state.payloads).toHaveLength(1);

    const payload = supabaseMock.state.payloads[0];
    expect(Object.keys(payload).sort()).toEqual(DDL_COLUMNS);

    expect(payload).toEqual({
      instructor_id: "instructor-1",
      exam_id: "8a4c1f2e-0000-4000-8000-000000000001",
      session_id: "8a4c1f2e-0000-4000-8000-000000000002",
      q_idx: 3,
      feature: "bulk_grading_score",
      prompt_hash: "b".repeat(64),
      applied_memory_ids: [
        "11111111-2222-4333-8444-000000000001",
        "11111111-2222-4333-8444-000000000002",
      ],
      applied_versions: [1, 4],
      rendered_block: "※ 참고 데이터\n- [11111111-2222-4333-8444-000000000001] ...",
      renderer_version: "memory-renderer/1",
      selector_version: "memory-selector/1",
      estimated_tokens: 412,
    });

    expect(supabaseMock.state.selects).toEqual(["id"]);
    expect(result).toEqual({ id: "snapshot-row-1" });
  });

  it("선택 컬럼이 비면 undefined 가 아니라 null 로 보낸다", async () => {
    await recordMemoryApplication(
      draft({ examId: undefined, sessionId: undefined, qIdx: undefined, promptHash: undefined })
    );

    const payload = supabaseMock.state.payloads[0];
    expect(Object.keys(payload).sort()).toEqual(DDL_COLUMNS);
    expect(payload.exam_id).toBeNull();
    expect(payload.session_id).toBeNull();
    expect(payload.q_idx).toBeNull();
    expect(payload.prompt_hash).toBeNull();
  });

  it("빈 적용 목록도 기록한다 (메모리 0건으로 채점했다는 사실 자체가 증거다)", async () => {
    await recordMemoryApplication(
      draft({ appliedMemoryIds: [], appliedVersions: [], renderedBlock: "", estimatedTokens: 0 })
    );

    const payload = supabaseMock.state.payloads[0];
    expect(payload.applied_memory_ids).toEqual([]);
    expect(payload.applied_versions).toEqual([]);
    expect(payload.estimated_tokens).toBe(0);
  });

  it("id 배열과 version 배열 길이가 다르면 INSERT 전에 실패한다", async () => {
    await expect(
      recordMemoryApplication(draft({ appliedVersions: [1] }))
    ).rejects.toThrow(/same length/);

    expect(supabaseMock.state.payloads).toHaveLength(0);
  });

  it("INSERT 오류를 삼키지 않는다", async () => {
    supabaseMock.state.error = { message: "duplicate key value" };

    await expect(recordMemoryApplication(draft())).rejects.toThrow(/duplicate key value/);
  });
});
