/**
 * Pure helpers for the instructor objective (MCQ/OX) grade-review view.
 *
 * The grade page renders one question *type* at a time (multiple-choice or
 * true-false), so it filters the exam's full question list down to a single
 * type. Submissions are keyed by each question's GLOBAL position in the full
 * list (q_idx). Therefore the filtered view MUST carry that global index —
 * if it uses the per-type filtered position instead, OX questions (global
 * idx 5..9) get matched against the MCQ submissions (q_idx 0..4) and render
 * false "오답". Stored questions have no `idx` field and a UUID `id`, so the
 * resolver cannot fall back to those.
 *
 * Regression: __tests__/objective-grade-view.test.ts
 */

export interface ObjectiveQuestionLike {
  idx?: number;
  id?: string | number | null;
  type?: string;
}

export interface SubmissionLike {
  answer?: string;
  decompressed?: {
    answerData?: Record<string, unknown> | null;
  } | null;
}

export interface TypedQuestionEntry<Q> {
  question: Q;
  /** Index of the question in the FULL (unfiltered) question list — the submission key (q_idx). */
  globalIndex: number;
}

/**
 * Filter questions to a single type while preserving each question's global
 * index in the full list. Mirrors how the case-question navigation is built.
 */
export function buildTypedQuestionEntries<Q extends { type?: string }>(
  questions: Q[],
  type: string,
): TypedQuestionEntry<Q>[] {
  return questions
    .map((question, globalIndex) => ({ question, globalIndex }))
    .filter(({ question }) => question.type === type);
}

/**
 * Resolve a question's submission. Submissions are written keyed by the
 * question's GLOBAL position in the full list (`q_idx = findIndex(...)`), so we
 * try that position FIRST. We fall back to the question's `idx` field and a
 * numeric `id` only for legacy/edge shapes.
 *
 * Position-first matters because some exams (edited during authoring) carry an
 * `idx` field that no longer equals the array position — and that stale `idx`
 * can collide with ANOTHER question's position (e.g. an OX question whose idx
 * is 17 would otherwise grab the submission stored at position 17, an essay).
 */
export function getSubmissionForQuestion<S>(
  submissions: Record<string, S> | undefined,
  question: ObjectiveQuestionLike,
  globalIndex: number,
): S | undefined {
  if (!submissions) return undefined;

  const candidates = [
    globalIndex,
    Number.isInteger(question.idx) ? (question.idx as number) : null,
    Number.isInteger(Number(question.id)) ? Number(question.id) : null,
  ].filter((value): value is number => value !== null);

  const seen = new Set<number>();
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);

    const submission = submissions[String(key)];
    if (submission) return submission;
  }

  return undefined;
}

/** Extract the submitted answer string from a submission (with decompressed fallback). */
export function getSubmittedAnswer(submission: SubmissionLike | undefined): string {
  if (!submission) return "";

  if (typeof submission.answer === "string" && submission.answer.trim() !== "") {
    return submission.answer;
  }

  const answerData = submission.decompressed?.answerData;
  if (!answerData) return "";

  const fallback =
    answerData.answer ?? answerData.text ?? answerData.selectedIndex ?? answerData.value;
  if (typeof fallback === "number") return String(fallback);
  if (typeof fallback === "string") return fallback;

  return "";
}
