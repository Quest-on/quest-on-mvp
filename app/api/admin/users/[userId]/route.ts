import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { validateUUID } from "@/lib/validate-params";

const RoleSchema = z
  .object({ role: z.enum(["instructor", "student"]) })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;
    const invalidId = validateUUID(userId, "userId");
    if (invalidId) return invalidId;

    // .strict() 가 없으면 role 외 필드가 그대로 통과한다. 관리자 경로라
    // 모르는 키를 조용히 삼키면 안 된다.
    const parsed = RoleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }
    const { role } = parsed.data;

    const supabase = getSupabaseServer();

    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, display_name, role")
      .single();

    if (error) {
      return errorJson("NOT_FOUND", "User not found", 404);
    }

    return successJson({
      user: {
        id: profile.id,
        fullName: profile.display_name,
        role: profile.role,
      },
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to update user role", 500);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;
    const supabase = getSupabaseServer();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, status, avatar_url, created_at")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return errorJson("NOT_FOUND", "User not found", 404);
    }

    // auth.users에서 email 가져오기
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email ?? "";

    return successJson({
      user: {
        id: profile.id,
        email,
        fullName: profile.display_name,
        role: profile.role,
        status: profile.status,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
      },
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to fetch user", 500);
  }
}
