import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

type RouteContext = { params: Promise<{ memoryId: string }> };

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
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

    const { memoryId } = await params;
    const invalidId = validateUUID(memoryId, "memoryId");
    if (invalidId) return invalidId;

    const supabase = getSupabaseServer();
    const { data: memory, error: readError } = await supabase
      .from("instructor_memories")
      .select("id,instructor_id,status,value")
      .eq("id", memoryId)
      .eq("instructor_id", user.id)
      .maybeSingle();

    if (readError) throw readError;
    if (!memory) {
      return errorJson("NOT_FOUND", "Memory not found", 404);
    }
    if (memory.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    if (memory.status !== "archived") {
      const { data: archived, error: updateError } = await supabase
        .from("instructor_memories")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", memoryId)
        .eq("instructor_id", user.id)
        .eq("status", memory.status)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!archived) {
        return errorJson("CONFLICT", "Memory changed before it could be archived", 409);
      }

      const { error: eventError } = await supabase
        .from("instructor_memory_events")
        .insert({
          memory_id: memoryId,
          instructor_id: user.id,
          operation: "archive",
          reason: "instructor_deleted_memory",
          before_value: { status: memory.status, value: memory.value },
          after_value: { status: "archived", value: memory.value },
          actor_kind: "instructor",
          actor_id: user.id,
        });
      if (eventError) throw eventError;

      await auditLog({
        action: "memory_archive",
        userId: user.id,
        targetId: memoryId,
        details: { reason: "instructor_deleted_memory" },
      });
    }

    return successJson({ memoryId, status: "archived" });
  } catch (error) {
    await logError("Failed to archive instructor memory", error, {
      path: "/api/instructor/memory/[memoryId]",
    });
    return errorJson("ARCHIVE_FAILED", "Failed to archive instructor memory", 500);
  }
}
