/**
 * Strips instructor-only / answer-key fields from exam question objects before
 * returning them to students or unauthenticated callers.
 *
 * Removed fields:
 *  - correctOptionIndex: MCQ/OX answer key — only the server-side grader may see it.
 *  - ai_context: instructor's private grading context handed to the AI grader.
 *  - core_ability: legacy instructor-only field (already stripped in some paths).
 *
 * Every other field (id, text, type, options, points, idx, prompt, title, rubric …)
 * is preserved so the student can still render and answer the question.
 *
 * Pure function: does not mutate its input. Non-array input is returned unchanged,
 * and non-object array elements are passed through untouched.
 */
export function stripSensitiveQuestionFields<T>(questions: T): T {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    const rest = { ...(q as Record<string, unknown>) };
    delete rest.correctOptionIndex;
    delete rest.ai_context;
    delete rest.core_ability;
    return rest;
  }) as T;
}
