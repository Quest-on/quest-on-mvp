import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  tracked: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  AI_MODEL: "test-memory-model",
  getOpenAI: () => ({
    chat: { completions: { create: aiMocks.create } },
  }),
}));

vi.mock("@/lib/ai-tracking", () => ({
  buildAiTextMetadata: vi.fn(() => ({})),
  callTrackedChatCompletion: aiMocks.tracked,
}));

import {
  MAX_EXTRACTION_CANDIDATES,
  callMemoryExtractor,
  isInstructorMemoryPaused,
  parseMemoryExtractionResponse,
  processMemoryExtractionJob,
  verifyMemoryCandidate,
  type ActiveMemorySnapshot,
  type MemoryExtractionDependencies,
  type MemorySourceMessage,
} from "@/lib/preferences/extraction";
import { findLatestExtractionSource } from "@/lib/preferences/extraction-source";
import {
  enqueueMemoryExtraction,
  memoryExtractionInitialDedupId,
  memoryExtractionRetryDedupId,
} from "@/lib/qstash";

type Row = Record<string, unknown>;
type TableName =
  | "bulk_grading_messages"
  | "grading_chats"
  | "instructor_memories"
  | "instructor_memory_events";

type QueryResult = {
  data: Row[] | Row | null;
  error: { code?: string; message: string } | null;
};

type Filter = { kind: "eq" | "is" | "in"; column: string; value: unknown };

type FakeState = {
  tables: Record<TableName, Row[]>;
  successfulWrites: Array<{
    operation: "insert" | "update" | "upsert";
    table: TableName;
    payload: Row;
  }>;
  deleteCalls: number;
  queries: Array<{ table: TableName; filters: Filter[] }>;
};

function sameValue(left: unknown, right: unknown): boolean {
  return left === right;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) =>
    filter.kind === "in"
      ? (filter.value as unknown[]).includes(row[filter.column])
      : sameValue(row[filter.column], filter.value),
  );
}

function activeMemoryConflicts(rows: Row[], candidate: Row, ownId?: unknown): boolean {
  if (candidate.status !== "active") return false;
  return rows.some(
    (row) =>
      row.id !== ownId &&
      row.status === "active" &&
      row.instructor_id === candidate.instructor_id &&
      row.scope === candidate.scope &&
      row.scope_id === candidate.scope_id &&
      row.predicate === candidate.predicate,
  );
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row = {};
  private filters: Filter[] = [];
  private ignoreDuplicates = false;
  private orderClauses: Array<{ column: string; descending: boolean }> = [];
  private rowLimit: number | null = null;

  constructor(
    private readonly state: FakeState,
    private readonly table: TableName,
  ) {}

  select(): this {
    return this;
  }

  insert(payload: Row): this {
    this.operation = "insert";
    this.payload = { ...payload };
    return this;
  }

  upsert(payload: Row, options?: { ignoreDuplicates?: boolean }): this {
    this.operation = "upsert";
    this.payload = { ...payload };
    this.ignoreDuplicates = options?.ignoreDuplicates === true;
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

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const descending = options?.ascending === false;
    this.orderClauses.push({ column, descending });
    return this;
  }

  limit(value: number): this {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<QueryResult> {
    return this.maybeSingle();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private uniqueError(): QueryResult {
    return {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    };
  }

  private async execute(): Promise<QueryResult> {
    const rows = this.state.tables[this.table];
    this.state.queries.push({ table: this.table, filters: [...this.filters] });

    if (
      this.operation === "select" &&
      this.table === "instructor_memory_events" &&
      rows.some((row) => row.__pauseReadError === true) &&
      this.filters.some((filter) => filter.column === "reason")
    ) {
      return { data: null, error: { message: "mock pause lookup failed" } };
    }

    if (this.operation === "select") {
      let selected = rows.filter((row) => matches(row, this.filters));
      if (this.orderClauses.length > 0) {
        selected = [...selected].sort((left, right) => {
          for (const { column, descending } of this.orderClauses) {
            const leftVal = String(left[column] ?? "");
            const rightVal = String(right[column] ?? "");
            const cmp = leftVal.localeCompare(rightVal);
            if (cmp !== 0) return descending ? -cmp : cmp;
          }
          return 0;
        });
      }
      if (this.rowLimit !== null) selected = selected.slice(0, this.rowLimit);
      return { data: selected, error: null };
    }

    if (this.operation === "delete") {
      this.state.deleteCalls += 1;
      return { data: [], error: null };
    }

    if (this.operation === "insert" || this.operation === "upsert") {
      const duplicate = rows.some((row) => row.id === this.payload.id);
      const idemDuplicate =
        this.table === "instructor_memory_events" &&
        rows.some(
          (row) =>
            row.instructor_id === this.payload.instructor_id &&
            row.idempotency_key === this.payload.idempotency_key,
        );
      const activeConflict =
        this.table === "instructor_memories" &&
        activeMemoryConflicts(rows, this.payload);

      if (duplicate || idemDuplicate || activeConflict) {
        if (this.operation === "upsert" && this.ignoreDuplicates) {
          return { data: [], error: null };
        }
        return this.uniqueError();
      }

      const inserted = { ...this.payload };
      rows.push(inserted);
      this.state.successfulWrites.push({
        operation: this.operation,
        table: this.table,
        payload: inserted,
      });
      return { data: [inserted], error: null };
    }

    const matchingRows = rows.filter((row) => matches(row, this.filters));
    if (
      this.table === "instructor_memories" &&
      this.payload.status === "active" &&
      matchingRows.some((row) =>
        activeMemoryConflicts(rows, { ...row, ...this.payload }, row.id),
      )
    ) {
      return this.uniqueError();
    }

    for (const row of matchingRows) Object.assign(row, this.payload);
    if (matchingRows.length > 0) {
      this.state.successfulWrites.push({
        operation: "update",
        table: this.table,
        payload: { ...this.payload },
      });
    }
    return { data: matchingRows, error: null };
  }
}

function createFakeDatabase(initial?: Partial<Record<TableName, Row[]>>) {
  const state: FakeState = {
    tables: {
      bulk_grading_messages: initial?.bulk_grading_messages?.map((row) => ({ ...row })) ?? [],
      grading_chats: initial?.grading_chats?.map((row) => ({ ...row })) ?? [],
      instructor_memories: initial?.instructor_memories?.map((row) => ({ ...row })) ?? [],
      instructor_memory_events:
        initial?.instructor_memory_events?.map((row) => ({ ...row })) ?? [],
    },
    successfulWrites: [],
    deleteCalls: 0,
    queries: [],
  };

  const client = {
    from: (table: TableName) => new FakeQuery(state, table),
  } as unknown as SupabaseClient;

  return { state, client };
}

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const INSTRUCTOR_ID = "instructor-1";
const SOURCE_TIME = "2026-08-12T01:00:00.000Z";

function sourceMessage(params?: Partial<MemorySourceMessage>): MemorySourceMessage {
  return {
    sourceTable: "bulk_grading_messages",
    id: SOURCE_ID,
    role: "user",
    content: "부분 점수는 요소별로 줍니다.",
    inputOrigin: "typed",
    createdBy: INSTRUCTOR_ID,
    createdAt: SOURCE_TIME,
    ...params,
  };
}

function sourceRow(params?: Partial<Row>): Row {
  return {
    id: SOURCE_ID,
    role: "user",
    content: "부분 점수는 요소별로 줍니다.",
    input_origin: "typed",
    created_by: INSTRUCTOR_ID,
    created_at: SOURCE_TIME,
    ...params,
  };
}

function codePointSpan(text: string, quote: string): [number, number] {
  const sourceChars = Array.from(text.normalize("NFC"));
  const quoteChars = Array.from(quote.normalize("NFC"));
  const start = sourceChars.join("").indexOf(quoteChars.join(""));
  if (start < 0) throw new Error("test quote is absent");
  return [start, start + quoteChars.length];
}

function scoreCandidate(params?: {
  source?: MemorySourceMessage;
  quote?: string;
  span?: [number, number];
  commitment?: "asserted" | "tentative" | "hypothetical" | "reported" | "negated";
  isExplicit?: boolean;
  value?: string;
  valueText?: string;
}) {
  const source = params?.source ?? sourceMessage();
  const quote = params?.quote ?? source.content;
  return {
    predicate: "grading.edge_case_rule",
    value: params?.value ?? "요소별 부분 점수",
    valueText: params?.valueText ?? "요소별로 부분 점수를 부여한다.",
    evidence: {
      sourceTable: source.sourceTable,
      refId: source.id,
      span: params?.span ?? codePointSpan(source.content, source.content),
      quote,
    },
    commitment: params?.commitment ?? "asserted",
    isExplicit: params?.isExplicit ?? true,
  };
}

function feedbackCandidate(params?: {
  source?: MemorySourceMessage;
  commitment?: "asserted" | "tentative" | "hypothetical" | "reported" | "negated";
  isExplicit?: boolean;
}) {
  const source = params?.source ?? sourceMessage();
  return {
    predicate: "feedback.length",
    value: "brief",
    valueText: "피드백을 짧게 작성한다.",
    evidence: {
      sourceTable: source.sourceTable,
      refId: source.id,
      span: codePointSpan(source.content, source.content),
      quote: source.content,
    },
    commitment: params?.commitment ?? "reported",
    isExplicit: params?.isExplicit ?? false,
  };
}

function activeMemory(params?: Partial<ActiveMemorySnapshot>): Row {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    instructor_id: INSTRUCTOR_ID,
    scope: "global",
    scope_id: null,
    predicate: "grading.edge_case_rule",
    value: "기존 규칙",
    canonical_text: "기존 규칙",
    source_event_at: "2026-08-12T00:00:00.000Z",
    version: 1,
    status: "active",
    extractor_version: "memory-extractor/old",
    superseded_by: null,
    value_text: "기존 규칙",
  };
}

function dependencies(
  database: ReturnType<typeof createFakeDatabase>,
  response: unknown[],
  overrides?: Partial<MemoryExtractionDependencies>,
) {
  const requeue = vi.fn(async () => undefined);
  return {
    requeue,
    value: {
      getClient: () => database.client,
      extractCandidates: async () => JSON.stringify(response),
      requeue,
      ...overrides,
    } satisfies MemoryExtractionDependencies,
  };
}

beforeEach(() => {
  aiMocks.create.mockReset();
  aiMocks.tracked.mockReset();
  aiMocks.create.mockResolvedValue({
    choices: [{ message: { content: "[]" } }],
  });
  aiMocks.tracked.mockImplementation(async (fn: () => Promise<unknown>) => ({
    data: await fn(),
    usage: null,
    requestId: null,
    responseId: null,
    attemptCount: 1,
    latencyMs: 1,
    estimatedCostUsdMicros: 0,
  }));
});

describe("exact evidence span boundary", () => {
  it("rejects a quote altered by one character", () => {
    const source = sourceMessage();
    const candidate = scoreCandidate({ source, quote: "부분 점수는 요소별로 줍니디." });

    expect(verifyMemoryCandidate(candidate, source)).toEqual({
      accepted: false,
      reason: "evidence_span_mismatch",
    });
  });

  it("rejects a quote differing only by whitespace", () => {
    const source = sourceMessage({ content: "피드백은 짧게 씁니다." });
    const candidate = scoreCandidate({
      source,
      quote: "피드백은  짧게 씁니다.",
    });

    expect(verifyMemoryCandidate(candidate, source)).toEqual({
      accepted: false,
      reason: "evidence_span_mismatch",
    });
  });

  it("rejects a quote present elsewhere but absent at the proposed span (weak-form regression)", () => {
    const source = sourceMessage({
      content: "창의성을 중시한다. 학생 답안에는 형식보다 창의성을 중시한다고 적혀 있다.",
    });
    const quote = "창의성을 중시한다";
    const wrongStart = Array.from(source.content).indexOf("형");
    const candidate = scoreCandidate({
      source,
      quote,
      span: [wrongStart, wrongStart + Array.from(quote).length],
    });

    expect(source.content).toContain(quote);
    expect(verifyMemoryCandidate(candidate, source)).toEqual({
      accepted: false,
      reason: "evidence_span_mismatch",
    });
  });

  it("accepts an NFD-decomposed quote against NFC source text", () => {
    const source = sourceMessage({ content: "한글 피드백" });
    const quote = source.content.normalize("NFD");
    const candidate = scoreCandidate({ source, quote });

    const result = verifyMemoryCandidate(candidate, source);
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.normalizedQuote).toBe(source.content);
  });
});

describe("source authorship and semantic gates", () => {
  it.each(["quick_reply", null] as const)(
    "rejects an otherwise valid candidate when input_origin is %s",
    (inputOrigin) => {
      const source = sourceMessage({ inputOrigin });
      expect(verifyMemoryCandidate(scoreCandidate({ source }), source)).toEqual({
        accepted: false,
        reason: "source_not_typed",
      });
    },
  );

  it("does not read or send quick_reply and unknown-origin rows to the extractor", async () => {
    for (const inputOrigin of ["quick_reply", null]) {
      const database = createFakeDatabase({
        bulk_grading_messages: [sourceRow({ input_origin: inputOrigin })],
      });
      const extractCandidates = vi.fn(async () => "[]");
      const deps = dependencies(database, [], { extractCandidates });

      const result = await processMemoryExtractionJob(
        { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
        deps.value,
      );

      expect(result.reason).toBe("source_not_eligible");
      expect(extractCandidates).not.toHaveBeenCalled();
    }
  });

  it.each(["reported", "negated"] as const)(
    "rejects score-affecting commitment %s",
    (commitment) => {
      const source = sourceMessage();
      expect(
        verifyMemoryCandidate(scoreCandidate({ source, commitment }), source),
      ).toEqual({ accepted: false, reason: "score_requires_asserted" });
    },
  );

  it("accepts an explicit asserted score-affecting candidate", () => {
    const source = sourceMessage();
    expect(
      verifyMemoryCandidate(
        scoreCandidate({ source, commitment: "asserted", isExplicit: true }),
        source,
      ).accepted,
    ).toBe(true);
  });

  it("allows feedback predicates without asserted commitment", () => {
    const source = sourceMessage();
    expect(
      verifyMemoryCandidate(
        feedbackCandidate({ source, commitment: "reported", isExplicit: false }),
        source,
      ).accepted,
    ).toBe(true);
  });

  it("rejects an unknown predicate", () => {
    const source = sourceMessage();
    const candidate = { ...scoreCandidate({ source }), predicate: "grading.strictness" };
    expect(verifyMemoryCandidate(candidate, source)).toEqual({
      accepted: false,
      reason: "unknown_predicate",
    });
  });

  it("rejects banned sensitive categories in deterministic code", () => {
    const source = sourceMessage({ content: "학생의 종교에 따라 점수를 조정합니다." });
    const candidate = scoreCandidate({ source, valueText: source.content });
    expect(verifyMemoryCandidate(candidate, source)).toEqual({
      accepted: false,
      reason: "sensitive_category",
    });
  });
});

describe("promotion concurrency, ordering, and idempotency", () => {
  it("does not write on version mismatch and re-queues with a separate retry attempt", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
      instructor_memories: [activeMemory()],
    });
    const candidate = scoreCandidate();
    const requeue = vi.fn(async () => undefined);
    const extractCandidates = async () => {
      database.state.tables.instructor_memories[0].version = 2;
      return JSON.stringify([candidate]);
    };

    const result = await processMemoryExtractionJob(
      {
        sourceTable: "bulk_grading_messages",
        sourceRefId: SOURCE_ID,
        retryAttempt: 0,
      },
      {
        getClient: () => database.client,
        extractCandidates,
        requeue,
      },
    );

    expect(result.requeued).toBe(true);
    expect(result.verdicts[0]).toMatchObject({
      verdict: "REQUEUED",
      reason: "active_memory_version_changed",
    });
    expect(database.state.tables.instructor_memories).toHaveLength(1);
    expect(database.state.tables.instructor_memories[0]).toMatchObject({
      status: "active",
      version: 2,
    });
    expect(database.state.tables.instructor_memory_events).toHaveLength(0);
    expect(database.state.successfulWrites).toHaveLength(0);
    expect(requeue).toHaveBeenCalledWith(
      expect.objectContaining({ retryAttempt: 1 }),
    );
  });

  it("does not apply a source event older than the active memory", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [
        sourceRow({ created_at: "2026-08-11T23:00:00.000Z" }),
      ],
      instructor_memories: [
        activeMemory({ source_event_at: "2026-08-12T00:00:00.000Z" }),
      ],
    });
    const oldSource = sourceMessage({ createdAt: "2026-08-11T23:00:00.000Z" });
    const deps = dependencies(database, [scoreCandidate({ source: oldSource })]);

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
      deps.value,
    );

    expect(result.verdicts[0]).toMatchObject({
      verdict: "REJECTED",
      reason: "source_event_older_than_active_memory",
    });
    expect(database.state.successfulWrites).toHaveLength(0);
    expect(deps.requeue).not.toHaveBeenCalled();
  });

  it("creates exactly one memory and one event for the same idempotency key twice", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
    });
    const candidate = scoreCandidate();
    const payload = {
      sourceTable: "bulk_grading_messages" as const,
      sourceRefId: SOURCE_ID,
      idempotencyKey: "same-delivery",
    };

    const first = dependencies(database, [candidate]);
    const second = dependencies(database, [candidate]);
    await processMemoryExtractionJob(payload, first.value);
    const repeated = await processMemoryExtractionJob(payload, second.value);

    expect(database.state.tables.instructor_memories).toHaveLength(1);
    expect(database.state.tables.instructor_memory_events).toHaveLength(1);
    expect(repeated.verdicts[0]).toMatchObject({ verdict: "DUPLICATE" });
  });

  it("blocks an in-flight extraction after the instructor pauses", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
      instructor_memory_events: [],
    });
    const extractCandidates = async () => {
      database.state.tables.instructor_memory_events.push({
        id: "pause-event",
        memory_id: null,
        instructor_id: INSTRUCTOR_ID,
        operation: "quarantine",
        reason: "instructor_paused_memory",
        occurred_at: "2026-08-12T02:00:00.000Z",
      });
      return JSON.stringify([scoreCandidate()]);
    };

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
      {
        getClient: () => database.client,
        extractCandidates,
        requeue: async () => undefined,
      },
    );

    expect(result.promoted).toBe(0);
    expect(result.verdicts[0]).toMatchObject({
      verdict: "REJECTED",
      reason: "instructor_memory_paused",
    });
    expect(database.state.tables.instructor_memories).toHaveLength(0);
  });

  it("fails closed without throwing when the pause-state lookup errors", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
      instructor_memory_events: [{ __pauseReadError: true }],
    });
    const deps = dependencies(database, [scoreCandidate()]);

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
      deps.value,
    );

    expect(result.promoted).toBe(0);
    expect(result.verdicts[0]).toMatchObject({
      verdict: "REJECTED",
      reason: "instructor_memory_pause_state_unavailable",
    });
    expect(database.state.tables.instructor_memories).toHaveLength(0);
  });

  it("ignores uncommitted per-row settings events when reading effective pause state", async () => {
    const database = createFakeDatabase({
      instructor_memory_events: [{
        memory_id: "memory-1",
        instructor_id: INSTRUCTOR_ID,
        operation: "quarantine",
        reason: "instructor_paused_memory",
        occurred_at: "2026-08-12T02:00:00.000Z",
      }],
    });

    await expect(
      isInstructorMemoryPaused(database.client as never, INSTRUCTOR_ID),
    ).resolves.toBe(false);
  });

  it("promotes normally when the instructor is not paused", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
      instructor_memory_events: [],
    });
    const deps = dependencies(database, [scoreCandidate()]);

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
      deps.value,
    );

    expect(result.promoted).toBe(1);
    expect(database.state.tables.instructor_memories[0]).toMatchObject({ status: "active" });
  });

  it("archives a contradiction, sets superseded_by, and never physically deletes", async () => {
    const database = createFakeDatabase({
      bulk_grading_messages: [sourceRow()],
      instructor_memories: [activeMemory()],
    });
    const deps = dependencies(database, [
      scoreCandidate({ value: "새 규칙", valueText: "새 규칙을 적용한다." }),
    ]);

    const result = await processMemoryExtractionJob(
      { sourceTable: "bulk_grading_messages", sourceRefId: SOURCE_ID },
      deps.value,
    );

    expect(result.promoted).toBe(1);
    expect(database.state.tables.instructor_memories).toHaveLength(2);
    const oldMemory = database.state.tables.instructor_memories.find(
      (row) => row.id === "22222222-2222-4222-8222-222222222222",
    );
    const replacement = database.state.tables.instructor_memories.find(
      (row) => row.id !== oldMemory?.id,
    );
    expect(oldMemory).toMatchObject({
      status: "archived",
      superseded_by: replacement?.id,
      version: 2,
    });
    expect(replacement).toMatchObject({ status: "active", version: 1 });
    expect(database.state.tables.instructor_memory_events[0]).toMatchObject({
      operation: "supersede",
      memory_id: replacement?.id,
    });
    expect(database.state.deleteCalls).toBe(0);
  });
});

describe("malformed extractor output remains handled", () => {
  it("classifies non-JSON, empty arrays, negative spans, out-of-range spans, and 500 candidates", () => {
    expect(parseMemoryExtractionResponse("not-json")).toEqual({
      ok: false,
      reason: "malformed_llm_json",
    });
    expect(parseMemoryExtractionResponse("[]")).toEqual({ ok: true, candidates: [] });

    const source = sourceMessage();
    expect(
      verifyMemoryCandidate(scoreCandidate({ source, span: [-1, 2] }), source),
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
    expect(
      verifyMemoryCandidate(scoreCandidate({ source, span: [0, 999] }), source),
    ).toEqual({ accepted: false, reason: "span_out_of_bounds" });

    const candidates = Array.from(
      { length: MAX_EXTRACTION_CANDIDATES + 400 },
      () => scoreCandidate(),
    );
    expect(parseMemoryExtractionResponse(JSON.stringify(candidates))).toEqual({
      ok: false,
      reason: "too_many_candidates",
    });
  });
});

describe("source selection tie-break for idempotency", () => {
  it("selects the same row consistently when two qualifying typed messages share identical created_at", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const sharedTime = "2026-08-12T01:00:00.000Z";
    const id1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const database = createFakeDatabase({
      bulk_grading_messages: [
        sourceRow({ id: id1, session_id: sessionId, created_at: sharedTime }),
        sourceRow({ id: id2, session_id: sessionId, created_at: sharedTime }),
      ],
    });

    const selectedIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { data: source } = await findLatestExtractionSource(database.client, {
        table: "bulk_grading_messages",
        sessionId,
      });
      selectedIds.push(source?.id);
    }

    // All selections must be identical when created_at is the same
    expect(new Set(selectedIds)).toHaveLength(1);
    expect(selectedIds[0]).toBe(id2); // id2 > id1 lexicographically, descending order picks it
  });

  it("produces stable dedup ids across repeated selections with identical created_at", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const sharedTime = "2026-08-12T01:00:00.000Z";
    const id1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const database = createFakeDatabase({
      bulk_grading_messages: [
        sourceRow({ id: id1, session_id: sessionId, created_at: sharedTime }),
        sourceRow({ id: id2, session_id: sessionId, created_at: sharedTime }),
      ],
    });

    const dedupIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data: source } = await findLatestExtractionSource(database.client, {
        table: "bulk_grading_messages",
        sessionId,
      });

      if (source?.id) {
        dedupIds.push(memoryExtractionInitialDedupId({
          sourceTable: "bulk_grading_messages",
          sourceRefId: source.id,
        }));
      }
    }

    // All dedup ids must be identical
    expect(new Set(dedupIds)).toHaveLength(1);
    expect(dedupIds[0]).toBe(`memory-extraction-initial-bulk_grading_messages-${id2}`);
  });

  it("maintains newest-message-wins when timestamps differ", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const olderTime = "2026-08-12T00:00:00.000Z";
    const newerTime = "2026-08-12T02:00:00.000Z";
    const olderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const newerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    const database = createFakeDatabase({
      bulk_grading_messages: [
        sourceRow({ id: olderId, session_id: sessionId, created_at: olderTime }),
        sourceRow({ id: newerId, session_id: sessionId, created_at: newerTime }),
      ],
    });

    const { data: source } = await findLatestExtractionSource(database.client, {
      table: "bulk_grading_messages",
      sessionId,
    });

    expect(source?.id).toBe(newerId);
  });
});

describe("worker integration invariants", () => {
  it("handles a missing initial source ref without throwing or publishing", async () => {
    await expect(enqueueMemoryExtraction({
      sourceTable: "grading_chats",
      sourceRefId: "",
    })).resolves.toMatchObject({ ok: false, reason: "publish_failed" });
  });

  it("uses a distinct, deterministic initial dedup namespace from CAS retries", () => {
    const payload = {
      sourceTable: "bulk_grading_messages" as const,
      sourceRefId: SOURCE_ID,
    };

    expect(memoryExtractionInitialDedupId(payload)).toBe(
      `memory-extraction-initial-bulk_grading_messages-${SOURCE_ID}`,
    );
    expect(memoryExtractionInitialDedupId(payload)).toBe(
      memoryExtractionInitialDedupId({ ...payload }),
    );
    expect(memoryExtractionInitialDedupId(payload)).not.toBe(
      memoryExtractionRetryDedupId(payload),
    );
  });

  it("tracks the real extractor AI call as memory_extraction", async () => {
    await expect(callMemoryExtractor(sourceMessage())).resolves.toBe("[]");

    expect(aiMocks.create).toHaveBeenCalledOnce();
    expect(aiMocks.tracked).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        feature: "memory_extraction",
        route: "/api/internal/memory-extraction-worker",
      }),
      expect.any(Object),
    );
  });

  it("uses only the QStash signature wrapper and never request-user auth", () => {
    const route = readFileSync(
      path.join(
        process.cwd(),
        "app/api/internal/memory-extraction-worker/route.ts",
      ),
      "utf8",
    );

    expect(route).toContain("withQStashSignature(handler)");
    expect(route).not.toContain("currentUser");
  });
});
