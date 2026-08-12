import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, rateLimitMock, auditLogMock, logErrorMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
  auditLogMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: rateLimitMock,
  RATE_LIMITS: { general: { limit: 100, windowSec: 60 } },
}));
vi.mock("@/lib/audit", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "in"; column: string; value: unknown };
type QueryLog = { table: string; operation: string; filters: Filter[]; values?: unknown };

class MockQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  private operation = "select";
  private filters: Filter[] = [];
  private values: unknown;

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

  order(_column: string, _options?: unknown) {
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }

  then<TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
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
    const table = this.database.tables[this.table] ?? (this.database.tables[this.table] = []);

    if (this.operation === "insert") {
      const inserted = Array.isArray(this.values) ? this.values : [this.values];
      table.push(...inserted.map((row) => ({ ...(row as Row) })));
      return { data: inserted as Row[], error: null };
    }

    const matched = table.filter((row) => this.matches(row));
    if (this.operation === "update") {
      for (const row of matched) Object.assign(row, this.values);
    }
    return { data: matched.map((row) => ({ ...row })), error: null };
  }
}

class MockDatabase {
  queries: QueryLog[] = [];
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

const MEMORY_ID = "550e8400-e29b-41d4-a716-446655440000";
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
      "instructor_reset_memory",
    ]);
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
