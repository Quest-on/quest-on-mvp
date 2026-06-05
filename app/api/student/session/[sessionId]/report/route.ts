import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
  type ScoreItem,
} from "@/lib/grade-utils";
import { gradeObjectiveAnswer, isObjectiveQuestion } from "@/lib/grading-helpers";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// P1-4: Lazy Supabase getter to avoid stale connections in serverless
function getSupabase() {
  return getSupabaseServer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.role;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(`student-session-report:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Get session data
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    // Check if student owns this session
    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Check if session is submitted
    if (!session.submitted_at) {
      return errorJson("SESSION_NOT_SUBMITTED", "Session not submitted yet", 400);
    }

    // Get exam data
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, grades_released, score_weights")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // Normalize questions format
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        idx: q.idx,
        type: q.type,
        prompt: q.prompt || q.text,
        ai_context: q.ai_context,
        options: Array.isArray(q.options)
          ? (q.options as unknown[]).filter((o): o is string => typeof o === "string")
          : undefined,
        correctOptionIndex:
          typeof q.correctOptionIndex === "number" &&
          Number.isInteger(q.correctOptionIndex)
            ? q.correctOptionIndex
            : undefined,
      }));
    }

    // Get submissions
    const { data: submissions, error: submissionsError } = await getSupabase()
      .from("submissions")
      .select(
        `
        id,
        q_idx,
        answer,
        compressed_answer_data,
        compression_metadata,
        created_at
      `
      )
      .eq("session_id", sessionId)
      .order("q_idx", { ascending: true });

    if (submissionsError) {
      logError("Error fetching submissions", submissionsError);
    }

    // Get messages
    const { data: messages, error: messagesError } = await getSupabase()
      .from("messages")
      .select(
        `
        id,
        q_idx,
        role,
        content,
        compressed_content,
        compression_metadata,
        created_at
      `
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      logError("Error fetching messages", messagesError);
    }

    // Get grades (include grade_type for deduplication). Student reports only
    // expose numeric scores; qualitative feedback stays instructor-only.
    const { data: grades, error: gradesError } = await getSupabase()
      .from("grades")
      .select(
        `
        id,
        q_idx,
        score,
        grade_type,
        created_at
      `
      )
      .eq("session_id", sessionId)
      .order("q_idx", { ascending: true });

    if (gradesError) {
      logError("Error fetching grades", gradesError);
    }

    const { data: quizAttempt, error: quizError } = await getSupabase()
      .from("session_quiz_attempts")
      .select(
        `
        id,
        questions,
        answers,
        score,
        total_questions,
        time_limit_seconds,
        started_at,
        submitted_at,
        status
      `
      )
      .eq("session_id", sessionId)
      .maybeSingle();

    if (quizError) {
      logError("Error fetching assignment quiz attempt", quizError);
    }

    // Decompress session data if available
    let decompressedSessionData = null;
    if (
      session.compressed_session_data &&
      typeof session.compressed_session_data === "string"
    ) {
      try {
        decompressedSessionData = decompressData(
          session.compressed_session_data
        );
      } catch {
        // Decompression failed, continue with null
      }
    }

    // Organize submissions by question index
    const submissionsByQuestion: Record<
      number,
      {
        id: string;
        q_idx: number;
        answer: string;
        created_at: string;
      }
    > = {};

    if (submissions) {
      submissions.forEach((submission) => {
        let answer = submission.answer;

        // Decompress if needed
        if (submission.compressed_answer_data) {
          try {
            const decompressed = decompressData(
              submission.compressed_answer_data
            );
            if (decompressed && typeof decompressed === "object") {
              const decompressedObj = decompressed as Record<string, unknown>;
              answer =
                (typeof decompressedObj.answer === "string"
                  ? decompressedObj.answer
                  : answer) || answer;
            }
          } catch {
            // Decompression failed, continue with original
          }
        }

        submissionsByQuestion[submission.q_idx] = {
          id: submission.id,
          q_idx: submission.q_idx,
          answer: typeof answer === "string" ? answer : JSON.stringify(answer),
          created_at: submission.created_at,
        };
      });
    }

    // Organize messages by question index
    const messagesByQuestion: Record<
      number,
      Array<Record<string, unknown>>
    > = {};

    if (messages) {
      messages.forEach((message) => {
        let content = message.content;

        // Decompress if needed
        if (message.compressed_content) {
          try {
            content = decompressData(message.compressed_content);
          } catch {
            // Decompression failed, continue with original
          }
        }

        const qIdx = message.q_idx || 0;
        if (!messagesByQuestion[qIdx]) {
          messagesByQuestion[qIdx] = [];
        }

        messagesByQuestion[qIdx].push({
          role: message.role,
          content:
            typeof content === "string" ? content : JSON.stringify(content),
          created_at: message.created_at,
        });
      });
    }

    // Deduplicate grades (manual > auto > ai_failed) and organize by question index
    const gradesByQuestion: Record<
      number,
      {
        id: string;
        q_idx: number;
        score: number;
      }
    > = {};

    let overallScore = null;
    let gradedCount = 0;
    const totalQuestionCount = exam.questions?.length || 0;

    const deduped = deduplicateGrades(grades ?? []);
    if (deduped.length > 0) {
      deduped.forEach((grade) => {
        gradesByQuestion[grade.q_idx] = {
          id: grade.id,
          q_idx: grade.q_idx,
          score: grade.score,
        };
      });
    }
    if (Array.isArray(exam.questions)) {
      const gradeByQ = new Map(
        deduped.filter(isScoringGrade).map((grade) => [grade.q_idx, grade])
      );
      const scoreWeights = normalizeScoreWeights(exam.score_weights);
      const scoreItems: ScoreItem[] = exam.questions.map(
        (question: { idx?: number; type?: string; options?: string[]; correctOptionIndex?: number }, index: number) => {
          const qIdx = typeof question.idx === "number" ? question.idx : index;
          if (isObjectiveQuestion(question.type)) {
            const objective = gradeObjectiveAnswer({
              rawAnswer: submissionsByQuestion[qIdx]?.answer ?? "",
              options: question.options,
              correctOptionIndex: question.correctOptionIndex,
            });
            if (objective) {
              gradesByQuestion[qIdx] = {
                id: gradeByQ.get(qIdx)?.id ?? `objective-${qIdx}`,
                q_idx: qIdx,
                score: objective.score,
              };
            }
            return { qIdx, type: question.type, score: objective?.score };
          }
          return { qIdx, type: question.type, score: gradeByQ.get(qIdx)?.score };
        }
      );
      const result = calculateScoreFromItems(scoreItems, scoreWeights);
      gradedCount = result.gradedCount;
      overallScore =
        result.overallScore !== null &&
        (result.mode === "weighted" || result.gradedCount > 0)
          ? result.overallScore
          : null;
    }

    const gradesReleased = exam.grades_released === true;

    // 정답 누출 방지: 점수 계산은 끝났으므로 응답에서 correctOptionIndex를 제거한다.
    // 학생은 정오답을 문항별 점수(공개 후에만 노출)로 확인하고, 정답 선택지는 보지 않는다.
    const examForClient = {
      ...exam,
      questions: Array.isArray(exam.questions)
        ? exam.questions.map((q: Record<string, unknown>) => {
            const rest = { ...q };
            delete rest.correctOptionIndex;
            return rest;
          })
        : exam.questions,
    };

    return successJson({
      session: {
        id: session.id,
        exam_id: session.exam_id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        created_at: session.created_at,
        decompressed: decompressedSessionData,
      },
      exam: examForClient,
      submissions: submissionsByQuestion,
      messages: messagesByQuestion,
      grades: gradesReleased ? gradesByQuestion : {},
      overallScore: gradesReleased ? overallScore : null,
      gradedCount: gradesReleased ? gradedCount : 0,
      totalQuestionCount,
      assignmentQuiz: quizAttempt || null,
      gradesReleased,
      // Progress is safe to expose even before grades_released — it only contains counts/status,
      // no scores. Lets the student see "3/10 채점 중" progress while the AI runs.
      gradingProgress: session.grading_progress || null,
    });
  } catch {
    return errorJson("FETCH_REPORT_FAILED", "Failed to get report", 500);
  }
}
