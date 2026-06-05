import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { batchGetUserInfo } from "@/lib/app-users";
import {
  decompressSubmissions,
  gradeObjectiveAnswer,
  normalizeQuestions,
  selectBestSubmission,
} from "@/lib/grading-helpers";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
  type ScoreItem,
} from "@/lib/grade-utils";
import { logError } from "@/lib/logger";
import type {
  BulkGradeStatus,
  ExamStudentOverallStatus,
  ExamStudentSessionStatus,
  ExamStudentSummary,
} from "@/lib/types/student-summary";
import type { GradingProgress } from "@/lib/types/grading";

function getSupabase() {
  return getSupabaseServer();
}

function isCaseQuestion(type?: string): boolean {
  return type === "case" || type === "essay" || type === "short-answer";
}

function isCaseGraded(gradeType?: string): boolean {
  return gradeType === "manual" || gradeType === "auto";
}

/** Session statuses that should appear on the instructor dashboard. */
const VISIBLE_SESSION_STATUSES = new Set([
  "joined",
  "waiting",
  "in_progress",
  "submitted",
  "auto_submitted",
  "locked",
  "closed", // waiting room closed when exam ends
  "late_pending",
  "denied",
]);

const EXCLUDED_SESSION_STATUSES = new Set(["not_joined"]);

type SessionRow = {
  id: string;
  student_id: string;
  submitted_at: string | null;
  created_at: string | null;
  status: string | null;
  grading_progress: GradingProgress | null;
};

type GradingSessionRow = {
  proposed_grades: unknown;
  status: string | null;
  committed_at: string | null;
  grading_failed_count: number | null;
  calibration_status?: string | null;
};

type ProposedGrade = {
  score: number;
  comment?: string;
};

type ProposedGradesMap = Record<string, Record<string, ProposedGrade>>;

function pickSessionForStudent(sessions: SessionRow[]): SessionRow | null {
  if (sessions.length === 0) return null;

  const submitted = sessions
    .filter((s) => s.submitted_at != null)
    .sort(
      (a, b) =>
        new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime()
    );

  const inProgress = sessions
    .filter((s) => s.submitted_at == null)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
    );

  return submitted[0] ?? inProgress[0] ?? sessions[0];
}

function deriveSessionStatus(session: SessionRow | null): ExamStudentSessionStatus {
  if (!session) return "not-started";
  if (session.submitted_at) return "submitted";
  const status = session.status ?? "";
  if (
    status === "in_progress" ||
    status === "joined" ||
    status === "waiting" ||
    status === "late_pending"
  ) {
    return "in-progress";
  }
  if (VISIBLE_SESSION_STATUSES.has(status)) {
    return "in-progress";
  }
  return "in-progress";
}

function isVisibleSession(session: SessionRow): boolean {
  const status = session.status ?? "";
  if (EXCLUDED_SESSION_STATUSES.has(status)) return false;
  if (session.submitted_at != null) return true;
  if (VISIBLE_SESSION_STATUSES.has(status)) return true;
  // Legacy rows with empty status but an existing session row
  return status === "";
}

function hasNonEmptySubmission(submission: Record<string, unknown> | undefined): boolean {
  const answer = submission?.answer;
  if (typeof answer === "string") return answer.trim().length > 0;
  return answer != null;
}

function hasNonEmptyAnswer(answer: string | undefined): boolean {
  return typeof answer === "string" && answer.trim().length > 0;
}

function isValidProposedGrade(value: unknown): value is ProposedGrade {
  if (!value || typeof value !== "object") return false;
  const score = (value as { score?: unknown }).score;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
}

function getProposedGrade(
  proposedGrades: ProposedGradesMap,
  sessionId: string,
  qIdx: number,
): ProposedGrade | undefined {
  const grade = proposedGrades[sessionId]?.[String(qIdx)];
  return isValidProposedGrade(grade) ? grade : undefined;
}

function normalizeProposedGrades(value: unknown): ProposedGradesMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ProposedGradesMap;
}

function deriveBulkGradeStatus(session: GradingSessionRow | null): BulkGradeStatus {
  if (!session) return "none";
  if (session.status === "committed" || session.committed_at) return "committed";
  if (session.status === "grading" || session.status === "committing") return "grading";
  if (session.calibration_status === "sample_grading") return "grading";
  if (session.status === "grading_failed") return "failed";
  if (session.status === "grading_done") return "proposed_ready";
  return "none";
}

function deriveStudentBulkGradeStatus(
  globalStatus: BulkGradeStatus,
  hasCompleteCaseSubmissions: boolean,
  hasCompleteProposedCaseGrades: boolean,
): BulkGradeStatus {
  if (globalStatus === "proposed_ready") {
    return hasCompleteCaseSubmissions && hasCompleteProposedCaseGrades
      ? "proposed_ready"
      : "failed";
  }
  return globalStatus;
}

function deriveOverallStatus(params: {
  sessionStatus: ExamStudentSessionStatus;
  caseTotal: number;
  caseGraded: number;
  hasManualCase: boolean;
  hasFailed: boolean;
  gradingProgress: GradingProgress | null;
}): ExamStudentOverallStatus {
  const { sessionStatus, caseTotal, caseGraded, hasManualCase, hasFailed, gradingProgress } =
    params;

  if (sessionStatus === "not-started") return "not-started";
  if (sessionStatus === "in-progress") return "in-progress";
  if (hasFailed) return "failed";

  const gpStatus = gradingProgress?.status;
  if (gpStatus === "running" || gpStatus === "queued") {
    return "grading";
  }

  if (caseTotal > 0 && caseGraded < caseTotal) {
    return gpStatus === "failed" ? "failed" : "grading";
  }

  if (hasManualCase) return "manually_graded";
  if (caseTotal > 0 && caseGraded === caseTotal) return "ai_graded";
  if (caseTotal === 0) return "ai_graded";

  return "pending";
}

function isObjectiveCorrect(params: {
  qIdx: number;
  rawAnswer: string;
  options?: string[];
  correctOptionIndex?: number;
}): boolean {
  const result = gradeObjectiveAnswer({
    rawAnswer: params.rawAnswer,
    options: params.options,
    correctOptionIndex: params.correctOptionIndex,
  });
  if (result) return result.score === 100;

  return false;
}

function objectiveScoreFromRawAnswer(params: {
  rawAnswer: string;
  options?: string[];
  correctOptionIndex?: number;
}): number | undefined {
  const result = gradeObjectiveAnswer(params);
  return result?.score;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `student-summaries:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const supabase = getSupabase();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, questions, status, score_weights")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const questions = normalizeQuestions(exam.questions);
    const scoreWeights = normalizeScoreWeights(exam.score_weights);
    const canShowFinalScores = exam.status === "closed";
    const mcqIndices = questions
      .filter((q) => q.type === "multiple-choice")
      .map((q) => q.idx);
    const oxIndices = questions.filter((q) => q.type === "true-false").map((q) => q.idx);
    const caseIndices = questions.filter((q) => isCaseQuestion(q.type)).map((q) => q.idx);

    const questionByIdx = new Map(questions.map((q) => [q.idx, q]));

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, student_id, submitted_at, created_at, status, grading_progress")
      .eq("exam_id", examId);

    if (sessionsError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch sessions", 500);
    }

    const activeSessions = (sessions ?? []).filter((s) =>
      isVisibleSession(s as SessionRow)
    ) as SessionRow[];

    const sessionsByStudent = new Map<string, SessionRow[]>();
    for (const session of activeSessions) {
      const list = sessionsByStudent.get(session.student_id) ?? [];
      list.push(session);
      sessionsByStudent.set(session.student_id, list);
    }

    const selectedSessions: SessionRow[] = [];
    const sessionIds: string[] = [];

    sessionsByStudent.forEach((studentSessions) => {
      const picked = pickSessionForStudent(studentSessions);
      if (picked) {
        selectedSessions.push(picked);
        sessionIds.push(picked.id);
      }
    });

    if (sessionIds.length === 0) {
      return successJson({ students: [] as ExamStudentSummary[] });
    }

    const studentIds = [...new Set(selectedSessions.map((s) => s.student_id))];

    const [submissionsResult, gradesResult, profilesResult, clerkMap, gradingSessionResult] =
      await Promise.all([
        supabase
          .from("submissions")
          .select("id, session_id, q_idx, answer, compressed_answer_data, created_at")
          .in("session_id", sessionIds),
        supabase
          .from("grades")
          .select("session_id, q_idx, score, grade_type")
          .in("session_id", sessionIds),
        supabase
          .from("student_profiles")
          .select("student_id, name, student_number, school")
          .in("student_id", studentIds),
        batchGetUserInfo(studentIds),
        supabase
          .from("exam_grading_sessions")
          .select("proposed_grades, status, committed_at, grading_failed_count, calibration_status")
          .eq("exam_id", examId)
          .eq("instructor_id", user.id)
          .maybeSingle(),
      ]);

    if (submissionsResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch submissions", 500);
    }
    if (gradesResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch grades", 500);
    }
    if (gradingSessionResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch bulk grading session", 500);
    }

    const gradingSession = (gradingSessionResult.data ?? null) as GradingSessionRow | null;
    const bulkGradeStatus = deriveBulkGradeStatus(gradingSession);
    const proposedGrades = normalizeProposedGrades(gradingSession?.proposed_grades);

    const profileMap = new Map<
      string,
      { name?: string; student_number?: string; school?: string }
    >();
    for (const profile of profilesResult.data ?? []) {
      profileMap.set(profile.student_id, {
        name: profile.name ?? undefined,
        student_number: profile.student_number ?? undefined,
        school: profile.school ?? undefined,
      });
    }

    const submissionsBySession = new Map<string, Map<number, Record<string, unknown>>>();
    const rawSubmissionsBySession = new Map<string, Array<Record<string, unknown>>>();
    for (const sub of submissionsResult.data ?? []) {
      if (!rawSubmissionsBySession.has(sub.session_id)) {
        rawSubmissionsBySession.set(sub.session_id, []);
      }
      rawSubmissionsBySession.get(sub.session_id)!.push(sub as Record<string, unknown>);

      if (!submissionsBySession.has(sub.session_id)) {
        submissionsBySession.set(sub.session_id, new Map());
      }
      const byQ = submissionsBySession.get(sub.session_id)!;
      const qIdx = sub.q_idx as number;
      const existing = byQ.get(qIdx);
      if (!existing) {
        byQ.set(qIdx, sub);
      } else {
        byQ.set(qIdx, selectBestSubmission([existing, sub]));
      }
    }

    const decompressedSubmissionsBySession = new Map<
      string,
      ReturnType<typeof decompressSubmissions>
    >();
    rawSubmissionsBySession.forEach((submissions, sessionId) => {
      decompressedSubmissionsBySession.set(
        sessionId,
        decompressSubmissions(submissions),
      );
    });

    const gradesBySession = new Map<string, ReturnType<typeof deduplicateGrades>>();
    const rawGradesBySesTemp = new Map<string, typeof gradesResult.data>();
    for (const grade of gradesResult.data ?? []) {
      if (!rawGradesBySesTemp.has(grade.session_id)) {
        rawGradesBySesTemp.set(grade.session_id, []);
      }
      rawGradesBySesTemp.get(grade.session_id)!.push(grade);
    }
    rawGradesBySesTemp.forEach((grades, sessionId) => {
      gradesBySession.set(sessionId, deduplicateGrades(grades));
    });

    const students: ExamStudentSummary[] = selectedSessions.map((session) => {
      const studentId = session.student_id;
      const profile = profileMap.get(studentId);
      const clerk = clerkMap.get(studentId);
      const name =
        profile?.name || clerk?.name || `Student ${studentId.slice(0, 8)}`;
      const email = clerk?.email;

      const sessionStatus = deriveSessionStatus(session);
      const dedupedGrades = gradesBySession.get(session.id) ?? [];
      const gradeByQ = new Map(dedupedGrades.map((g) => [g.q_idx, g]));
      const subsByQ = submissionsBySession.get(session.id) ?? new Map();
      const decompressedSubsByQ = decompressedSubmissionsBySession.get(session.id) ?? {};

      let mcqCorrect = 0;
      const mcqScores: number[] = [];
      for (const qIdx of mcqIndices) {
        const q = questionByIdx.get(qIdx);
        const sub = subsByQ.get(qIdx);
        const rawAnswer = (sub?.answer as string) ?? "";
        const correct = isObjectiveCorrect({
          qIdx,
          rawAnswer,
          options: q?.options,
          correctOptionIndex: q?.correctOptionIndex,
        });
        if (correct) mcqCorrect += 1;
        const rawScore = objectiveScoreFromRawAnswer({
          rawAnswer,
          options: q?.options,
          correctOptionIndex: q?.correctOptionIndex,
        });
        if (sub && rawScore !== undefined) {
          mcqScores.push(rawScore);
        }
      }

      let oxCorrect = 0;
      const oxScores: number[] = [];
      for (const qIdx of oxIndices) {
        const q = questionByIdx.get(qIdx);
        const sub = subsByQ.get(qIdx);
        const rawAnswer = (sub?.answer as string) ?? "";
        const correct = isObjectiveCorrect({
          qIdx,
          rawAnswer,
          options: q?.options,
          correctOptionIndex: q?.correctOptionIndex,
        });
        if (correct) oxCorrect += 1;
        const rawScore = objectiveScoreFromRawAnswer({
          rawAnswer,
          options: q?.options,
          correctOptionIndex: q?.correctOptionIndex,
        });
        if (sub && rawScore !== undefined) {
          oxScores.push(rawScore);
        }
      }

      let caseGraded = 0;
      let caseSubmitted = 0;
      let hasManualCase = false;
      let hasFailed = false;
      const caseScores: number[] = [];

      // dedupedGrades(gradeByQ)는 이미 manual>auto>ai_failed 우선순위로 중복 제거됨
      for (const qIdx of caseIndices) {
        if (
          hasNonEmptyAnswer(decompressedSubsByQ[qIdx]?.answer) ||
          hasNonEmptySubmission(subsByQ.get(qIdx))
        ) {
          caseSubmitted += 1;
        }

        const best = gradeByQ.get(qIdx);

        if (best?.grade_type === "ai_failed") {
          hasFailed = true;
        }
        if (best && isCaseGraded(best.grade_type)) {
          caseGraded += 1;
          if (best.grade_type === "manual") {
            hasManualCase = true;
          }
          if (best.score !== undefined) {
            caseScores.push(best.score);
          }
        }
      }

      const overallStatus = deriveOverallStatus({
        sessionStatus,
        caseTotal: caseIndices.length,
        caseGraded,
        hasManualCase,
        hasFailed,
        gradingProgress: session.grading_progress,
      });

      const caseScore =
        caseScores.length > 0
          ? Math.round(caseScores.reduce((a, b) => a + b, 0) / caseScores.length)
          : undefined;

      const scoreItems: ScoreItem[] = questions.map((q) => {
        if (q.type === "multiple-choice" || q.type === "true-false") {
          const sub = subsByQ.get(q.idx);
          return {
            qIdx: q.idx,
            type: q.type,
            score: objectiveScoreFromRawAnswer({
              rawAnswer: (sub?.answer as string) ?? "",
              options: q.options,
              correctOptionIndex: q.correctOptionIndex,
            }),
          };
        }

        const best = gradeByQ.get(q.idx);
        return {
          qIdx: q.idx,
          type: q.type,
          // grade_type이 null인 legacy grade는 포함하되 ai_failed/ai_summary는 제외
          score: isScoringGrade(best) ? best.score : undefined,
        };
      });
      const scoreResult = calculateScoreFromItems(scoreItems, scoreWeights);
      const overallScore =
        scoreResult.overallScore !== null &&
        (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0)
          ? scoreResult.overallScore
          : undefined;
      const canShowProposedScores =
        canShowFinalScores &&
        bulkGradeStatus === "proposed_ready" &&
        caseIndices.length > 0;
      const hasCompleteCaseSubmissions =
        caseIndices.length > 0 && caseSubmitted === caseIndices.length;
      const hasCompleteProposedCaseGrades =
        caseIndices.length > 0 &&
        caseIndices.every((qIdx) => getProposedGrade(proposedGrades, session.id, qIdx));
      const studentBulkGradeStatus = deriveStudentBulkGradeStatus(
        bulkGradeStatus,
        hasCompleteCaseSubmissions,
        hasCompleteProposedCaseGrades,
      );
      const proposedScoreItems: ScoreItem[] = questions.map((q) => {
        if (q.type === "multiple-choice" || q.type === "true-false") {
          const sub = subsByQ.get(q.idx);
          return {
            qIdx: q.idx,
            type: q.type,
            score: objectiveScoreFromRawAnswer({
              rawAnswer: (sub?.answer as string) ?? "",
              options: q.options,
              correctOptionIndex: q.correctOptionIndex,
            }),
          };
        }

        if (isCaseQuestion(q.type)) {
          return {
            qIdx: q.idx,
            type: q.type,
            score: getProposedGrade(proposedGrades, session.id, q.idx)?.score,
          };
        }

        return { qIdx: q.idx, type: q.type, score: undefined };
      });
      const proposedScoreResult =
        canShowProposedScores &&
        hasCompleteCaseSubmissions &&
        hasCompleteProposedCaseGrades
          ? calculateScoreFromItems(proposedScoreItems, scoreWeights)
          : null;
      const proposedOverallScore =
        proposedScoreResult?.overallScore !== null &&
        proposedScoreResult !== null &&
        (proposedScoreResult.mode === "weighted" || proposedScoreResult.gradedCount > 0)
          ? proposedScoreResult.overallScore
          : undefined;
      const canShowSessionFinalScores =
        canShowFinalScores &&
        (session.submitted_at != null || session.status === "auto_submitted");

      return {
        sessionId: session.id,
        studentId,
        name,
        studentNumber: profile?.student_number,
        school: profile?.school,
        email,
        status: sessionStatus,
        submittedAt: session.submitted_at ?? undefined,
        mcq: { correct: mcqCorrect, total: mcqIndices.length },
        ox: { correct: oxCorrect, total: oxIndices.length },
        caseProgress: { submitted: caseSubmitted, graded: caseGraded, total: caseIndices.length },
        overallStatus,
        caseScore: canShowSessionFinalScores ? caseScore : undefined,
        overallScore: canShowSessionFinalScores ? overallScore : undefined,
        proposedOverallScore: canShowSessionFinalScores ? proposedOverallScore : undefined,
        bulkGradeStatus: studentBulkGradeStatus,
      };
    });

    return successJson({ students });
  } catch (error) {
    logError("student-summaries GET handler error", error, {
      path: "/api/exam/[examId]/student-summaries",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
