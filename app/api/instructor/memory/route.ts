import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

type ListMemoryRow = {
  id: string;
  value: unknown;
  predicate: string;
  scope: string;
  scope_id: string | null;
  status: string;
  evidence_source: string;
  evidence_ref_id: string | null;
  source_event_at: string;
  input_origin: string;
  extractor_version: string;
  created_at: string;
  updated_at: string;
};

const MEMORY_COLUMNS = [
  "id",
  "value",
  "predicate",
  "scope",
  "scope_id",
  "status",
  "evidence_source",
  "evidence_ref_id",
  "source_event_at",
  "input_origin",
  "extractor_version",
  "created_at",
  "updated_at",
].join(",");

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `instructor-memory:${user.id}`,
      RATE_LIMITS.general,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const { data, error } = await getSupabaseServer()
      .from("instructor_memories")
      .select(MEMORY_COLUMNS)
      .eq("instructor_id", user.id)
      .in("status", ["active", "quarantined"])
      .order("source_event_at", { ascending: false });

    if (error) throw error;

    const memories = ((data ?? []) as unknown as ListMemoryRow[]).map((row) => ({
      id: row.id,
      value: row.value,
      predicate: row.predicate,
      scope: row.scope,
      scopeId: row.scope_id,
      status: row.status,
      source: {
        table: row.evidence_source,
        messageId: row.evidence_ref_id,
        occurredAt: row.source_event_at,
        inputOrigin: row.input_origin,
      },
      extractorVersion: row.extractor_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return successJson({ memories });
  } catch (error) {
    await logError("Failed to list instructor memory", error, {
      path: "/api/instructor/memory",
    });
    return errorJson("FETCH_FAILED", "Failed to fetch instructor memory", 500);
  }
}
