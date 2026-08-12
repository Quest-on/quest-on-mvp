import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { OwnerId } from "@/lib/preferences/owner";
import { PREDICATE_SET, type Predicate } from "@/lib/preferences/vocabulary";

export const MEMORY_SELECTOR_VERSION = "memory-selector/1";
export const MAX_SELECTED_MEMORIES = 10;

export type MemoryScope = "global" | "course" | "exam";

/** Columns consumed by selection and the renderer; names mirror the table exactly. */
export interface SelectedMemory {
  id: string;
  instructor_id: OwnerId;
  scope: MemoryScope;
  scope_id: string | null;
  predicate: Predicate;
  value_text: string;
  affects_score: boolean;
  is_explicit: boolean;
  version: number;
  updated_at: string;
}

export interface SelectMemoryInput {
  instructorId: OwnerId;
  courseId?: string | null;
  examId?: string | null;
}

const SELECT_COLUMNS =
  "id,instructor_id,scope,scope_id,predicate,value_text,affects_score,is_explicit,version,updated_at";

const SCOPE_SPECIFICITY: Record<MemoryScope, number> = {
  global: 0,
  course: 1,
  exam: 2,
};

type RawMemory = Record<string, unknown>;

type QueryScope = {
  scope: MemoryScope;
  scopeId: string | null;
};

function isSelectedMemory(row: RawMemory): row is RawMemory & SelectedMemory {
  return (
    typeof row.id === "string" &&
    typeof row.instructor_id === "string" &&
    (row.scope === "global" || row.scope === "course" || row.scope === "exam") &&
    (row.scope_id === null || typeof row.scope_id === "string") &&
    typeof row.predicate === "string" &&
    PREDICATE_SET.has(row.predicate as Predicate) &&
    typeof row.value_text === "string" &&
    typeof row.affects_score === "boolean" &&
    typeof row.is_explicit === "boolean" &&
    typeof row.version === "number" &&
    typeof row.updated_at === "string" &&
    Number.isFinite(Date.parse(row.updated_at))
  );
}

function compareMemories(a: SelectedMemory, b: SelectedMemory): number {
  return (
    SCOPE_SPECIFICITY[b.scope] - SCOPE_SPECIFICITY[a.scope] ||
    Number(b.affects_score) - Number(a.affects_score) ||
    Number(b.is_explicit) - Number(a.is_explicit) ||
    Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
    a.id.localeCompare(b.id)
  );
}

async function loadScope(
  supabase: SupabaseClient,
  instructorId: OwnerId,
  { scope, scopeId }: QueryScope
): Promise<SelectedMemory[]> {
  let query = supabase
    .from("instructor_memories")
    .select(SELECT_COLUMNS)
    .eq("instructor_id", instructorId)
    .eq("status", "active")
    .eq("scope", scope);

  query = scope === "global" ? query.is("scope_id", null) : query.eq("scope_id", scopeId as string);

  const { data, error } = await query
    .order("affects_score", { ascending: false })
    .order("is_explicit", { ascending: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`instructor memory selection failed: ${error.message}`);
  }

  return ((data ?? []) as RawMemory[]).filter(isSelectedMemory);
}

/**
 * Select applicable active memories in stable priority order.
 *
 * Every database read carries instructor_id and status filters because the
 * service-role client bypasses RLS. Scope shadowing happens before the hard cap;
 * all rows at the narrowest applicable scope for a predicate are retained.
 */
export async function select(
  input: SelectMemoryInput,
  supabase: SupabaseClient = getSupabaseServer()
): Promise<SelectedMemory[]> {
  const scopes: QueryScope[] = [{ scope: "global", scopeId: null }];
  if (input.courseId) scopes.push({ scope: "course", scopeId: input.courseId });
  if (input.examId) scopes.push({ scope: "exam", scopeId: input.examId });

  const applicable = (await Promise.all(
    scopes.map((scope) => loadScope(supabase, input.instructorId, scope))
  )).flat();

  const narrowestByPredicate = new Map<Predicate, number>();
  for (const memory of applicable) {
    const specificity = SCOPE_SPECIFICITY[memory.scope];
    const current = narrowestByPredicate.get(memory.predicate) ?? -1;
    if (specificity > current) narrowestByPredicate.set(memory.predicate, specificity);
  }

  return applicable
    .filter(
      (memory) => SCOPE_SPECIFICITY[memory.scope] === narrowestByPredicate.get(memory.predicate)
    )
    .sort(compareMemories)
    .slice(0, MAX_SELECTED_MEMORIES);
}
