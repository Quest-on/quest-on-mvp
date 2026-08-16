import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";

/**
 * 단일 과목 수정 · 삭제.
 *
 * 소유권 검사는 "수정/삭제 쿼리의 WHERE 절"이 아니라 **선행 SELECT** 로 한다.
 * eq("instructor_id", user.id) 만 걸면 남의 과목과 없는 과목이 똑같이 0 row 로
 * 돌아와 404/403 을 구분할 수 없고, 실패를 성공으로 착각하기도 쉽다.
 */

const NAME_MAX = 200;
const TERM_MAX = 50;

/**
 * PATCH 는 부분 수정이지만 빈 본문은 거부한다.
 * `{}` 를 200 으로 돌려주면 호출부는 저장됐다고 믿는데 실제로 바뀐 건 없다.
 */
const UpdateCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    term: z.string().trim().max(TERM_MAX).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.term !== undefined,
    { message: "At least one of name or term must be provided" }
  );

type RouteContext = { params: Promise<{ courseId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

    // 경로 파라미터 검증 — DB 를 건드리기 전에 끝낸다.
    const { courseId } = await params;
    const invalidId = validateUUID(courseId, "courseId");
    if (invalidId) return invalidId;

    // 4. 입력 검증
    const body = await request.json().catch(() => null);
    const parsed = UpdateCourseSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    const supabase = getSupabaseServer();

    // 5. 소유권
    const { data: course } = await supabase
      .from("courses")
      .select("id, instructor_id")
      .eq("id", courseId)
      .single();

    if (!course) {
      return errorJson("NOT_FOUND", "Course not found", 404);
    }
    if (course.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 6. 비즈니스 로직
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.term !== undefined) updateData.term = parsed.data.term;

    const { data, error } = await supabase
      .from("courses")
      .update(updateData)
      .eq("id", courseId)
      .select("id, name, term, created_at, updated_at")
      .single();

    if (error) throw error;

    // 7. 응답
    return successJson({ course: data });
  } catch (err) {
    await logError("Failed to update course", err, {
      path: "/api/courses/[courseId]",
    });
    return errorJson("UPDATE_FAILED", "Failed to update course", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
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

    const { courseId } = await params;
    const invalidId = validateUUID(courseId, "courseId");
    if (invalidId) return invalidId;

    const supabase = getSupabaseServer();

    // 5. 소유권
    const { data: course } = await supabase
      .from("courses")
      .select("id, instructor_id")
      .eq("id", courseId)
      .single();

    if (!course) {
      return errorJson("NOT_FOUND", "Course not found", 404);
    }
    if (course.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 6. courses 행만 지운다. exams.course_id 는 FK 의 ON DELETE SET NULL 이 처리하므로
    // 여기서 손대면 같은 일을 두 번 하는 것이고, 실패 시 정합성만 깨진다.
    const { error } = await supabase.from("courses").delete().eq("id", courseId);

    if (error) throw error;

    // 7. 응답
    return successJson({ deleted: true });
  } catch (err) {
    await logError("Failed to delete course", err, {
      path: "/api/courses/[courseId]",
    });
    return errorJson("DELETE_FAILED", "Failed to delete course", 500);
  }
}
