import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 100 : rawLimit, 1), 500);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    const supabase = getSupabaseServer();

    // 통계는 현재 페이지가 아닌 전체 총수 기준으로 집계
    const [
      { count: totalCount, error: totalError },
      { count: instructorCount, error: instructorError },
      { count: studentCount, error: studentError },
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "instructor"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student"),
    ]);

    if (totalError) throw totalError;
    if (instructorError) throw instructorError;
    if (studentError) throw studentError;

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, status, avatar_url, created_at")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // auth.users에서 email 가져오기 (service role)
    const userIds = (users ?? []).map((u) => u.id);
    const emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: authData } = await supabase.auth.admin.listUsers({
        perPage: limit,
      });
      if (authData?.users) {
        for (const au of authData.users) {
          emailMap.set(au.id, au.email ?? "");
        }
      }
    }

    const total = totalCount ?? 0;
    const usersWithRoles = (users ?? []).map((user) => ({
      id: user.id,
      email: emailMap.get(user.id) ?? "",
      fullName: user.display_name,
      role: user.role || "student",
      status: user.status,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    }));

    const instructors = instructorCount ?? 0;
    const students = studentCount ?? 0;
    const stats = {
      total,
      instructors,
      students,
      noRole: Math.max(total - instructors - students, 0),
    };

    return successJson({
      users: usersWithRoles,
      stats,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logError("Failed to fetch users", error, { path: "/api/admin/users" });
    return errorJson("INTERNAL_ERROR", "Failed to fetch users", 500);
  }
}
