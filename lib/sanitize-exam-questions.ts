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
