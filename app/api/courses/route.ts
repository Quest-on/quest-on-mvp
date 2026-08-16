import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

/**
 * 과목(courses) 목록 조회 · 생성.
 *
 * 소유권은 courses.instructor_id 단일 컬럼으로만 정의한다(마이그레이션 029).
 * 공동 소유·멤버십 개념이 없으므로 조회는 항상 본인 것으로 좁히고,
 * 생성 시 instructor_id 는 **세션에서만** 채운다 — 본문으로 받지 않는다.
 * 받는 순간 로그인한 아무나 남의 과목을 만들 수 있기 때문이다.
 */

const NAME_MAX = 200;
const TERM_MAX = 50;

/**
 * `.strict()` 로 미지의 키를 조용히 버리지 않고 거부한다.
 * instructor_id / id 같은 걸 실어 보내면 무시가 아니라 400 이어야
 * 호출부가 "반영됐다"고 오해하지 않는다.
 */
const CreateCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    term: z.string().trim().max(TERM_MAX).nullable().optional(),
  })
  .strict();

export async function GET() {
  try {
    // 1. 인증
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // 2. 역할
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // 3. 레이트 리밋
    const rl = await checkRateLimitAsync(`courses:${user.id}`, RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    // 4. 비즈니스 로직 — 본인 과목만
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("courses")
      .select("id, name, term, created_at, updated_at")
      .eq("instructor_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successJson({ courses: data ?? [] });
  } catch (err) {
    await logError("Failed to list courses", err, { path: "/api/courses" });
    return errorJson("FETCH_FAILED", "Failed to fetch courses", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // 2. 역할
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // 3. 레이트 리밋
    const rl = await checkRateLimitAsync(`courses:${user.id}`, RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    // 4. 입력 검증 — 깨진 JSON 은 throw 하므로 null 로 떨어뜨려 같은 400 으로 모은다.
    const body = await request.json().catch(() => null);
    const parsed = CreateCourseSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    // 5. 소유권 — 생성이므로 검사할 기존 행이 없다. instructor_id 를 세션에서 고정한다.
    // 6. 비즈니스 로직
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("courses")
      .insert({
        instructor_id: user.id,
        name: parsed.data.name,
        term: parsed.data.term ?? null,
      })
      .select("id, name, term, created_at, updated_at")
      .single();

    if (error) throw error;

    // 7. 응답
    return successJson({ course: data });
  } catch (err) {
    await logError("Failed to create course", err, { path: "/api/courses" });
    return errorJson("CREATE_FAILED", "Failed to create course", 500);
  }
}
