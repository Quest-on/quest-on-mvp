import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
  type GradeRow,
  type ScoreItem,
} from "@/lib/grade-utils";
import { gradeObjectiveAnswer, isObjectiveQuestion } from "@/lib/grading-helpers";

// Initialize Supabase client
const supabase = getSupabaseServer();

type SessionGradeRow = GradeRow & { session_id: string };

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.role;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(`student-sessions-stats:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Get all sessions for this student (for stats only, no pagination)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, exam_id, submitted_at, created_at")
      .eq("student_id", user.id);

    if (sessionsError) {
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return successJson({
        totalSessions: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        unsubmittedAssignments: 0,
        unsubmittedAssignmentItems: [],
        overallAverageScore: null,
      });
    }

    const completedSessions = sessions.filter((s) => s.submitted_at !== null);
    const inProgressSessions = sessions.filter((s) => s.submitted_at === null);
    const inProgressExamIds = [
      ...new Set(inProgressSessions.map((s) => s.exam_id).filter(Boolean)),
    ];

    let unsubmittedAssignments = 0;
    let unsubmittedAssignmentItems: Array<{
      sessionId: string;
      examId: string;
      examTitle: string;
      examCode: string;
      deadline: string | null;
      createdAt: string;
    }> = [];
    if (inProgressExamIds.length > 0) {
      const { data: exams, error: examsError } = await supabase
        .from("exams")
        .select("id, title, code, type, duration, deadline")
        .in("id", inProgressExamIds);

      if (examsError) {
        throw examsError;
      }

      const typeByExamId = new Map(
        (exams || []).map((exam) => [exam.id, exam.type || null])
      );
      unsubmittedAssignments = inProgressSessions.filter((session) => {
        const t = typeByExamId.get(session.exam_id);
        return t != null && t !== "exam";
      }).length;

      const assignmentExamById = new Map(
        (exams || [])
          .filter((exam) => exam.type != null && exam.type !== "exam")
          .map((exam) => [exam.id, exam])
      );
      unsubmittedAssignmentItems = inProgressSessions
        .map((session) => {
          const exam = assignmentExamById.get(session.exam_id);
          if (!exam) return null;
          return {
            sessionId: session.id,
            examId: session.exam_id,
            examTitle: exam.title || "제목 없음",
            examCode: exam.code || "",
            deadline: exam.deadline || null,
            createdAt: session.created_at,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Filter out past-deadline items (auto-submitted)
      const now = new Date().toISOString();
      unsubmittedAssignmentItems = unsubmittedAssignmentItems.filter(
        (item) => !item.deadline || item.deadline > now
      );
      unsubmittedAssignments = unsubmittedAssignmentItems.length;
    }

    // Get all grades for completed sessions to calculate overall average
    const sessionIds = completedSessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return successJson({
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        inProgressSessions: inProgressSessions.length,
        unsubmittedAssignments,
        unsubmittedAssignmentItems,
        overallAverageScore: null,
      });
    }

    // Fetch grades_released status for all completed sessions' exams
    const completedExamIds = [...new Set(completedSessions.map((s) => s.exam_id).filter(Boolean))];
    const releasedExamIds = new Set<string>();
    const examById = new Map<string, {
      id: string;
      questions: unknown;
      score_weights: unknown;
    }>();
    if (completedExamIds.length > 0) {
      const { data: releasedExams } = await supabase
        .from("exams")
        .select("id, questions, score_weights")
        .in("id", completedExamIds)
        .eq("grades_released", true);
      if (releasedExams) {
        releasedExams.forEach((e) => {
          releasedExamIds.add(e.id);
          examById.set(e.id, e);
        });
      }
    }

    // Only include sessions whose exam has grades_released = true
    const releasedSessionIds = completedSessions
      .filter((s) => releasedExamIds.has(s.exam_id))
      .map((s) => s.id);

    let overallAverageScore: number | null = null;

    if (releasedSessionIds.length > 0) {
      const [gradesResult, submissionsResult] = await Promise.all([
        supabase
          .from("grades")
          .select("session_id, q_idx, score, grade_type")
          .in("session_id", releasedSessionIds),
        supabase
          .from("submissions")
          .select("session_id, q_idx, answer")
          .in("session_id", releasedSessionIds),
      ]);

      const allGrades = gradesResult.data as SessionGradeRow[] | null;
      const gradesError = gradesResult.error;
      const allSubmissions = submissionsResult.data;

      if (gradesError) {
        // Non-critical: grades fetch failed
      }

      const gradesBySession = new Map<string, SessionGradeRow[]>();
      if (allGrades) {
        allGrades.forEach((grade) => {
          if (!gradesBySession.has(grade.session_id)) {
            gradesBySession.set(grade.session_id, []);
          }
          gradesBySession.get(grade.session_id)!.push(grade);
        });
      }

      const submissionsBySession = new Map<
        string,
        Array<{ q_idx: number; answer: string | null }>
      >();
      if (allSubmissions) {
        allSubmissions.forEach((submission) => {
          if (!submissionsBySession.has(submission.session_id)) {
            submissionsBySession.set(submission.session_id, []);
          }
          submissionsBySession.get(submission.session_id)!.push(submission);
        });
      }

      const sessionAverages: number[] = [];
      for (const session of completedSessions) {
        if (!releasedExamIds.has(session.exam_id)) continue;
        const exam = examById.get(session.exam_id);
        const dedupedGrades = deduplicateGrades(
          gradesBySession.get(session.id) ?? []
        ).filter(isScoringGrade);

        if (exam && Array.isArray(exam.questions)) {
          const submissionsByQuestion = new Map(
            (submissionsBySession.get(session.id) ?? []).map((submission) => [
              submission.q_idx,
              submission,
            ])
          );
          const gradeByQuestion = new Map(
            dedupedGrades.map((grade) => [grade.q_idx, grade])
          );
          const scoreItems: ScoreItem[] = exam.questions.map(
            (
              question: {
                idx?: number;
                type?: string;
                options?: string[];
                correctOptionIndex?: number;
              },
              index: number
            ) => {
              const qIdx = typeof question.idx === "number" ? question.idx : index;
              if (isObjectiveQuestion(question.type)) {
                const objective = gradeObjectiveAnswer({
                  rawAnswer: submissionsByQuestion.get(qIdx)?.answer ?? "",
                  options: question.options,
                  correctOptionIndex: question.correctOptionIndex,
                });
                return { qIdx, type: question.type, score: objective?.score };
              }
              return { qIdx, type: question.type, score: gradeByQuestion.get(qIdx)?.score };
            }
          );
          const scoreResult = calculateScoreFromItems(
            scoreItems,
            normalizeScoreWeights(exam.score_weights)
          );
          if (scoreResult.overallScore !== null && scoreResult.gradedCount > 0) {
            sessionAverages.push(scoreResult.overallScore);
          }
        } else if (dedupedGrades.length > 0) {
          sessionAverages.push(
            dedupedGrades.reduce((sum, grade) => sum + grade.score, 0) /
              dedupedGrades.length
          );
        }
      }

      if (sessionAverages.length > 0) {
        overallAverageScore = Math.round(
          sessionAverages.reduce((sum, avg) => sum + avg, 0) / sessionAverages.length
        );
      }
    }

    return successJson({
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      unsubmittedAssignments,
      unsubmittedAssignmentItems,
      overallAverageScore,
    });
  } catch {
    return errorJson("FETCH_STATS_FAILED", "Failed to get student stats", 500);
  }
}
