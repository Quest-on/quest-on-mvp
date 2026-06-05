import { getSupabaseServer } from "@/lib/supabase-server";
import { errorJson } from "@/lib/api-response";
import type { AppUser } from "@/lib/get-current-user";
import { isCaseQuestion, normalizeQuestions } from "@/lib/grading-helpers";

export type CaseGradeAccessContext = {
  supabase: ReturnType<typeof getSupabaseServer>;
  session: { id: string; exam_id: string };
  exam: {
    instructor_id: string;
    questions: unknown;
    language?: string | null;
    status?: string | null;
  };
  user: AppUser;
};

type CaseGradeAccessOptions = {
  requireClosed?: boolean;
};

export function hasQuestionWithQIdx(questions: unknown, qIdx: number): boolean {
  return normalizeQuestions(questions).some((q) => q.idx === qIdx);
}

export function questionPromptByQIdx(questions: unknown, qIdx: number): string {
  const question = normalizeQuestions(questions).find((q) => q.idx === qIdx);
  return question?.prompt ?? "";
}

export function isCaseQuestionQIdx(questions: unknown, qIdx: number): boolean {
  const question = normalizeQuestions(questions).find((q) => q.idx === qIdx);
  return !!question && isCaseQuestion(question.type);
}

/**
 * Instructor must own the exam (exam.instructor_id === user.id).
 */
export async function requireCaseGradeAccess(
  sessionId: string,
  user: AppUser | null,
  qIdx?: number,
  options: CaseGradeAccessOptions = {},
): Promise<
  | { ok: true; ctx: CaseGradeAccessContext }
  | { ok: false; response: ReturnType<typeof errorJson> }
> {
  if (!user) {
    return { ok: false, response: errorJson("UNAUTHORIZED", "Unauthorized", 401) };
  }

  if (user.role !== "instructor") {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  const supabase = getSupabaseServer();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { ok: false, response: errorJson("NOT_FOUND", "Session not found", 404) };
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("instructor_id, questions, language, status")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    return { ok: false, response: errorJson("NOT_FOUND", "Exam not found", 404) };
  }

  if (exam.instructor_id !== user.id) {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  if (options.requireClosed && exam.status !== "closed") {
    return {
      ok: false,
      response: errorJson(
        "EXAM_NOT_CLOSED",
        "시험 종료 후에 채점할 수 있습니다.",
        409,
      ),
    };
  }

  if (qIdx !== undefined) {
    if (qIdx < 0) {
      return {
        ok: false,
        response: errorJson("VALIDATION_ERROR", `Invalid question index: ${qIdx}`, 400),
      };
    }
    if (Array.isArray(exam.questions) && !hasQuestionWithQIdx(exam.questions, qIdx)) {
      return {
        ok: false,
        response: errorJson(
          "VALIDATION_ERROR",
          `Invalid question index: ${qIdx}`,
          400,
        ),
      };
    }
    if (Array.isArray(exam.questions) && !isCaseQuestionQIdx(exam.questions, qIdx)) {
      return {
        ok: false,
        response: errorJson(
          "VALIDATION_ERROR",
          "Case 문제만 AI/수동 채점할 수 있습니다.",
          400,
        ),
      };
    }
  }

  return {
    ok: true,
    ctx: { supabase, session, exam, user },
  };
}
