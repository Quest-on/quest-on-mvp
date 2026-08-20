import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function GET() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const supabase = getSupabaseServer();

    // school 은 DB 에 있는데 조회에서 빠져 있었다 (AC-19). 소속 없이 승인 여부를
    // 판단하라는 건 근거 없이 승인하라는 말과 같다.
    const { data, error } = await supabase
      .from("instructor_profiles")
      .select("id, name, email, school, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      logError("[pending-instructors] DB error", error, {
        path: "/api/admin/instructors/pending",
      });
      return errorJson("DATABASE_ERROR", "Failed to fetch pending instructors", 500);
    }

    return successJson({ instructors: data });
  } catch (error) {
    logError("[pending-instructors] Unhandled error", error, {
      path: "/api/admin/instructors/pending",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
