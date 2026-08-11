import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { instructorId } = await request.json();
    if (!instructorId) {
      return errorJson("BAD_REQUEST", "instructorId is required", 400);
    }

    const supabase = getSupabaseServer();

    // instructor_profiles 테이블 상태 업데이트
    const { error: dbError } = await supabase
      .from("instructor_profiles")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId);

    if (dbError) {
      logError("[approve-instructor] DB error", dbError, {
        path: "/api/admin/instructors/approve",
      });
      return errorJson("DATABASE_ERROR", "Failed to update status", 500);
    }

    // profiles 의 plan 을 승격한다 (AC-13).
    //
    // 승인은 더 이상 "차단 해제"가 아니라 **plan 승격**이다(ADR-006). status 만
    // 바꾸면 교수자는 계속 free 한도(발행 3회 / 학생 5명)에 묶여 있고, 관리자는
    // 승인했다고 믿는다 — 승인 버튼이 아무 일도 안 하는 것과 같다.
    //
    // 실패를 non-fatal 로 넘기지 않는다. 넘기면 instructor_profiles 는 approved
    // 인데 plan 은 free 인 불일치가 남고, 그 상태를 아무도 모른다.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "approved",
        plan: "verified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId);

    if (profileError) {
      logError("[approve-instructor] Profile promotion failed", profileError, {
        path: "/api/admin/instructors/approve",
        additionalData: { instructorId },
      });
      return errorJson(
        "DATABASE_ERROR",
        "Approved the instructor profile but failed to promote the plan",
        500
      );
    }

    return successJson({ approved: true });
  } catch (error) {
    logError("[approve-instructor] Unhandled error", error, {
      path: "/api/admin/instructors/approve",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
