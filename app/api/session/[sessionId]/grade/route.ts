import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { batchGetUserInfo } from "@/lib/app-users";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { singleGradeUpdateSchema, validateRequest } from "@/lib/validations";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isSuccessfulGradeType,
  normalizeScoreWeights,
  type ScoreItem,
} from "@/lib/grade-utils";
import { hasQuestionWithQIdx } from "@/lib/case-grade-access";
import { gradeObjectiveAnswer, isObjectiveQuestion } from "@/lib/grading-helpers";

// Auto-grading (PUT) calls AI_MODEL_HEAVY multiple times — needs 300s
export const maxDuration = 300;

// P1-4: Supabase client created inside each handler (not module-level)
// to avoid stale connections in serverless cold starts.
// Same lazy getter pattern as submission-handlers.ts.
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

    // Check if user is instructor
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session data first (including ai_summary for auto-graded summary)
    // ai_summary가 없을 수 있으므로 안전하게 처리
    const supabase = getSupabase();

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id, submitted_at, used_clarifications, created_at, compressed_session_data, compression_metadata, ai_summary, auto_submitted, grading_progress, final_answer, final_answer_updated_at")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404, {
        details: sessionError?.message,
        sessionId,
      });
    }

    // Get exam data
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, instructor_id, questions, rubric, status, score_weights")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404, {
        details: examError?.message,
      });
    }

    // Normalize questions format (text -> prompt); keep objective grading fields
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        idx: q.idx,
        type: q.type,
        prompt: q.prompt || q.text, // Support both field names
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

    // Optimized: Fetch submissions, messages, grades, paste_logs, and assignment quiz in parallel
    const [submissionsResult, messagesResult, gradesResult, pasteLogsResult, quizResult] =
      await Promise.all([
        supabase
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
          .eq("session_id", sessionId),
        supabase
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
          .eq("session_id", sessionId),
        supabase
          .from("grades")
          .select(
            `
          id,
          q_idx,
          score,
          comment,
          stage_grading,
          ai_summary,
          grade_type,
          created_at
        `
          )
          .eq("session_id", sessionId),
        supabase
          .from("paste_logs")
          .select(
            `
          id,
          question_id,
          length,
          pasted_text,
          paste_start,
          paste_end,
          answer_length_before,
          is_internal,
          suspicious,
          timestamp,
          created_at
        `
          )
          .eq("session_id", sessionId)
          .order("timestamp", { ascending: true }),
        supabase
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
          .maybeSingle(),
      ]);

    const { data: submissions, error: submissionsError } = submissionsResult;
    const { data: messages, error: messagesError } = messagesResult;
    const { data: grades, error: gradesError } = gradesResult;
    const { data: pasteLogs, error: pasteLogsError } = pasteLogsResult;
    const { data: quizAttempt, error: quizError } = quizResult;

    const path = `/api/session/${sessionId}/grade`;
    if (submissionsError) logError("Submissions query failed", submissionsError, { path, additionalData: { sessionId } });
    if (messagesError) logError("Messages query failed", messagesError, { path, additionalData: { sessionId } });
    if (gradesError) logError("Grades query failed", gradesError, { path, additionalData: { sessionId } });
    if (pasteLogsError) logError("PasteLogs query failed", pasteLogsError, { path, additionalData: { sessionId } });
    if (quizError) logError("Assignment quiz query failed", quizError, { path, additionalData: { sessionId } });

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get student info from Clerk (batch call for consistency)
    const clerkUserMap = await batchGetUserInfo([session.student_id]);
    const clerkStudentInfo = clerkUserMap.get(session.student_id) ?? null;

    // Get student profile from database
    const { data: studentProfile } = await supabase
      .from("student_profiles")
      .select("name, student_number, school")
      .eq("student_id", session.student_id)
      .single();

    // Merge Clerk info with profile info (prefer profile name if available)
    const studentInfo = {
      name:
        studentProfile?.name ||
        clerkStudentInfo?.name ||
        `Student ${session.student_id.slice(0, 8)}`,
      email: clerkStudentInfo?.email || `${session.student_id}@example.com`,
      student_number: studentProfile?.student_number,
      school: studentProfile?.school,
    };

    // Decompress session data if available — track errors for frontend warning
    const decompressionErrors: Array<{ target: string; error: string }> = [];
    let decompressedSessionData = null;
    if (
      session.compressed_session_data &&
      typeof session.compressed_session_data === "string"
    ) {
      try {
        decompressedSessionData = decompressData(
          session.compressed_session_data
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown decompression error";
        decompressionErrors.push({ target: "sessionData", error: errMsg });
        logError("Error decompressing session data", error, {
          path: `/api/session/${sessionId}/grade`,
        });
      }
    }

    // Decompress and organize submissions by question index
    const submissionsByQuestion: Record<string, unknown> = {};
    if (submissions) {
      submissions.forEach((submission: Record<string, unknown>) => {
        const qIdx = submission.q_idx as number;
        let decompressedAnswerData = null;

        if (
          submission.compressed_answer_data &&
          typeof submission.compressed_answer_data === "string"
        ) {
          try {
            decompressedAnswerData = decompressData(
              submission.compressed_answer_data as string
            );
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown decompression error";
            decompressionErrors.push({ target: `submission_q${qIdx}`, error: errMsg });
            logError("Error decompressing answer data", error, {
              path: `/api/session/${sessionId}/grade`,
            });
          }
        }

        submissionsByQuestion[qIdx] = {
          ...submission,
          decompressed: {
            answerData: decompressedAnswerData,
          },
        };
      });
    }

    // Organize messages by question index and separate AI conversation and feedback
    const messagesByQuestion: Record<string, unknown> = {};
    if (messages) {
      messages.forEach((message: Record<string, unknown>) => {
        const qIdx = message.q_idx as number;
        let decompressedContent = null;

        if (
          message.compressed_content &&
          typeof message.compressed_content === "string"
        ) {
          try {
            decompressedContent = decompressData(
              message.compressed_content as string
            );
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown decompression error";
            decompressionErrors.push({ target: `message_q${qIdx}_${message.id}`, error: errMsg });
            logError("Error decompressing message content", error, {
              path: `/api/session/${sessionId}/grade`,
            });
          }
        }

        const messageData = {
          id: message.id,
          role: message.role,
          content: decompressedContent || message.content,
          created_at: message.created_at,
        };

        // Store by q_idx
        if (!messagesByQuestion[qIdx]) {
          messagesByQuestion[qIdx] = [];
        }
        (messagesByQuestion[qIdx] as Array<Record<string, unknown>>).push(
          messageData
        );

        // Also try to map q_idx to question index for backward compatibility
        // Find the question with matching id (considering the conversion formula)
        if (exam.questions && Array.isArray(exam.questions)) {
          const questionIndex = exam.questions.findIndex(
            (q: { id?: string | number }) => {
              if (!q.id) return false;
              // Check if q_idx matches the converted question.id
              const convertedId = Math.abs(parseInt(String(q.id)) % 2147483647);
              return convertedId === qIdx || String(q.id) === String(qIdx);
            }
          );

          if (questionIndex !== -1 && questionIndex !== qIdx) {
            if (!messagesByQuestion[questionIndex]) {
              messagesByQuestion[questionIndex] = [];
            }
            (
              messagesByQuestion[questionIndex] as Array<
                Record<string, unknown>
              >
            ).push(messageData);
          }
        }
      });

      // Sort messages by created_at within each question
      Object.keys(messagesByQuestion).forEach((qIdx) => {
        (messagesByQuestion[qIdx] as Array<Record<string, unknown>>).sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            new Date(a.created_at as string).getTime() -
            new Date(b.created_at as string).getTime()
        );
      });
    }

    // Organize grades by question index
    const gradesByQuestion: Record<string, unknown> = {};
    if (grades) {
      grades.forEach((grade: Record<string, unknown>) => {
        const qIdx = grade.q_idx as number;
        gradesByQuestion[qIdx] = grade;
      });
    }

    // Organize paste logs by question_id
    const pasteLogsByQuestion: Record<string, unknown[]> = {};
    if (pasteLogs) {
      pasteLogs.forEach((log: Record<string, unknown>) => {
        const questionId = log.question_id as string;
        if (questionId) {
          if (!pasteLogsByQuestion[questionId]) {
            pasteLogsByQuestion[questionId] = [];
          }
          pasteLogsByQuestion[questionId].push(log);
        }
      });
    }

    // Calculate overall score if grades exist
    let overallScore = null;
    if (exam.status === "closed" && Array.isArray(exam.questions)) {
      const scoreWeights = normalizeScoreWeights(exam.score_weights);
      const gradeByQ = new Map(
        deduplicateGrades(grades ?? [])
          .filter((grade) => isSuccessfulGradeType(grade.grade_type))
          .map((grade) => [grade.q_idx, grade])
      );
      const scoreItems: ScoreItem[] = exam.questions.map(
        (question: { idx?: number; type?: string; options?: string[]; correctOptionIndex?: number }, index: number) => {
          const qIdx = typeof question.idx === "number" ? question.idx : index;
          if (isObjectiveQuestion(question.type)) {
            const submission = submissionsByQuestion[qIdx] as
              | { answer?: string }
              | undefined;
            const objective = gradeObjectiveAnswer({
              rawAnswer: submission?.answer ?? "",
              options: question.options,
              correctOptionIndex: question.correctOptionIndex,
            });
            return { qIdx, type: question.type, score: objective?.score };
          }
          const grade = gradeByQ.get(qIdx);
          return { qIdx, type: question.type, score: grade?.score };
        }
      );
      const scoreResult = calculateScoreFromItems(scoreItems, scoreWeights);
      overallScore =
        scoreResult.overallScore !== null &&
        (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0)
          ? scoreResult.overallScore
          : null;
    }

    const responseData = {
      session: {
        id: session.id,
        exam_id: session.exam_id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        decompressed: decompressedSessionData,
        ai_summary: session.ai_summary || null, // 서버 사이드 자동 채점 요약 평가
        auto_submitted: session.auto_submitted || false, // 강제 종료로 자동 제출된 세션
        grading_progress: session.grading_progress || null, // QStash 진행률 상태 ({ status, total, completed, failed })
        final_answer: session.final_answer ?? null,
        final_answer_updated_at: session.final_answer_updated_at ?? null,
      },
      exam: exam,
      student: studentInfo,
      submissions: submissionsByQuestion,
      messages: messagesByQuestion,
      grades: gradesByQuestion, // 서버 사이드 자동 채점 점수
      pasteLogs: pasteLogsByQuestion, // 부정행위 의심 로그 (question_id별로 그룹화)
      overallScore,
      aiSummary: session.ai_summary || null, // 하위 호환성을 위해 유지
      assignmentQuiz: quizAttempt || null,
      gradingProgress: session.grading_progress || null, // 실시간 채점 진행률
      ...(decompressionErrors.length > 0 && { decompressionErrors }),
    };

    return successJson(responseData, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    logError("Grade GET handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "development"
        ? (error as Error)?.message || "Internal server error"
        : "Internal server error",
      500
    );
  }
}

// Save or update grades
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const supabase = getSupabase();
    const user = await currentUser();
    const body = await request.json();

    // Validate POST body with schema
    const validation = validateRequest(singleGradeUpdateSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }
    const { questionIdx, score, comment, stageGrading, expected_updated_at } = validation.data;

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session to verify instructor owns the exam
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // Get exam to check instructor and validate q_idx upper bound
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id, questions, status")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    if (exam.status !== "closed") {
      return errorJson(
        "EXAM_NOT_CLOSED",
        "시험 종료 후에 채점할 수 있습니다.",
        409
      );
    }

    // Validate q_idx bounds against exam questions (P1-2: also reject negative)
    if (questionIdx < 0) {
      return errorJson("VALIDATION_ERROR", `Invalid question index: ${questionIdx}`, 400);
    }
    if (Array.isArray(exam.questions) && !hasQuestionWithQIdx(exam.questions, questionIdx)) {
      return errorJson("VALIDATION_ERROR", `Invalid question index: ${questionIdx}`, 400);
    }

    // Optimistic locking: if client sends expected_updated_at, verify no concurrent edit
    if (expected_updated_at) {
      const { data: existingGrade } = await supabase
        .from("grades")
        .select("created_at")
        .eq("session_id", sessionId)
        .eq("q_idx", questionIdx)
        .single();

      if (existingGrade && existingGrade.created_at !== expected_updated_at) {
        return errorJson("CONFLICT", "Grade was modified by another user. Please refresh and try again.", 409);
      }
    }

    // Upsert grade with fallback for environments missing UNIQUE(session_id, q_idx)
    await upsertGradesBySessionQuestion(
      supabase as never,
      [
        {
          session_id: sessionId,
          q_idx: questionIdx,
          score,
          comment,
          stage_grading: stageGrading || null,
          grade_type: "manual",
        },
      ],
      "manual_grade_post"
    );

    const { data: result, error: fetchGradeError } = await supabase
      .from("grades")
      .select("*")
      .eq("session_id", sessionId)
      .eq("q_idx", questionIdx)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchGradeError) throw fetchGradeError;

    // Audit log: fire-and-forget with error catching
    try {
      await auditLog({
        action: "grade_update",
        userId: user.id,
        targetId: sessionId,
        details: { questionIdx, score, comment: comment?.slice(0, 200) },
      });
    } catch (auditError) {
      // Log but don't block the response
      logError("[grade] Audit log failed", auditError, { path: `/api/session/${sessionId}/grade` });
    }

    return successJson({
      grade: result,
    });
  } catch (error) {
    logError("Grade POST handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "development"
        ? (error as Error)?.message || "Internal server error"
        : "Internal server error",
      500
    );
  }
}

// Auto-grade all questions based on rubric — delegates to autoGradeSession()
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const supabase = getSupabase();
    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    const { forceRegrade = false } = body;

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Verify session exists and instructor owns the exam
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id, status")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam || exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    if (exam.status !== "closed") {
      return errorJson(
        "EXAM_NOT_CLOSED",
        "시험 종료 후에 채점할 수 있습니다.",
        409
      );
    }

    // Rate limit: expensive OpenAI auto-grading
    const rl = await checkRateLimitAsync(`ai:auto-grade:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many grading requests. Please wait.", 429);
    }

    // Check if already graded (unless force regrade)
    // forceRegrade path uses QStash re-publish; idempotency guard is skipped there.
    if (!forceRegrade) {
      const { data: existingGrades } = await supabase
        .from("grades")
        .select("q_idx, grade_type")
        .eq("session_id", sessionId);

      const hasSuccessfulGrade = existingGrades?.some(
        (g) => isSuccessfulGradeType(g.grade_type)
      );

      if (hasSuccessfulGrade) {
        return successJson({ message: "Already graded", skipped: true });
      }
    }

    // Reset grading_progress to queued so the UI shows progress immediately
    // while QStash (or in-process fallback) picks up the job.
    await supabase
      .from("sessions")
      .update({
        grading_progress: {
          status: "queued",
          total: 0,
          completed: 0,
          failed: 0,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", sessionId);

    // Clear prior grading_status marker so triggerGradingIfNeeded won't short-circuit
    if (forceRegrade) {
      const { data: sessForSummary } = await supabase
        .from("sessions")
        .select("ai_summary")
        .eq("id", sessionId)
        .maybeSingle();
      const prior = (sessForSummary?.ai_summary as Record<string, unknown> | null) || null;
      if (prior && "grading_status" in prior) {
        // Strip grading_status fields but keep any human summary content for reference.
        const {
          grading_status: _s,
          grading_failed_questions: _f,
          grading_completed_count: _c,
          grading_total_count: _t,
          grading_timed_out: _to,
          grading_failure_details: _d,
          ...rest
        } = prior;
        void _s; void _f; void _c; void _t; void _to; void _d;
        await supabase
          .from("sessions")
          .update({ ai_summary: Object.keys(rest).length > 0 ? rest : null })
          .eq("id", sessionId);
      }
    }

    // Enqueue via QStash (durable) or in-process fallback
    const triggerResult = await triggerGradingIfNeeded(sessionId, "manual_retry", {
      skipIdempotency: true,
    });

    return successJson({
      queued: triggerResult.queued,
      reason: triggerResult.reason,
    });
  } catch (error) {
    logError("Grade PUT handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "development"
        ? (error as Error)?.message || "Unknown error occurred"
        : "Internal server error",
      500
    );
  }
}
