import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "MEMORY_EXTRACTION_DISABLED",
  "MEMORY_STORAGE_DISABLED",
  "MEMORY_SELECTION_DISABLED",
  "MEMORY_RENDERING_DISABLED",
  "MEMORY_INJECTION_ENABLED",
  "MEMORY_SCORE_PATH_INJECTION_ENABLED",
  "MEMORY_QUARANTINED_EXTRACTOR_VERSION",
] as const;

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "neq"; column: string; value: unknown };
type Call = { operation: string; table: string; filters: Filter[] };

function createMockClient(initial: Record<string, Row[]>) {
  const tables = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  ) as Record<string, Row[]>;
  const calls: Call[] = [];

  class Query implements PromiseLike<{ data: Row[] | Row | null; error: null }> {
    private operation = "select";
    private filters: Filter[] = [];
    private payload: Row = {};

    constructor(private readonly table: string) {}

    select(): this { return this; }
    order(): this { return this; }
    eq(column: string, value: unknown): this {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }
    is(column: string, value: unknown): this {
      this.filters.push({ kind: "is", column, value });
      return this;
    }
    neq(column: string, value: unknown): this {
      this.filters.push({ kind: "neq", column, value });
      return this;
    }
    insert(payload: Row): this {
      this.operation = "insert";
      this.payload = { ...payload };
      return this;
    }
    upsert(payload: Row): this {
      this.operation = "upsert";
      this.payload = { ...payload };
      return this;
    }
    update(payload: Row): this {
      this.operation = "update";
      this.payload = { ...payload };
      return this;
    }
    delete(): this {
      this.operation = "delete";
      return this;
    }

    private matching(): Row[] {
      return (tables[this.table] ??= []).filter((row) =>
        this.filters.every((filter) =>
          filter.kind === "neq"
            ? row[filter.column] !== filter.value
            : row[filter.column] === filter.value,
        ),
      );
    }

    private async execute() {
      calls.push({ operation: this.operation, table: this.table, filters: [...this.filters] });
      if (this.operation === "insert" || this.operation === "upsert") {
        (tables[this.table] ??= []).push({ ...this.payload });
        return { data: [{ ...this.payload }], error: null };
      }
      if (this.operation === "update") {
        const rows = this.matching();
        rows.forEach((row) => Object.assign(row, this.payload));
        return { data: rows, error: null };
      }
      if (this.operation === "delete") return { data: [], error: null };
      return { data: this.matching(), error: null };
    }

    async maybeSingle() {
      const result = await this.execute();
      const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      return { data: rows[0] ?? null, error: null };
    }

    then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }
  }

  return {
    client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient,
    tables,
    calls,
  };
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => {
    throw new Error("tests must pass an explicit mocked Supabase client");
  }),
}));

import { processMemoryExtractionJob } from "@/lib/preferences/extraction";
import { memoryInjectionEnabled, readMemoryFlags } from "@/lib/preferences/flags";
import { select } from "@/lib/preferences/select";

const sourceId = "11111111-1111-4111-8111-111111111111";
const sourceText = "피드백은 짧게 작성합니다.";
const sourceRow = {
  id: sourceId,
  role: "user",
  content: sourceText,
  input_origin: "typed",
  created_by: "instructor-1",
  created_at: "2026-08-12T01:00:00.000Z",
};
const candidate = {
  predicate: "feedback.length",
  value: "brief",
  valueText: "피드백을 짧게 작성한다.",
  evidence: {
    sourceTable: "bulk_grading_messages",
    refId: sourceId,
    span: [0, Array.from(sourceText).length],
    quote: sourceText,
  },
  commitment: "asserted",
  isExplicit: true,
};

function selectedRow(id: string, extractorVersion: string, predicate: string): Row {
  return {
    id,
    instructor_id: "instructor-1",
    scope: "global",
    scope_id: null,
    predicate,
    value_text: id,
    affects_score: false,
    is_explicit: true,
    version: 1,
    status: "active",
    extractor_version: extractorVersion,
    updated_at: "2026-08-12T01:00:00.000Z",
  };
}

beforeEach(() => ENV_KEYS.forEach((key) => delete process.env[key]));
afterEach(() => ENV_KEYS.forEach((key) => delete process.env[key]));

describe("instructor memory kill switches", () => {
  it("defaults to shadow mode while extraction and storage remain enabled", () => {
    expect(readMemoryFlags()).toEqual({
      extractionEnabled: true,
      storageEnabled: true,
      selectionEnabled: true,
      renderingEnabled: true,
      injectionEnabled: false,
      scorePathInjectionEnabled: false,
      quarantinedExtractorVersion: null,
    });
  });

  it("keeps extraction writes working when injection is off", async () => {
    process.env.MEMORY_INJECTION_ENABLED = "0";
    const database = createMockClient({
      bulk_grading_messages: [sourceRow],
      instructor_memories: [],
      instructor_memory_events: [],
    });

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: sourceId },
      {
        getClient: () => database.client,
        extractCandidates: async () => JSON.stringify([candidate]),
        requeue: async () => undefined,
      },
    );

    expect(readMemoryFlags().injectionEnabled).toBe(false);
    expect(result.promoted).toBe(1);
    expect(database.tables.instructor_memories).toHaveLength(1);
    expect(database.tables.instructor_memory_events).toHaveLength(1);
  });

  it("excludes the quarantined extractor version in the selection query", async () => {
    process.env.MEMORY_QUARANTINED_EXTRACTOR_VERSION = "extractor-X";
    const database = createMockClient({
      instructor_memories: [
        selectedRow("from-X", "extractor-X", "feedback.length"),
        selectedRow("from-Y", "extractor-Y", "feedback.register"),
      ],
    });

    const result = await select({ instructorId: "instructor-1" }, database.client);

    expect(result.map((row) => row.id)).toEqual(["from-Y"]);
    expect(database.calls.some((call) => call.filters.some((filter) =>
      filter.kind === "neq" &&
      filter.column === "extractor_version" &&
      filter.value === "extractor-X"
    ))).toBe(true);
  });

  it("implements quarantine without updating or deleting stored rows", async () => {
    process.env.MEMORY_QUARANTINED_EXTRACTOR_VERSION = "extractor-X";
    const database = createMockClient({
      instructor_memories: [selectedRow("from-X", "extractor-X", "feedback.length")],
    });
    const before = structuredClone(database.tables.instructor_memories);

    await select({ instructorId: "instructor-1" }, database.client);

    expect(database.tables.instructor_memories).toEqual(before);
    expect(database.calls.filter((call) =>
      call.operation === "update" || call.operation === "delete"
    )).toEqual([]);
  });

  it("requires broad injection in addition to the score-path switch", () => {
    process.env.MEMORY_INJECTION_ENABLED = "1";
    expect(memoryInjectionEnabled(false)).toBe(true);
    expect(memoryInjectionEnabled(true)).toBe(false);

    process.env.MEMORY_INJECTION_ENABLED = "0";
    process.env.MEMORY_SCORE_PATH_INJECTION_ENABLED = "1";
    expect(memoryInjectionEnabled(false)).toBe(false);
    expect(memoryInjectionEnabled(true)).toBe(false);
  });

  it("resolves unrecognised values to each switch's safe default", () => {
    for (const value of ["", "maybe", "0", "false"]) {
      const flags = readMemoryFlags({
        MEMORY_EXTRACTION_DISABLED: value,
        MEMORY_STORAGE_DISABLED: value,
        MEMORY_SELECTION_DISABLED: value,
        MEMORY_RENDERING_DISABLED: value,
        MEMORY_INJECTION_ENABLED: value,
        MEMORY_SCORE_PATH_INJECTION_ENABLED: value,
      });

      expect(flags).toMatchObject({
        extractionEnabled: true,
        storageEnabled: true,
        selectionEnabled: true,
        renderingEnabled: true,
        injectionEnabled: false,
        scorePathInjectionEnabled: false,
      });
    }
  });
});
