/**
 * Bulk CASE grading roster helpers.
 *
 * The bulk grading panel must show EVERY submitted student, even ones whose
 * worker produced no proposed grade (AI error / parse failure / still running).
 * Previously the panel iterated only `proposed_grades`, so a failed student
 * silently vanished. `computeMissingBulkGradeStudents` derives the students that
 * are in the roster but absent from the proposed grades, tagging each as a
 * already-attempted failure or a still-pending job.
 */

export type BulkGradeRosterStudent = {
  sessionId: string;
  name?: string | null;
  studentNumber?: string | null;
  school?: string | null;
  email?: string | null;
};

export type MissingBulkGradeStudent = {
  sessionId: string;
  studentName: string;
  studentMeta: string;
  /** true = worker already processed this session but wrote no grade (failed). */
  failed: boolean;
};

export function computeMissingBulkGradeStudents(params: {
  students: BulkGradeRosterStudent[];
  /** proposed_grades map keyed by sessionId (null while committed). */
  reviewGrades: Record<string, unknown> | null;
  /** processed_session_ids: sessions the worker already attempted. */
  processedSessionIds: Record<string, boolean>;
  committed: boolean;
  /** Has a grading run actually started/finished? (avoids flagging everyone pre-run) */
  gradingAttempted: boolean;
}): MissingBulkGradeStudent[] {
  const { students, reviewGrades, processedSessionIds, committed, gradingAttempted } =
    params;

  if (committed || !gradingAttempted) return [];

  const graded = new Set(Object.keys(reviewGrades ?? {}));

  return students
    .filter((s) => !graded.has(s.sessionId))
    .map((s) => ({
      sessionId: s.sessionId,
      studentName: s.name ?? `Student ${s.sessionId.slice(0, 8)}`,
      studentMeta: [s.studentNumber, s.email].filter(Boolean).join(" · "),
      failed: Boolean(processedSessionIds[s.sessionId]),
    }));
}
