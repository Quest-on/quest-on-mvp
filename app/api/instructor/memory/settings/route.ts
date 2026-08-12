import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog, type AuditAction } from "@/lib/audit";
import { logError } from "@/lib/logger";

const SettingsSchema = z
  .object({ action: z.enum(["pause", "resume", "reset"]) })
  .strict();

const PAUSE_REASON = "instructor_paused_memory";

type MemoryRow = {
  id: string;
  status: "active" | "archived" | "quarantined";
  value: unknown;
};

type MemoryEventRow = {
  memory_id: string | null;
  operation: string;
  reason: string;
};

function eventRows(
  rows: MemoryRow[],
  instructorId: string,
  operation: "archive" | "quarantine" | "restore",
  reason: string,
  nextStatus: MemoryRow["status"],
) {
  return rows.map((row) => ({
    memory_id: row.id,
    instructor_id: instructorId,
    operation,
    reason,
    before_value: { status: row.status, value: row.value },
    after_value: { status: nextStatus, value: row.value },
    actor_kind: "instructor",
    actor_id: instructorId,
  }));
}

async function loadRowsByStatus(
  supabase: SupabaseClient,
  instructorId: string,
  statuses: MemoryRow["status"][],
): Promise<MemoryRow[]> {
  const { data, error } = await supabase
    .from("instructor_memories")
    .select("id,status,value")
    .eq("instructor_id", instructorId)
    .in("status", statuses);
  if (error) throw error;
  return (data ?? []) as MemoryRow[];
}

export async function PATCH(request: Request) {
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

    const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    const supabase = getSupabaseServer();
    const now = new Date().toISOString();
    let rows: MemoryRow[] = [];
    let status: "active" | "paused" | "reset";
    let operation: "archive" | "quarantine" | "restore";
    let reason: string;
    let nextStatus: MemoryRow["status"];
    let auditAction: AuditAction;

    if (parsed.data.action === "pause") {
      rows = await loadRowsByStatus(supabase, user.id, ["active"]);
      status = "paused";
      operation = "quarantine";
      reason = PAUSE_REASON;
      nextStatus = "quarantined";
      auditAction = "memory_pause";
    } else if (parsed.data.action === "resume") {
      const { data: events, error: eventReadError } = await supabase
        .from("instructor_memory_events")
        .select("memory_id,operation,reason,occurred_at")
        .eq("instructor_id", user.id)
        .in("operation", ["quarantine", "restore", "archive"])
        .order("occurred_at", { ascending: true });
      if (eventReadError) throw eventReadError;

      const latestByMemory = new Map<string, MemoryEventRow>();
      for (const event of (events ?? []) as MemoryEventRow[]) {
        if (event.memory_id) latestByMemory.set(event.memory_id, event);
      }
      const pausedIds = [...latestByMemory.entries()]
        .filter(([, event]) => event.operation === "quarantine" && event.reason === PAUSE_REASON)
        .map(([memoryId]) => memoryId);

      if (pausedIds.length > 0) {
        const { data: pausedRows, error: pausedReadError } = await supabase
          .from("instructor_memories")
          .select("id,status,value")
          .eq("instructor_id", user.id)
          .eq("status", "quarantined")
          .in("id", pausedIds);
        if (pausedReadError) throw pausedReadError;
        rows = (pausedRows ?? []) as MemoryRow[];
      }
      status = "active";
      operation = "restore";
      reason = "instructor_resumed_memory";
      nextStatus = "active";
      auditAction = "memory_resume";
    } else {
      rows = await loadRowsByStatus(supabase, user.id, ["active", "quarantined"]);
      status = "reset";
      operation = "archive";
      reason = "instructor_reset_memory";
      nextStatus = "archived";
      auditAction = "memory_reset";
    }

    const { error: stateEventError } = await supabase
      .from("instructor_memory_events")
      .insert({
        memory_id: null,
        instructor_id: user.id,
        operation,
        reason,
        before_value: null,
        after_value: { status },
        actor_kind: "instructor",
        actor_id: user.id,
        occurred_at: now,
      });
    if (stateEventError) throw stateEventError;

    if (rows.length > 0) {
      const ids = rows.map((row) => row.id);
      const { data: updated, error: updateError } = await supabase
        .from("instructor_memories")
        .update({ status: nextStatus, updated_at: now })
        .eq("instructor_id", user.id)
        .in("id", ids)
        .in("status", [...new Set(rows.map((row) => row.status))])
        .select("id");
      if (updateError) throw updateError;
      if ((updated ?? []).length !== rows.length) {
        return errorJson("CONFLICT", "Instructor memory changed during the operation", 409);
      }

      const { error: eventError } = await supabase
        .from("instructor_memory_events")
        .insert(eventRows(rows, user.id, operation, reason, nextStatus));
      if (eventError) throw eventError;
    }

    await auditLog({
      action: auditAction,
      userId: user.id,
      targetId: user.id,
      details: { reason, affectedCount: rows.length },
    });

    return successJson({
      action: parsed.data.action,
      status,
      affectedCount: rows.length,
      retained: parsed.data.action !== "reset",
    });
  } catch (error) {
    await logError("Failed to update instructor memory settings", error, {
      path: "/api/instructor/memory/settings",
    });
    return errorJson("SETTINGS_UPDATE_FAILED", "Failed to update instructor memory settings", 500);
  }
}
