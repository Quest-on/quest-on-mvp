/**
 * Strips instructor-only / answer-key fields from exam question objects before
 * returning them to students or unauthenticated callers.
 *
 * Always removed:
 *  - correctOptionIndex: MCQ/OX answer key — only the server-side grader may see it.
 *  - ai_context: instructor's private grading context handed to the AI grader.
 *  - core_ability: legacy instructor-only field (already stripped in some paths).
 *
 * Per-question `rubric` (grading criteria) is removed by default and kept only when
 * `keepRubric` is true — pass `keepRubric: exam.rubric_public === true` so students
 * see the rubric only when the instructor opted in (mirrors the top-level rubric gate).
 *
 * Every other field (id, text, type, options, points, idx, prompt, title …) is
 * preserved so the student can still render and answer the question.
 *
 * Pure function: does not mutate its input. Non-array input is returned unchanged,
 * and non-object array elements are passed through untouched.
 */
export function stripSensitiveQuestionFields<T>(
  questions: T,
  opts: { keepRubric?: boolean } = {}
): T {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    const rest = { ...(q as Record<string, unknown>) };
    delete rest.correctOptionIndex;
    delete rest.ai_context;
    delete rest.core_ability;
    if (!opts.keepRubric) delete rest.rubric;
    return rest;
  }) as T;
}

/**
 * Returns the exam row as a student (or an unauthenticated caller who knows the exam
 * code) may see it. Student and public handlers must go through this one function so
 * the two paths cannot drift apart.
 *
 *  - questions: instructor-only fields are stripped (see stripSensitiveQuestionFields).
 *  - materials_text: removed. The extracted text exists for the server-side AI only.
 *  - materials: emptied. Students get no file list until the instructor marks files as
 *    student-visible (a separate feature); until then no URL leaves the server.
 *  - rubric: kept only when `rubric_public === true`.
 *
 * Pure function: does not mutate its input. Keys that are absent stay absent, so a
 * select list that never fetched `materials_text` does not gain it.
 */
export function sanitizeExamForStudent<T extends Record<string, unknown>>(exam: T): T {
  const rubricPublic = exam.rubric_public === true;
  const out: Record<string, unknown> = { ...exam };
  if ("questions" in out) {
    out.questions = stripSensitiveQuestionFields(out.questions, { keepRubric: rubricPublic });
  }
  if ("materials" in out) out.materials = [];
  if ("materials_text" in out) out.materials_text = [];
  if ("rubric" in out && !rubricPublic) out.rubric = null;
  return out as T;
}
