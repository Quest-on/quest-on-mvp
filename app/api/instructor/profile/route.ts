import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

    const supabase = getSupabaseServer();
    const { data: profile, error } = await supabase
      .from("instructor_profiles")
      .select("id, name, email, school, status")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    return successJson({ profile: profile ?? null });
  } catch (error) {
    logError("[instructor-profile] Failed to fetch profile", error, {
      path: "/api/instructor/profile",
    });
    return errorJson("FETCH_PROFILE_FAILED", "Failed to fetch profile", 500);
  }
}
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

    const body = await request.json();
    const { name, email, school } = body;

    const supabase = getSupabaseServer();

    const { error } = await supabase
      .from("instructor_profiles")
      .upsert({
        id: user.id,
        name: name || "",
        email: email || "",
        school: school || null,
        // 승인 대기 개념을 없앴다(#79). 교수자는 가입 즉시 활동하고, 미인증
        // 계정 제어는 status 가 아니라 plan_limits 의 무료 한도가 맡는다.
        status: "approved",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) {
      logError("[instructor-profile] Failed to create profile", error, {
        path: "/api/instructor/profile",
      });
      return errorJson("DATABASE_ERROR", "Failed to create profile", 500);
    }

    return successJson({ created: true });
  } catch (error) {
    logError("[instructor-profile] Unhandled error", error, {
      path: "/api/instructor/profile",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
