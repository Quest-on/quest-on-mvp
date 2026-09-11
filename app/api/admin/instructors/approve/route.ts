import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

const BodySchema = z.object({ instructorId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    // 존재만 확인하면 UUID 가 아닌 값이 그대로 RPC 로 간다.
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }
    const { instructorId } = parsed.data;

    const supabase = getSupabaseServer();

    // 승인과 plan 승격을 하나의 트랜잭션으로 (AC-13).
    //
    // 두 테이블을 따로 UPDATE 하면 각각 독립 커밋이라, 첫 번째가 성공하고
    // 두 번째가 실패하면 instructor_profiles 는 approved 인데 profiles.plan 은
    // free 인 상태가 영구히 남는다. 관리자는 승인했다고 믿고, 교수자는 계속
    // 무료 한도에 묶인다 — 승인 버튼이 아무 일도 안 하는 것과 같다.
    const { error: approveError } = await supabase.rpc("approve_instructor", {
      p_instructor_id: instructorId,
    });

    if (approveError) {
      logError("[approve-instructor] Approval failed", approveError, {
        path: "/api/admin/instructors/approve",
        additionalData: { instructorId },
      });
      return errorJson("DATABASE_ERROR", "Failed to approve instructor", 500);
    }

    return successJson({ approved: true });
  } catch (error) {
    logError("[approve-instructor] Unhandled error", error, {
      path: "/api/admin/instructors/approve",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
