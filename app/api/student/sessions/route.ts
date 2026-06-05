import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
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

const ITEMS_PER_PAGE = 10;
const MAX_ITEMS_PER_PAGE = 50;

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(`student-sessions:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    // Check if user is student
    const userRole = user.role;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    // Get pagination parameters with limit cap
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      MAX_ITEMS_PER_PAGE,
      Math.max(1, parseInt(searchParams.get("limit") || String(ITEMS_PER_PAGE), 10))
    );
    const offset = (page - 1) * limit;

    // Two-query approach: fetch submitted and latest-unsubmitted sessions separately from DB
    // 1. All submitted sessions (these are always included)
    const submittedPromise = supabase
      .from("sessions")
      .select("id, exam_id, submitted_at, created_at, status")
      .eq("student_id", user.id)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: false });

    // 2. Unsubmitted sessions (need deduplication per exam)
    const unsubmittedPromise = supabase
      .from("sessions")
      .select("id, exam_id, submitted_at, created_at, status")
      .eq("student_id", user.id)
      .is("submitted_at", null)
      .order("created_at", { ascending: false });

    const [submittedResult, unsubmittedResult] = await Promise.all([submittedPromise, unsubmittedPromise]);

    if (submittedResult.error) throw submittedResult.error;
    if (unsubmittedResult.error) throw unsubmittedResult.error;

    const submittedSessions = submittedResult.data || [];
    const allUnsubmitted = unsubmittedResult.data || [];

    if (submittedSessions.length === 0 && allUnsubmitted.length === 0) {
      return successJson({
        sessions: [],
        pagination: {
          page,
          limit,
          total: 0,
          hasMore: false,
        },
      });
    }

    // Filter unsubmitted: only keep if no submitted session exists for that exam, latest per exam
    const examsWithSubmitted = new Set(submittedSessions.map(s => s.exam_id));
    const examSessionMap = new Map<string, (typeof allUnsubmitted)[0]>();
    for (const session of allUnsubmitted) {
      if (!examsWithSubmitted.has(session.exam_id) && !examSessionMap.has(session.exam_id)) {
        examSessionMap.set(session.exam_id, session);
      }
    }

    // Combine and sort
    const filteredSessions = [
      ...Array.from(examSessionMap.values()),
      ...submittedSessions,
    ].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const sessions = filteredSessions.slice(offset, offset + limit);
    const filteredTotalCount = filteredSessions.length;

    // Collect all unique exam_ids
    const examIds = [...new Set(sessions.map((s) => s.exam_id))];

    // Fetch all exams in one query
    const { data: exams, error: examsError } = await supabase
      .from("exams")
      .select("id, title, code, type, duration, deadline, instructor_id, grades_released, questions, score_weights")
      .in("id", examIds);

    if (examsError) {
      throw examsError;
    }

    // Create a map of exam_id -> exam for quick lookup
    const examMap = new Map((exams || []).map((exam) => [exam.id, exam]));

    // Optimized: Batch fetch all submissions and grades at once
    const sessionIds = sessions.map((s) => s.id);

    // Fetch all submissions for all sessions in one query
    const { data: allSubmissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("id, session_id, q_idx, answer")
      .in("session_id", sessionIds);

    if (submissionsError) {
      logError("Failed to fetch submissions for sessions", submissionsError, { path: "/api/student/sessions" });
    }

    // Fetch all grades for all sessions in one query
    const { data: allGrades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, q_idx, score, grade_type")
      .in("session_id", sessionIds);

    if (gradesError) {
      logError("Failed to fetch grades for sessions", gradesError, { path: "/api/student/sessions" });
    }

    // Create maps for O(1) lookups
    const submissionsBySession = new Map<string, typeof allSubmissions>();
    if (allSubmissions) {
      for (const submission of allSubmissions) {
        if (!submissionsBySession.has(submission.session_id)) {
          submissionsBySession.set(submission.session_id, []);
        }
        submissionsBySession.get(submission.session_id)!.push(submission);
      }
    }

    const gradesBySession = new Map<string, typeof allGrades>();
    if (allGrades) {
      for (const grade of allGrades) {
        if (!gradesBySession.has(grade.session_id)) {
          gradesBySession.set(grade.session_id, []);
        }
        gradesBySession.get(grade.session_id)!.push(grade);
      }
    }

    // Process sessions with pre-fetched data
    const sessionsWithDetails = sessions.map((session) => {
      const exam = examMap.get(session.exam_id);
      const submissions = submissionsBySession.get(session.id) || [];
      const grades = (gradesBySession.get(session.id) || []) as GradeRow[];
      const gradesReleased = exam?.grades_released === true;

      let totalScore = null;
      let maxScore = null;
      let averageScore = null;
      let isGraded = false;

      if (gradesReleased) {
        const dedupedGrades = deduplicateGrades(grades).filter(isScoringGrade);
        if (exam && Array.isArray(exam.questions)) {
          const submissionsByQuestion = new Map(
            submissions.map((submission) => [submission.q_idx, submission])
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
          isGraded = scoreResult.overallScore !== null && (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0);
          if (isGraded) {
            averageScore = scoreResult.overallScore;
            totalScore = scoreResult.overallScore;
            maxScore = 100;
          }
        } else {
          isGraded = dedupedGrades.length > 0;
          if (isGraded) {
            const totalPoints = dedupedGrades.reduce(
              (sum, grade) => sum + (grade.score || 0),
              0
            );
            averageScore = Math.round(totalPoints / dedupedGrades.length);
            totalScore = totalPoints;
            maxScore = dedupedGrades.length * 100;
          }
        }
      }

      return {
        id: session.id,
        examId: session.exam_id,
        examTitle: exam?.title || "알 수 없는 시험",
        examCode: exam?.code || "",
        examType: exam?.type || null,
        duration: exam?.duration || 0,
        deadline: exam?.deadline || null,
        status: session.submitted_at
          ? "completed"
          : session.status === "quiz_pending"
            ? "quiz-pending"
            : "in-progress",
        submittedAt: session.submitted_at || null,
        createdAt: session.created_at,
        submissionCount: submissions.length,
        score: totalScore,
        maxScore: maxScore,
        averageScore: averageScore,
        isGraded: gradesReleased ? isGraded : false,
        gradesReleased,
      };
    });

    const hasMore = filteredTotalCount
      ? offset + limit < filteredTotalCount
      : false;

    return successJson(
      {
        sessions: sessionsWithDetails,
        pagination: {
          page,
          limit,
          total: filteredTotalCount,
          hasMore,
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    logError("Failed to fetch student sessions", error, { path: "/api/student/sessions" });
    return errorJson("FETCH_SESSIONS_FAILED", "Failed to get student sessions", 500);
  }
}
