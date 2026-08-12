import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerFromExam, ownerFromUser } from "@/lib/preferences/owner";
import { select } from "@/lib/preferences/select";
import { PREDICATES, type Predicate } from "@/lib/preferences/vocabulary";

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; kind: "eq" | "is" };
type QueryLog = { table: string; columns: string; filters: Filter[] };

const database = vi.hoisted(() => {
  const state: { memories: Row[]; exams: Row[]; queries: QueryLog[] } = {
    memories: [],
    exams: [],
    queries: [],
  };

  function from(table: string) {
    let columns = "";
    const filters: Filter[] = [];

    const matchingRows = () => {
      const source = table === "instructor_memories" ? state.memories : state.exams;
      return source.filter((row) =>
        filters.every((filter) =>
          filter.kind === "is"
            ? row[filter.column] === filter.value
            : row[filter.column] === filter.value
        )
      );
    };

    const query = {
      select(selected: string) {
        columns = selected;
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
      async maybeSingle() {
        state.queries.push({ table, columns, filters: [...filters] });
        return { data: matchingRows()[0] ?? null, error: null };
      },
      then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        state.queries.push({ table, columns, filters: [...filters] });
        return Promise.resolve({ data: matchingRows(), error: null }).then(onfulfilled, onrejected);
      },
    };

    return query;
  }

  return { state, client: { from } };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => database.client,
}));

function memory(
  id: string,
  overrides: Partial<Row> = {}
): Row {
  return {
    id,
    instructor_id: "instructor-1",
    scope: "global",
    scope_id: null,
    predicate: "feedback.length" satisfies Predicate,
    value_text: id,
    affects_score: false,
    is_explicit: true,
    version: 1,
    status: "active",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const context = {
  instructorId: "instructor-1",
  courseId: "course-1",
  examId: "exam-1",
};

describe("deterministic instructor memory selection", () => {
  beforeEach(() => {
    database.state.memories = [];
    database.state.exams = [];
    database.state.queries = [];
  });

  it("keeps only the exam row when a predicate exists at all three scopes", async () => {
    database.state.memories = [
      memory("global"),
      memory("course", { scope: "course", scope_id: "course-1" }),
      memory("exam", { scope: "exam", scope_id: "exam-1" }),
    ];

    expect((await select(context)).map((row) => row.id)).toEqual(["exam"]);
  });

  it("carries the instructor_id tenant filter on every memory query", async () => {
    database.state.memories = [
      memory("own", { predicate: "feedback.length" }),
      memory("foreign", {
        instructor_id: "instructor-2",
        predicate: "grading.edge_case_rule",
        affects_score: true,
      }),
    ];

    const result = await select(context);
    const memoryQueries = database.state.queries.filter((query) => query.table === "instructor_memories");

    expect(result.map((row) => row.id)).toEqual(["own"]);
    // This assertion fails immediately if any scope query drops the service-role tenant boundary.
    expect(memoryQueries.every((query) =>
      query.filters.some((filter) =>
        filter.kind === "eq" &&
        filter.column === "instructor_id" &&
        filter.value === "instructor-1"
      )
    )).toBe(true);
  });

  it("excludes archived rows through an explicit status filter", async () => {
    database.state.memories = [
      memory("active"),
      memory("archived", {
        predicate: "grading.edge_case_rule",
        affects_score: true,
        status: "archived",
      }),
    ];

    const result = await select(context);
    const memoryQueries = database.state.queries.filter((query) => query.table === "instructor_memories");

    expect(result.map((row) => row.id)).toEqual(["active"]);
    expect(memoryQueries.every((query) =>
      query.filters.some((filter) =>
        filter.kind === "eq" && filter.column === "status" && filter.value === "active"
      )
    )).toBe(true);
  });

  it("never returns more than ten records", async () => {
    database.state.memories = Array.from({ length: 14 }, (_, index) =>
      memory(`memory-${String(index).padStart(2, "0")}`, {
        predicate: PREDICATES[index % PREDICATES.length],
      })
    );

    expect(await select(context)).toHaveLength(10);
  });

  it("returns identical ordering for identical input across repeated calls", async () => {
    database.state.memories = [
      memory("c"),
      memory("a", { predicate: "feedback.register" }),
      memory("b", { predicate: "feedback.orientation" }),
    ];

    const first = (await select(context)).map((row) => row.id);
    const second = (await select(context)).map((row) => row.id);

    expect(second).toEqual(first);
    expect(first).toEqual(["a", "b", "c"]);
  });

  it("ranks an old score-affecting row above a newer non-scoring row", async () => {
    database.state.memories = [
      memory("new-trivial", {
        predicate: "feedback.length",
        updated_at: "2026-08-01T00:00:00.000Z",
      }),
      memory("old-scoring", {
        predicate: "grading.edge_case_rule",
        affects_score: true,
        updated_at: "2020-01-01T00:00:00.000Z",
      }),
    ];

    expect((await select(context)).map((row) => row.id)).toEqual([
      "old-scoring",
      "new-trivial",
    ]);
  });

  it("resolves both owner adapters and returns null for a missing exam", async () => {
    database.state.exams = [
      { id: "exam-found", instructor_id: "instructor-9" },
    ];

    expect(ownerFromUser({ id: "instructor-http" })).toBe("instructor-http");
    expect(await ownerFromExam("exam-found")).toBe("instructor-9");
    expect(await ownerFromExam("exam-missing")).toBeNull();
  });
});
