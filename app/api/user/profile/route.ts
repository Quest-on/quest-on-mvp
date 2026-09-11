import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * 인가 사실(`role`·`status`·`plan`)은 여기서 받지 않는다 (이슈 #87 / AC-20).
 *
 * 예전 스키마는 `role` 과 `status` 를 클라이언트에서 받아 service_role 로 썼다.
 * 로그인한 아무나 `{"role":"instructor","status":"approved"}` 한 번이면 승인된
 * 교수자가 됐다. 조용히 무시하지 않고 `.strict()` 로 **거부**한다 — 무시하면
 * 호출부는 성공했다고 믿고, 권한이 올라간 줄 아는 클라이언트가 남는다.
 *
 * 역할은 `POST /api/user/role` 이 최초 1회만, `status`·`plan` 은 관리자
 * 엔드포인트만 바꾼다.
 */
const PatchSchema = z
  .object({
    display_name: z.string().max(100).optional(),
    school: z.string().max(100).optional(),
    student_id: z.string().max(50).optional(),
  })
  .strict();

// 현재 유저의 프로필 업데이트 (온보딩 + 프로필 수정)
export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `user-profile:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests.", 429);
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    const { display_name, school, student_id } = parsed.data;

    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if (display_name !== undefined) updateData.display_name = display_name;
    if (school !== undefined) updateData.school = school;
    if (student_id !== undefined) updateData.student_id = student_id;

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (error) throw error;

    return successJson({ updated: true });
  } catch {
    return errorJson("UPDATE_FAILED", "Failed to update profile", 500);
  }
}
