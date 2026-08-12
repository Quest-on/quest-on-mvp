import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEMORY_RENDERER_VERSION } from "@/lib/preferences/render";
import { MEMORY_SELECTOR_VERSION } from "@/lib/preferences/select";
import { persistSnapshot, preparePreferences } from "@/lib/preferences";

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; kind: "eq" | "is" };

const mocks = vi.hoisted(() => {
  const state: {
    memories: Row[];
    insertError: { message: string } | null;
    inserted: Record<string, unknown>[];
    tables: string[];
  } = {
    memories: [],
    insertError: null,
    inserted: [],
    tables: [],
  };

  const client = {
    from(table: string) {
      state.tables.push(table);

      if (table === "memory_application_snapshots") {
        return {
          insert(payload: Record<string, unknown>) {
            state.inserted.push(payload);
            return {
              select() {
                return {
                  async single() {
                    return state.insertError
                      ? { data: null, error: state.insertError }
                      : { data: { id: "snapshot-1" }, error: null };
                  },
                };
              },
            };
          },
        };
      }

      const filters: Filter[] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value, kind: "eq" });
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ column, value, kind: "is" });
          return query;
        },
        order() {
          return query;
        },
        then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
          onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          const data = state.memories.filter((row) =>
            filters.every((filter) => row[filter.column] === filter.value)
          );
          return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return {
    state,
    client,
    logError: vi.fn().mockResolvedValue(true),
    auditLog: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => mocks.client,
}));

vi.mock("@/lib/logger", () => ({
  logError: mocks.logError,
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog,
}));

function memory(overrides: Partial<Row> = {}): Row {
  return {
    id: "11111111-2222-4333-8444-000000000001",
    instructor_id: "instructor-1",
    scope: "exam",
    scope_id: "exam-1",
    predicate: "grading.edge_case_rule",
    value_text: "표기 오류는 감점하지 않는다",
    affects_score: true,
    is_explicit: true,
    version: 7,
    status: "active",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const scope = { examId: "exam-1" };
const callRef = {
  feature: "bulk_grading_execute",
  sessionId: "session-1",
  qIdx: 2,
  promptHash: "a".repeat(64),
};

describe("preferences orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.memories = [memory()];
    mocks.state.insertError = null;
    mocks.state.inserted = [];
    mocks.state.tables = [];
  });

  it("freezes ids, versions, and rendered hash at prepare time", async () => {
    const prepared = await preparePreferences("instructor-1", scope);
    const draftAtRenderTime = {
      ids: [...prepared.snapshotDraft.appliedMemoryIds],
      versions: [...prepared.snapshotDraft.appliedVersions],
      hash: prepared.snapshotDraft.renderedHash,
    };

    mocks.state.memories[0].id = "11111111-2222-4333-8444-000000000099";
    mocks.state.memories[0].version = 99;
    mocks.state.memories[0].value_text = "나중에 수정된 규칙";

    expect({
      ids: prepared.snapshotDraft.appliedMemoryIds,
      versions: prepared.snapshotDraft.appliedVersions,
      hash: prepared.snapshotDraft.renderedHash,
    }).toEqual(draftAtRenderTime);
  });

  it("does not throw when snapshot persistence fails", async () => {
    const { snapshotDraft } = await preparePreferences("instructor-1", scope);
    mocks.state.insertError = { message: "database unavailable" };

    await expect(persistSnapshot(snapshotDraft, callRef)).resolves.toBeUndefined();
  });

  it("logs and audits a snapshot persistence failure", async () => {
    const { snapshotDraft } = await preparePreferences("instructor-1", scope);
    mocks.state.insertError = { message: "database unavailable" };

    await persistSnapshot(snapshotDraft, callRef);

    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to persist memory application snapshot",
      expect.objectContaining({ message: expect.stringContaining("database unavailable") }),
      expect.objectContaining({ user_id: "instructor-1" })
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "memory_snapshot_failure",
        userId: "instructor-1",
        targetId: "session-1",
      })
    );
  });

  it("returns an awaitable promise and does no persistence before invocation", async () => {
    const { snapshotDraft } = await preparePreferences("instructor-1", scope);
    const beforeInvocation = mocks.state.inserted.length;

    const pending = persistSnapshot(snapshotDraft, callRef);

    expect(beforeInvocation).toBe(0);
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(mocks.state.inserted).toHaveLength(1);
  });

  it("takes renderer and selector versions from their producing modules", async () => {
    const { snapshotDraft } = await preparePreferences("instructor-1", scope);

    expect(snapshotDraft.rendererVersion).toBe(MEMORY_RENDERER_VERSION);
    expect(snapshotDraft.selectorVersion).toBe(MEMORY_SELECTOR_VERSION);
  });

  it("returns an empty block when no records match", async () => {
    mocks.state.memories = [];

    const prepared = await preparePreferences("instructor-1", scope);

    expect(prepared.text).toBe("");
    expect(prepared.snapshotDraft.appliedMemoryIds).toEqual([]);
    expect(prepared.snapshotDraft.appliedVersions).toEqual([]);
    expect(prepared.snapshotDraft.estimatedTokens).toBe(0);
  });
});
