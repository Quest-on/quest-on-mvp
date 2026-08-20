import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// 프로필 조회
export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(`student-profile:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const supabase = getSupabaseServer();
    const { data: profile, error } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("student_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return successJson({ profile: profile || null });
  } catch {
    return errorJson("FETCH_PROFILE_FAILED", "Failed to fetch profile", 500);
  }
}

// 프로필 생성/업데이트
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Allow users with no role set yet (freshly registered, Clerk JWT not yet propagated)
    // or with role "student". Block only explicit non-student roles.
    const userRole = user.role;
    if (userRole && userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(`student-profile:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const student_number = typeof body.student_number === "string" ? body.student_number.trim().slice(0, 50) : "";
    const school = typeof body.school === "string" ? body.school.trim().slice(0, 100) : "";

    if (!name || !student_number || !school) {
      return errorJson("MISSING_FIELDS", "Name, student number, and school are required", 400);
    }

    const supabase = getSupabaseServer();
    // Upsert profile using Supabase
    const { data: profile, error } = await supabase
      .from("student_profiles")
      .upsert(
        {
          student_id: user.id,
          name,
          student_number,
          school,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" }
      )
      .select()
      .single();

    if (error) throw error;

    return successJson({ profile });
  } catch {
    return errorJson("SAVE_PROFILE_FAILED", "Failed to save profile", 500);
  }
}
