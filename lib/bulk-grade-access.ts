import { getSupabaseServer } from "@/lib/supabase-server";
import { errorJson } from "@/lib/api-response";
import { isAssignmentType, isGradingOpen } from "@/lib/grading-helpers";
import type { AppUser } from "@/lib/get-current-user";

export type BulkGradeAccessContext = {
  supabase: ReturnType<typeof getSupabaseServer>;
	  exam: {
	    id: string;
	    instructor_id: string;
	    title: string;
	    description: string | null;
	    questions: unknown;
	    language: string;
	    is_demo: boolean | null;
	    status: string | null;
	    type: string | null;
	    deadline: string | null;
	  };
	  user: AppUser;
	};

type BulkGradeAccessOptions = {
  requireGradable?: boolean;
};

/**
 * Exam-level access check for bulk grading.
 * Instructor must own the exam (exam.instructor_id === user.id).
 */
export async function requireBulkGradeAccess(
  examId: string,
  user: AppUser | null,
  options: BulkGradeAccessOptions = {},
): Promise<
  | { ok: true; ctx: BulkGradeAccessContext }
  | { ok: false; response: ReturnType<typeof errorJson> }
> {
  if (!user) {
    return { ok: false, response: errorJson("UNAUTHORIZED", "Unauthorized", 401) };
  }

  if (user.role !== "instructor") {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  const supabase = getSupabaseServer();

	  const { data: exam, error: examError } = await supabase
	    .from("exams")
	    .select("id, instructor_id, title, description, questions, language, is_demo, status, type, deadline")
	    .eq("id", examId)
	    .single();

  if (examError || !exam) {
    return { ok: false, response: errorJson("NOT_FOUND", "Exam not found", 404) };
  }

	  if (exam.instructor_id !== user.id) {
	    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
	  }

	  if (options.requireGradable && !isGradingOpen(exam)) {
	    return isAssignmentType(exam.type as string | null)
	      ? {
	          ok: false,
	          response: errorJson(
	            "ASSIGNMENT_NOT_DUE",
	            "과제 마감 후에 채점을 시작할 수 있습니다.",
	            409,
	          ),
	        }
	      : {
	          ok: false,
	          response: errorJson(
	            "EXAM_NOT_CLOSED",
	            "시험 종료 후에 채점을 시작할 수 있습니다.",
	            409,
	          ),
	        };
	  }

  return {
    ok: true,
    ctx: {
      supabase,
      exam: {
        id: exam.id as string,
        instructor_id: exam.instructor_id as string,
        title: exam.title as string,
	        description: (exam.description as string | null) ?? null,
	        questions: exam.questions,
	        language: (exam.language as string) ?? "ko",
	        is_demo: (exam.is_demo as boolean | null) ?? null,
	        status: (exam.status as string | null) ?? null,
	        type: (exam.type as string | null) ?? null,
	        deadline: (exam.deadline as string | null) ?? null,
	      },
      user,
    },
  };
}
