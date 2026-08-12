import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  currentUserMock,
  rateLimitMock,
  auditLogMock,
  logErrorMock,
  enqueueMemoryExtractionMock,
  requireCaseGradeAccessMock,
  requireBulkGradeAccessMock,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
  auditLogMock: vi.fn(),
  logErrorMock: vi.fn(),
  enqueueMemoryExtractionMock: vi.fn(),
  requireCaseGradeAccessMock: vi.fn(),
  requireBulkGradeAccessMock: vi.fn(),
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: rateLimitMock,
  RATE_LIMITS: { general: { limit: 100, windowSec: 60 } },
}));
vi.mock("@/lib/audit", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));
vi.mock("@/lib/qstash", () => ({
  enqueueMemoryExtraction: enqueueMemoryExtractionMock,
}));
vi.mock("@/lib/case-grade-access", () => ({
  requireCaseGradeAccess: requireCaseGradeAccessMock,
}));
vi.mock("@/lib/bulk-grade-access", () => ({
  requireBulkGradeAccess: requireBulkGradeAccessMock,
}));
vi.mock("@/lib/bulk-grading", () => ({
  getBulkGradableQuestions: () => [{ qIdx: 0 }],
}));
vi.mock("@/lib/grades-upsert", () => ({
  upsertGradesBySessionQuestion: vi.fn(async () => [0]),
}));

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "in"; column: string; value: unknown };
type QueryLog = { table: string; operation: string; filters: Filter[]; values?: unknown };

class MockQuery implements PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  private operation = "select";
  private filters: Filter[] = [];
  private values: unknown;
  private orderClauses: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;

  constructor(
    private readonly database: MockDatabase,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    return this;
  }

  update(values: unknown) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  insert(values: unknown) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderClauses.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }

  then<TResult1 = { data: Row[] | null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.kind === "eq") return row[filter.column] === filter.value;
      return (filter.value as unknown[]).includes(row[filter.column]);
    });
  }

  private execute() {
    this.database.queries.push({
      table: this.table,
      operation: this.operation,
      filters: [...this.filters],
      values: this.values,
    });
    const failure = this.database.failures.find(
      (candidate) => candidate.table === this.table &&
        candidate.operation === this.operation &&
        (!candidate.stateEventOnly || (this.values as Row)?.memory_id === null),
    );
    if (failure) return { data: null, error: { message: failure.message } };

    const table = this.database.tables[this.table] ?? (this.database.tables[this.table] = []);

    if (this.operation === "insert") {
      const inserted = Array.isArray(this.values) ? this.values : [this.values];
      table.push(...inserted.map((row) => ({ ...(row as Row) })));
      return { data: inserted as Row[], error: null };
    }

    let matched = table.filter((row) => this.matches(row));
    if (this.orderClauses.length > 0) {
      matched = [...matched].sort((left, right) => {
        for (const { column, ascending } of this.orderClauses) {
          const leftVal = String(left[column]);
          const rightVal = String(right[column]);
          const cmp = leftVal.localeCompare(rightVal);
          if (cmp !== 0) return ascending ? cmp : -cmp;
        }
        return 0;
      });
    }
    if (this.rowLimit !== null) matched = matched.slice(0, this.rowLimit);
    if (this.operation === "update") {
      for (const row of matched) Object.assign(row, this.values);
    }
    return { data: matched.map((row) => ({ ...row })), error: null };
  }
}

class MockDatabase {
  queries: QueryLog[] = [];
  failures: Array<{ table: string; operation: string; message: string; stateEventOnly?: boolean }> = [];
  tables: Record<string, Row[]>;
  client = { from: (table: string) => new MockQuery(this, table) };

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
    );
  }
}

let database: MockDatabase;
const getSupabaseServerMock = vi.fn(() => database.client);
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => getSupabaseServerMock(),
}));

import { GET } from "@/app/api/instructor/memory/route";
import { DELETE } from "@/app/api/instructor/memory/[memoryId]/route";
import { PATCH } from "@/app/api/instructor/memory/settings/route";
import { POST as caseGradeCommit } from "@/app/api/session/[sessionId]/case-grade/commit/route";
import { POST as bulkGradeCommit } from "@/app/api/exam/[examId]/bulk-grade/commit/route";

const MEMORY_ID = "550e8400-e29b-41d4-a716-446655440000";
const EXAM_ID = "850e8400-e29b-41d4-a716-446655440000";
const GRADING_SESSION_ID = "950e8400-e29b-41d4-a716-446655440000";
const INSTRUCTOR = {
  id: "instructor-a",
  role: "instructor",
  email: "a@example.test",
  status: "approved",
  fullName: null,
  avatarUrl: null,
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/instructor/memory/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteMemory(memoryId = MEMORY_ID) {
  return DELETE(new Request(`http://localhost/api/instructor/memory/${memoryId}`), {
    params: Promise.resolve({ memoryId }),
  });
}

function caseCommitRequest(body: unknown): Parameters<typeof caseGradeCommit>[0] {
  return request(body) as Parameters<typeof caseGradeCommit>[0];
}

function bulkCommitRequest(): Parameters<typeof bulkGradeCommit>[0] {
  return new Request(`http://localhost/api/exam/${EXAM_ID}/bulk-grade/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grades: [{ session_id: MEMORY_ID, q_idx: 0, score: 88, comment: "done" }],
    }),
  }) as Parameters<typeof bulkGradeCommit>[0];
}

function bulkCommit() {
  return bulkGradeCommit(bulkCommitRequest(), {
    params: Promise.resolve({ examId: EXAM_ID }),
  });
}

function bulkDatabase(messages: Row[] = []) {
  return new MockDatabase({
    sessions: [{ id: MEMORY_ID, exam_id: EXAM_ID }],
    exam_grading_sessions: [{
      id: GRADING_SESSION_ID,
      exam_id: EXAM_ID,
      instructor_id: INSTRUCTOR.id,
      status: "grading_done",
      calibration_status: "complete",
      grading_scope: "full",
      proposed_grades: {},
      updated_at: "2026-08-12T00:00:00Z",
    }],
    bulk_grading_messages: messages,
  });
}

function effectivePaused(db: MockDatabase) {
  const latest = [...(db.tables.instructor_memory_events ?? [])]
    .filter((event) => event.memory_id === null)
    .at(-1);
  return latest?.operation === "quarantine" && latest.reason === "instructor_paused_memory";
}

function memory(overrides: Row = {}): Row {
  return {
    id: MEMORY_ID,
    instructor_id: INSTRUCTOR.id,
    status: "active",
    value: "부분 점수 허용",
    predicate: "grading.partial_credit_mode",
    scope: "global",
    scope_id: null,
    evidence_source: "grading_chats",
    evidence_ref_id: "650e8400-e29b-41d4-a716-446655440000",
    source_event_at: "2026-08-11T00:00:00.000Z",
    input_origin: "typed",
    extractor_version: "memory-extractor/1",
    created_at: "2026-08-11T00:00:00.000Z",
    updated_at: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("instructor memory API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database = new MockDatabase();
    currentUserMock.mockResolvedValue(INSTRUCTOR);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 });
    auditLogMock.mockResolvedValue(true);
    enqueueMemoryExtractionMock.mockResolvedValue({
      ok: true,
      dedupId: "memory-extraction-initial-grading_chats-source-message",
      messageId: "message-1",
    });
    requireCaseGradeAccessMock.mockImplementation(async () => ({
      ok: true,
      ctx: { user: INSTRUCTOR, supabase: database.client },
    }));
    requireBulkGradeAccessMock.mockImplementation(async () => ({
      ok: true,
      ctx: { user: INSTRUCTOR, exam: { questions: [] }, supabase: database.client },
    }));
    delete process.env.MEMORY_EXTRACTION_DISABLED;
  });

  it("returns 401 without authentication and never accesses the database", async () => {
    currentUserMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a student and never accesses the database", async () => {
    currentUserMock.mockResolvedValue({ ...INSTRUCTOR, role: "student" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("refuses another instructor's memory without any write", async () => {
    database = new MockDatabase({
      instructor_memories: [memory({ instructor_id: "instructor-b" })],
    });

    const response = await deleteMemory();

    expect(response.status).toBe(404);
    expect(database.queries.filter((query) => query.operation !== "select")).toEqual([]);
    expect(database.tables.instructor_memories[0].status).toBe("active");
  });

  it("DELETE archives the row and leaves application snapshots untouched", async () => {
    const snapshot = { id: "snapshot-1", applied_memory_ids: [MEMORY_ID] };
    database = new MockDatabase({
      instructor_memories: [memory()],
      instructor_memory_events: [],
      memory_application_snapshots: [snapshot],
    });

    const response = await deleteMemory();

    expect(response.status).toBe(200);
    expect(database.tables.instructor_memories).toHaveLength(1);
    expect(database.tables.instructor_memories[0].status).toBe("archived");
    expect(database.queries).toContainEqual(expect.objectContaining({
      table: "instructor_memories",
      operation: "update",
      values: expect.objectContaining({ status: "archived" }),
    }));
    expect(database.tables.memory_application_snapshots).toEqual([snapshot]);
    expect(database.queries.some((query) => query.table === "memory_application_snapshots")).toBe(false);
    expect(database.tables.instructor_memory_events[0]).toMatchObject({
      memory_id: MEMORY_ID,
      instructor_id: INSTRUCTOR.id,
      operation: "archive",
      reason: "instructor_deleted_memory",
    });
    expect(auditLogMock).toHaveBeenCalledWith(expect.objectContaining({ action: "memory_archive" }));
  });

  it("pause retains records while reset archives them", async () => {
    database = new MockDatabase({ instructor_memories: [memory()], instructor_memory_events: [] });

    const pauseResponse = await PATCH(request({ action: "pause" }));
    const pauseBody = await pauseResponse.json();

    expect(pauseResponse.status).toBe(200);
    expect(pauseBody).toMatchObject({ action: "pause", status: "paused", retained: true, affectedCount: 1 });
    expect(database.tables.instructor_memories).toHaveLength(1);
    expect(database.tables.instructor_memories[0].status).toBe("quarantined");

    const resetResponse = await PATCH(request({ action: "reset" }));
    const resetBody = await resetResponse.json();

    expect(resetResponse.status).toBe(200);
    expect(resetBody).toMatchObject({ action: "reset", status: "reset", retained: false, affectedCount: 1 });
    expect(database.tables.instructor_memories).toHaveLength(1);
    expect(database.tables.instructor_memories[0].status).toBe("archived");
    expect(database.tables.instructor_memory_events.map((event) => event.reason)).toEqual([
      "instructor_paused_memory",
      "instructor_paused_memory",
      "instructor_reset_memory",
      "instructor_reset_memory",
    ]);
    expect(database.tables.instructor_memory_events.filter((event) => event.memory_id === null)).toHaveLength(2);
  });

  it("resume restores only rows whose latest event is an instructor pause", async () => {
    database = new MockDatabase({
      instructor_memories: [
        memory({ status: "quarantined" }),
        memory({ id: "750e8400-e29b-41d4-a716-446655440000", status: "quarantined" }),
      ],
      instructor_memory_events: [
        { memory_id: MEMORY_ID, instructor_id: INSTRUCTOR.id, operation: "quarantine", reason: "instructor_paused_memory", occurred_at: "2026-08-11T00:00:00Z" },
        { memory_id: "750e8400-e29b-41d4-a716-446655440000", instructor_id: INSTRUCTOR.id, operation: "quarantine", reason: "unsafe_extractor", occurred_at: "2026-08-11T00:00:00Z" },
      ],
    });

    const response = await PATCH(request({ action: "resume" }));

    expect(response.status).toBe(200);
    expect(database.tables.instructor_memories[0].status).toBe("active");
    expect(database.tables.instructor_memories[1].status).toBe("quarantined");
    expect(database.tables.instructor_memory_events).toContainEqual(
      expect.objectContaining({
        memory_id: null,
        operation: "restore",
        reason: "instructor_resumed_memory",
      }),
    );
    expect(database.tables.instructor_memory_events).not.toContainEqual(
      expect.objectContaining({
        memory_id: "750e8400-e29b-41d4-a716-446655440000",
        reason: "instructor_resumed_memory",
      }),
    );
  });

  it.each([
    {
      action: "pause" as const,
      initialStatus: "active",
      events: [],
      expectedPaused: false,
    },
    {
      action: "resume" as const,
      initialStatus: "quarantined",
      events: [
        { memory_id: MEMORY_ID, instructor_id: INSTRUCTOR.id, operation: "quarantine", reason: "instructor_paused_memory", occurred_at: "2026-08-11T00:00:00Z" },
        { memory_id: null, instructor_id: INSTRUCTOR.id, operation: "quarantine", reason: "instructor_paused_memory", occurred_at: "2026-08-11T00:00:01Z" },
      ],
      expectedPaused: true,
    },
  ])("failed $action row update leaves effective pause state unchanged", async ({ action, initialStatus, events, expectedPaused }) => {
    database = new MockDatabase({
      instructor_memories: [memory({ status: initialStatus })],
      instructor_memory_events: events,
    });
    database.failures.push({
      table: "instructor_memories",
      operation: "update",
      message: "row update failed",
    });
    expect(effectivePaused(database)).toBe(expectedPaused);

    const response = await PATCH(request({ action }));

    expect(response.status).toBe(500);
    expect(effectivePaused(database)).toBe(expectedPaused);
    expect(database.tables.instructor_memory_events.filter((event) => event.memory_id === null)).toHaveLength(
      expectedPaused ? 1 : 0,
    );
  });

  it("contains a state-event insert failure without changing effective pause state", async () => {
    database = new MockDatabase({
      instructor_memories: [memory()],
      instructor_memory_events: [],
    });
    database.failures.push({
      table: "instructor_memory_events",
      operation: "insert",
      message: "state event unavailable",
      stateEventOnly: true,
    });

    const response = await PATCH(request({ action: "pause" }));

    expect(response.status).toBe(500);
    expect(effectivePaused(database)).toBe(false);
    expect(database.tables.instructor_memory_events).toContainEqual(
      expect.objectContaining({ memory_id: MEMORY_ID, reason: "instructor_paused_memory" }),
    );
    expect(database.tables.instructor_memory_events).not.toContainEqual(
      expect.objectContaining({ memory_id: null }),
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      "Failed to update instructor memory settings",
      expect.anything(),
      expect.any(Object),
    );
  });

  it("bulk-grade commit enqueues one initial extraction for the latest typed instructor message", async () => {
    database = bulkDatabase([
      { id: "older-typed", session_id: GRADING_SESSION_ID, role: "user", input_origin: "typed", created_at: "2026-08-12T00:00:00Z" },
      { id: "newest-pasted", session_id: GRADING_SESSION_ID, role: "user", input_origin: "pasted", created_at: "2026-08-12T03:00:00Z" },
      { id: "latest-typed", session_id: GRADING_SESSION_ID, role: "user", input_origin: "typed", created_at: "2026-08-12T02:00:00Z" },
      { id: "other-session", session_id: "other", role: "user", input_origin: "typed", created_at: "2026-08-12T04:00:00Z" },
    ]);

    const response = await bulkCommit();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(enqueueMemoryExtractionMock).toHaveBeenCalledOnce();
    expect(enqueueMemoryExtractionMock).toHaveBeenCalledWith({
      sourceTable: "bulk_grading_messages",
      sourceRefId: "latest-typed",
    });
  });

  it("bulk-grade commit succeeds without enqueueing when the grading session has no messages", async () => {
    database = bulkDatabase();

    const response = await bulkCommit();

    expect(response.status).toBe(200);
    expect(enqueueMemoryExtractionMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("keeps bulk-grade commit successful and logs when QStash publish fails", async () => {
    database = bulkDatabase([
      { id: "typed-message", session_id: GRADING_SESSION_ID, role: "user", input_origin: "typed", created_at: "2026-08-12T00:00:00Z" },
    ]);
    enqueueMemoryExtractionMock.mockResolvedValue({
      ok: false,
      reason: "publish_failed",
      error: new Error("QStash unavailable"),
    });

    const response = await bulkCommit();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(logErrorMock).toHaveBeenCalledWith(
      "[bulk-grade commit] Memory extraction was not queued",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("does not look up or enqueue bulk extraction when the extraction kill switch is off", async () => {
    process.env.MEMORY_EXTRACTION_DISABLED = "1";
    database = bulkDatabase([
      { id: "typed-message", session_id: GRADING_SESSION_ID, role: "user", input_origin: "typed", created_at: "2026-08-12T00:00:00Z" },
    ]);

    const response = await bulkCommit();

    expect(response.status).toBe(200);
    expect(enqueueMemoryExtractionMock).not.toHaveBeenCalled();
    expect(database.queries.some((query) => query.table === "bulk_grading_messages")).toBe(false);
  });

  it("does not enqueue a second extraction when the same bulk commit is delivered twice", async () => {
    database = bulkDatabase([
      { id: "typed-message", session_id: GRADING_SESSION_ID, role: "user", input_origin: "typed", created_at: "2026-08-12T00:00:00Z" },
    ]);

    const first = await bulkCommit();
    const repeated = await bulkCommit();

    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ alreadyCommitted: true });
    expect(enqueueMemoryExtractionMock).toHaveBeenCalledOnce();
  });

  it("case-grade commit enqueues exactly one initial extraction for the latest typed message", async () => {
    database = new MockDatabase({
      grading_chats: [{
        id: "source-message",
        session_id: MEMORY_ID,
        q_idx: 0,
        role: "user",
        input_origin: "typed",
        created_at: "2026-08-12T00:00:00Z",
      }],
    });

    const response = await caseGradeCommit(caseCommitRequest({ qIdx: 0, score: 88, comment: "done" }), {
      params: Promise.resolve({ sessionId: MEMORY_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(enqueueMemoryExtractionMock).toHaveBeenCalledOnce();
    expect(enqueueMemoryExtractionMock).toHaveBeenCalledWith({
      sourceTable: "grading_chats",
      sourceRefId: "source-message",
    });
  });

  it("keeps case-grade commit successful and logs when QStash publish fails", async () => {
    database = new MockDatabase({
      grading_chats: [{
        id: "source-message",
        session_id: MEMORY_ID,
        q_idx: 0,
        role: "user",
        input_origin: "typed",
        created_at: "2026-08-12T00:00:00Z",
      }],
    });
    enqueueMemoryExtractionMock.mockResolvedValue({
      ok: false,
      reason: "publish_failed",
      error: new Error("QStash unavailable"),
    });

    const response = await caseGradeCommit(caseCommitRequest({ qIdx: 0, score: 88 }), {
      params: Promise.resolve({ sessionId: MEMORY_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(logErrorMock).toHaveBeenCalledWith(
      "[case-grade commit] Memory extraction was not queued",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("does not look up or enqueue extraction when the extraction kill switch is off", async () => {
    process.env.MEMORY_EXTRACTION_DISABLED = "1";
    database = new MockDatabase({ grading_chats: [] });

    const response = await caseGradeCommit(caseCommitRequest({ qIdx: 0, score: 88 }), {
      params: Promise.resolve({ sessionId: MEMORY_ID }),
    });

    expect(response.status).toBe(200);
    expect(enqueueMemoryExtractionMock).not.toHaveBeenCalled();
    expect(database.queries.some((query) => query.table === "grading_chats")).toBe(false);
  });

  it("GET carries the instructor_id tenant filter and returns provenance without raw text", async () => {
    database = new MockDatabase({
      instructor_memories: [memory(), memory({ id: "750e8400-e29b-41d4-a716-446655440000", instructor_id: "instructor-b" })],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0]).toMatchObject({
      id: MEMORY_ID,
      value: "부분 점수 허용",
      source: {
        table: "grading_chats",
        messageId: "650e8400-e29b-41d4-a716-446655440000",
        occurredAt: "2026-08-11T00:00:00.000Z",
        inputOrigin: "typed",
      },
    });
    expect(body.memories[0]).not.toHaveProperty("evidenceQuote");

    const listQuery = database.queries.find(
      (query) => query.table === "instructor_memories" && query.operation === "select",
    );
    expect(listQuery?.filters).toContainEqual({
      kind: "eq",
      column: "instructor_id",
      value: INSTRUCTOR.id,
    });
  });

  it("rejects a non-UUID memoryId before any database access", async () => {
    const response = await deleteMemory("not-a-uuid");

    expect(response.status).toBe(400);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty body", null],
    ["wrong type", { action: 1 }],
    ["unknown action", { action: "disable" }],
    ["unknown key", { action: "pause", instructor_id: "instructor-b" }],
  ])("rejects malformed settings input: %s", async (_label, body) => {
    const malformedRequest = body === null
      ? new Request("http://localhost/api/instructor/memory/settings", { method: "PATCH" })
      : request(body);

    const response = await PATCH(malformedRequest);

    expect(response.status).toBe(400);
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });
});
