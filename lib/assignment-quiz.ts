import { z } from "zod";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { buildAssignmentQuizGenerationPrompt } from "@/lib/prompts";
import { buildAiTextMetadata, callTrackedChatCompletion } from "@/lib/ai-tracking";
import { compressData } from "@/lib/compression";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { isAssignmentType } from "@/lib/grading-helpers";
import { logError } from "@/lib/logger";

export const DEADLINE_AUTO_SUBMIT_STATUSES = ["in_progress", "quiz_pending"] as const;

export const ASSIGNMENT_QUIZ_TIME_LIMIT_SECONDS = 15;
const ASSIGNMENT_QUIZ_QUESTION_COUNT = 3;

const quizQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(300)).length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  rationale: z.string().min(1).max(1000),
});

const quizGenerationSchema = z.object({
  questions: z.array(quizQuestionSchema).min(3).max(5),
});

export type AssignmentQuizQuestion = z.infer<typeof quizQuestionSchema>;
export type AssignmentQuizAnswerMap = Record<string, number>;

export interface PublicAssignmentQuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface AssignmentQuizAttemptPublic {
  id: string;
  sessionId: string;
  examId: string;
  status: string;
  questions: PublicAssignmentQuizQuestion[];
  answers: AssignmentQuizAnswerMap;
  score: number | null;
  totalQuestions: number;
  timeLimitSeconds: number;
  startedAt: string | null;
  submittedAt: string | null;
  remainingSeconds: number;
}

type EnsureQuizAttemptResult =
  | { quiz: AssignmentQuizAttemptPublic; exam: ExamRow }
  | {
      error:
        | "SESSION_NOT_FOUND"
        | "FORBIDDEN"
        | "EXAM_NOT_FOUND"
        | "NOT_ASSIGNMENT"
        | "QUIZ_LOAD_FAILED"
        | "QUIZ_CREATE_FAILED"
        | "QUIZ_START_FAILED"
        | "FINAL_ANSWER_REQUIRED";
    };

type SessionRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string | null;
  submitted_at: string | null;
  final_answer?: string | null;
};

type ExamRow = {
  id: string;
  title: string;
  code: string;
  type: string | null;
  assignment_prompt: string | null;
  questions: Array<{ text: string; type?: string }> | null;
  language?: string | null;
  deadline?: string | null;
};

type QuizAttemptRow = {
  id: string;
  session_id: string;
  exam_id: string;
  student_id: string;
  questions: AssignmentQuizQuestion[];
  answers: AssignmentQuizAnswerMap | null;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  status: string;
};

type LoadSessionAndExamResult =
  | { session: SessionRow; exam: ExamRow }
  | {
      error:
        | "SESSION_NOT_FOUND"
        | "FORBIDDEN"
        | "EXAM_NOT_FOUND"
        | "NOT_ASSIGNMENT";
    };

function publicQuiz(row: QuizAttemptRow): AssignmentQuizAttemptPublic {
  const startedAtMs = row.started_at ? new Date(row.started_at).getTime() : Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const remainingSeconds =
    row.submitted_at || !row.started_at
      ? 0
      : Math.max(0, row.time_limit_seconds - elapsedSeconds);

  return {
    id: row.id,
    sessionId: row.session_id,
    examId: row.exam_id,
    status: row.status,
    questions: row.questions.map(({ id, question, options }) => ({
      id,
      question,
      options,
    })),
    answers: row.answers || {},
    score: row.score,
    totalQuestions: row.total_questions,
    timeLimitSeconds: row.time_limit_seconds,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    remainingSeconds,
  };
}

function normalizeGeneratedQuestions(raw: unknown): AssignmentQuizQuestion[] {
  const parsed = quizGenerationSchema.safeParse(raw);
  const questions = parsed.success ? parsed.data.questions : [];
  return questions.slice(0, ASSIGNMENT_QUIZ_QUESTION_COUNT).map((question, index) => ({
    ...question,
    id: `q${index + 1}`,
  }));
}

function fallbackQuestions(): AssignmentQuizQuestion[] {
  return [
    {
      id: "q1",
      question: "AI와 대화한 내용을 바탕으로 제출 전 가장 먼저 확인해야 할 것은 무엇인가요?",
      options: [
        "AI가 제시한 결론을 그대로 외웠는지",
        "핵심 주장과 근거가 서로 연결되는지",
        "답변의 문장 길이가 충분한지",
        "출처 URL의 개수가 많은지",
      ],
      correctOptionIndex: 1,
      rationale: "리서치 이해도는 주장과 근거의 연결을 설명할 수 있는지로 확인합니다.",
    },
    {
      id: "q2",
      question: "AI 의존도가 높은 응시로 볼 가능성이 가장 큰 행동은 무엇인가요?",
      options: [
        "AI 답변의 근거를 다시 질문한다",
        "AI가 제시한 내용을 반례로 검토한다",
        "자기 분석 없이 정답만 요청한다",
        "웹 검색 근거와 AI 답변을 비교한다",
      ],
      correctOptionIndex: 2,
      rationale: "자기 분석 없이 정답만 요청하는 행동은 직접 답 의존 신호입니다.",
    },
    {
      id: "q3",
      question: "채팅 기반 과제에서 좋은 리서치 과정에 가장 가까운 것은 무엇인가요?",
      options: [
        "AI가 준 첫 답변을 최종 결론으로 고정한다",
        "자료, AI 답변, 자신의 가정을 비교하며 수정한다",
        "모르는 부분을 모두 AI에게 대신 결정하게 한다",
        "출처보다 답변 형식을 우선한다",
      ],
      correctOptionIndex: 1,
      rationale: "좋은 리서치는 근거와 가정을 비교하고 수정하는 과정입니다.",
    },
  ];
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function loadSessionAndExam(
  sessionId: string,
  userId: string
): Promise<LoadSessionAndExamResult> {
  const supabase = getSupabaseServer();
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id, status, submitted_at, final_answer")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return { error: "SESSION_NOT_FOUND" as const };
  }

  const sessionRow = session as SessionRow;
  if (sessionRow.student_id !== userId) {
    return { error: "FORBIDDEN" as const };
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, code, type, assignment_prompt, questions, language, deadline")
    .eq("id", sessionRow.exam_id)
    .maybeSingle();

  if (examError || !exam) {
    return { error: "EXAM_NOT_FOUND" as const };
  }

  const examRow = exam as ExamRow;
  if (!examRow.type || examRow.type === "exam") {
    return { error: "NOT_ASSIGNMENT" as const };
  }

  return { session: sessionRow, exam: examRow };
}

async function buildChatTranscript(sessionId: string): Promise<string> {
  const { data: messages, error } = await getSupabaseServer()
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error || !messages || messages.length === 0) {
    return "채팅 기록 없음";
  }

  return messages
    .map((message: { role: string; content: string }) => {
      const role = message.role === "user" ? "학생" : "AI";
      return `${role}: ${message.content}`;
    })
    .join("\n\n")
    .slice(0, 18000);
}

async function generateQuizQuestions(params: {
  sessionId: string;
  studentId: string;
  exam: ExamRow;
  chatTranscript: string;
}): Promise<AssignmentQuizQuestion[]> {
  const prompt = buildAssignmentQuizGenerationPrompt({
      preferences: null,
    examTitle: params.exam.title,
    assignmentPrompt: params.exam.assignment_prompt,
    questions: params.exam.questions || undefined,
    chatTranscript: params.chatTranscript,
    language: params.exam.language === "en" ? "en" : "ko",
    questionCount: ASSIGNMENT_QUIZ_QUESTION_COUNT,
  });

  try {
    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "system", content: prompt }],
          response_format: { type: "json_object" },
        }),
      {
        feature: "assignment_quiz",
        route: "/api/student/session/[sessionId]/quiz",
        model: AI_MODEL,
        userId: params.studentId,
        examId: params.exam.id,
        sessionId: params.sessionId,
        metadata: buildAiTextMetadata({
          inputText: prompt,
          extra: { question_count: ASSIGNMENT_QUIZ_QUESTION_COUNT },
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );

    const content = tracked.data.choices[0]?.message?.content || "";
    const generated = normalizeGeneratedQuestions(safeJsonParse(content));
    return generated.length >= 3 ? generated : fallbackQuestions();
  } catch (error) {
    logError("[assignment-quiz] Quiz generation failed; using fallback", error, {
      path: "lib/assignment-quiz.ts",
      additionalData: { sessionId: params.sessionId },
    });
    return fallbackQuestions();
  }
}

export async function ensureQuizAttempt(
  sessionId: string,
  userId: string
): Promise<EnsureQuizAttemptResult> {
  const loaded = await loadSessionAndExam(sessionId, userId);
  if (!("session" in loaded)) return loaded;

  const { session, exam } = loaded;

  // Defense-in-depth: 클라이언트가 submit_assignment를 우회해 quiz로 직진하는 경로 차단.
  // 이미 quiz_pending/submitted 단계로 넘어간 세션은 통과 (이전에 submitAssignment 가드를 거쳤음).
  if (
    session.status !== "quiz_pending" &&
    session.status !== "submitted" &&
    session.status !== "auto_submitted" &&
    session.status !== "locked"
  ) {
    const finalAnswer = (session.final_answer ?? "").trim();
    const deadlinePassed = !!exam.deadline && new Date(exam.deadline).getTime() < Date.now();
    if (!finalAnswer && !deadlinePassed) {
      return { error: "FINAL_ANSWER_REQUIRED" as const };
    }
  }

  const supabase = getSupabaseServer();
  const existing = await supabase
    .from("session_quiz_attempts")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing.error) {
    return { error: "QUIZ_LOAD_FAILED" as const };
  }

  let attempt = existing.data as QuizAttemptRow | null;

  if (!attempt) {
    const chatTranscript = await buildChatTranscript(sessionId);
    const questions = await generateQuizQuestions({
      sessionId,
      studentId: userId,
      exam,
      chatTranscript,
    });

    const insert = await supabase
      .from("session_quiz_attempts")
      .insert({
        session_id: sessionId,
        exam_id: exam.id,
        student_id: userId,
        questions,
        total_questions: questions.length,
        time_limit_seconds: ASSIGNMENT_QUIZ_TIME_LIMIT_SECONDS,
        status: "pending",
      })
      .select("*")
      .single();

    if (insert.error || !insert.data) {
      return { error: "QUIZ_CREATE_FAILED" as const };
    }
    attempt = insert.data as QuizAttemptRow;
  }

  if (!attempt.submitted_at && !attempt.started_at) {
    const now = new Date().toISOString();
    const update = await supabase
      .from("session_quiz_attempts")
      .update({ started_at: now, status: "in_progress", updated_at: now })
      .eq("id", attempt.id)
      .select("*")
      .single();

    if (update.error || !update.data) {
      return { error: "QUIZ_START_FAILED" as const };
    }
    attempt = update.data as QuizAttemptRow;
  }

  if (!session.submitted_at && session.status !== "quiz_pending") {
    await supabase
      .from("sessions")
      .update({ status: "quiz_pending", is_active: false })
      .eq("id", sessionId);
  }

  return { quiz: publicQuiz(attempt), exam };
}

function scoreAnswers(
  questions: AssignmentQuizQuestion[],
  answers: AssignmentQuizAnswerMap
): { correctCount: number; score: number } {
  const correctCount = questions.reduce((count, question) => {
    return answers[question.id] === question.correctOptionIndex ? count + 1 : count;
  }, 0);

  return {
    correctCount,
    score: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
  };
}

async function buildSubmissionSnapshot(params: {
  sessionId: string;
  quiz: QuizAttemptRow;
  answers: AssignmentQuizAnswerMap;
  score: number;
}): Promise<string> {
  const transcript = await buildChatTranscript(params.sessionId);
  const answerLines = params.quiz.questions
    .map((question) => {
      const selected = params.answers[question.id];
      const selectedText =
        typeof selected === "number" ? question.options[selected] || "무응답" : "무응답";
      return `- ${question.question}\n  - 학생 선택: ${selectedText}\n  - 정답: ${question.options[question.correctOptionIndex]}\n  - 근거: ${question.rationale}`;
    })
    .join("\n");

  return `[채팅 기반 과제 응시 기록]

학생은 별도 문서 답안을 작성하지 않고 AI와의 채팅 및 리서치 과정으로 과제를 수행했습니다.

[타임어택 퀴즈 결과]
점수: ${params.score}/100
${answerLines}

[학생-AI 대화 기록]
${transcript}`;
}

export async function submitQuizAttempt(params: {
  sessionId: string;
  userId: string;
  answers: AssignmentQuizAnswerMap;
}) {
  const loaded = await loadSessionAndExam(params.sessionId, params.userId);
  if (!("session" in loaded)) return loaded;

  const supabase = getSupabaseServer();
  const { data: attemptData, error: attemptError } = await supabase
    .from("session_quiz_attempts")
    .select("*")
    .eq("session_id", params.sessionId)
    .maybeSingle();

  if (attemptError || !attemptData) {
    return { error: "QUIZ_NOT_FOUND" as const };
  }

  const attempt = attemptData as QuizAttemptRow;
  if (attempt.submitted_at) {
    return { quiz: publicQuiz(attempt), alreadySubmitted: true };
  }

  const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Date.now();
  const isExpired =
    Date.now() > startedAt + attempt.time_limit_seconds * 1000;
  const normalizedAnswers = Object.fromEntries(
    Object.entries(params.answers).filter(([, value]) => Number.isInteger(value) && value >= 0 && value <= 3)
  ) as AssignmentQuizAnswerMap;
  const { correctCount, score } = scoreAnswers(attempt.questions, normalizedAnswers);
  const now = new Date().toISOString();
  const snapshot = await buildSubmissionSnapshot({
    sessionId: params.sessionId,
    quiz: attempt,
    answers: normalizedAnswers,
    score,
  });
  const compressed = compressData({
    chatHistory: snapshot,
    quiz: {
      answers: normalizedAnswers,
      score,
      correctCount,
      totalQuestions: attempt.questions.length,
      expired: isExpired,
    },
  });

  const [quizUpdate, submissionUpsert, sessionUpdate] = await Promise.all([
    supabase
      .from("session_quiz_attempts")
      .update({
        answers: normalizedAnswers,
        score,
        submitted_at: now,
        status: "submitted",
        updated_at: now,
      })
      .eq("id", attempt.id)
      .select("*")
      .single(),
    supabase
      .from("submissions")
      .upsert(
        {
          session_id: params.sessionId,
          q_idx: 0,
          answer: snapshot,
          updated_at: now,
        },
        { onConflict: "session_id,q_idx" }
      ),
    supabase
      .from("sessions")
      .update({
        status: "submitted",
        submitted_at: now,
        is_active: false,
        compressed_session_data: compressed.data,
        compression_metadata: compressed.metadata,
      })
      .eq("id", params.sessionId)
      .is("submitted_at", null),
  ]);

  if (quizUpdate.error || submissionUpsert.error || sessionUpdate.error) {
    logError("[assignment-quiz] Failed to finalize quiz submission", {
      quizError: quizUpdate.error,
      submissionError: submissionUpsert.error,
      sessionError: sessionUpdate.error,
    });
    return { error: "QUIZ_SUBMIT_FAILED" as const };
  }

  const triggerResult = await triggerGradingIfNeeded(params.sessionId, "submit_assignment");

  return {
    quiz: publicQuiz(quizUpdate.data as QuizAttemptRow),
    correctCount,
    score,
    grading: triggerResult,
  };
}

async function ensureDeadlineQuizAttempt(params: {
  sessionId: string;
  examId: string;
  studentId: string;
  questions: AssignmentQuizQuestion[];
}): Promise<QuizAttemptRow | null> {
  const supabase = getSupabaseServer();
  const existing = await supabase
    .from("session_quiz_attempts")
    .select("*")
    .eq("session_id", params.sessionId)
    .maybeSingle();

  if (existing.error) {
    logError("[assignment-quiz] Failed to load quiz for deadline auto-submit", existing.error, {
      path: "lib/assignment-quiz.ts",
      additionalData: { sessionId: params.sessionId },
    });
    return null;
  }

  if (existing.data) {
    return existing.data as QuizAttemptRow;
  }

  const insert = await supabase
    .from("session_quiz_attempts")
    .insert({
      session_id: params.sessionId,
      exam_id: params.examId,
      student_id: params.studentId,
      questions: params.questions,
      total_questions: params.questions.length,
      time_limit_seconds: ASSIGNMENT_QUIZ_TIME_LIMIT_SECONDS,
      status: "pending",
    })
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    logError("[assignment-quiz] Failed to create quiz for deadline auto-submit", insert.error, {
      path: "lib/assignment-quiz.ts",
      additionalData: { sessionId: params.sessionId },
    });
    return null;
  }

  return insert.data as QuizAttemptRow;
}

export type DeadlineAutoSubmitResult =
  | { ok: true; alreadySubmitted?: boolean }
  | { ok: false; error: string };

/**
 * Server-side deadline auto-submit for assignment sessions that started but
 * never completed submission (in_progress or quiz_pending) before the deadline.
 */
export async function autoSubmitAssignmentAtDeadline(
  sessionId: string
): Promise<DeadlineAutoSubmitResult> {
  const supabase = getSupabaseServer();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id, status, submitted_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { ok: false, error: "SESSION_NOT_FOUND" };
  }

  if (session.submitted_at) {
    return { ok: true, alreadySubmitted: true };
  }

  const status = session.status || "";
  if (!DEADLINE_AUTO_SUBMIT_STATUSES.includes(status as (typeof DEADLINE_AUTO_SUBMIT_STATUSES)[number])) {
    return { ok: false, error: "INELIGIBLE_STATUS" };
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, code, type, assignment_prompt, questions, language, deadline")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam || !isAssignmentType(exam.type)) {
    return { ok: false, error: "NOT_ASSIGNMENT" };
  }

  if (!exam.deadline || new Date(exam.deadline).getTime() >= Date.now()) {
    return { ok: false, error: "DEADLINE_NOT_PASSED" };
  }

  const now = new Date().toISOString();

  if (status === "in_progress") {
    const { error: promoteError } = await supabase
      .from("sessions")
      .update({
        status: "quiz_pending",
        is_active: false,
        auto_submitted: true,
        last_heartbeat_at: now,
      })
      .eq("id", sessionId)
      .is("submitted_at", null);

    if (promoteError) {
      return { ok: false, error: "PROMOTE_FAILED" };
    }
  } else {
    const { error: flagError } = await supabase
      .from("sessions")
      .update({ auto_submitted: true, is_active: false })
      .eq("id", sessionId)
      .is("submitted_at", null);

    if (flagError) {
      return { ok: false, error: "FLAG_FAILED" };
    }
  }

  const attempt = await ensureDeadlineQuizAttempt({
    sessionId,
    examId: exam.id,
    studentId: session.student_id,
    questions: fallbackQuestions(),
  });

  if (!attempt) {
    return { ok: false, error: "QUIZ_ENSURE_FAILED" };
  }

  if (!attempt.submitted_at) {
    const normalizedAnswers = Object.fromEntries(
      Object.entries(attempt.answers || {}).filter(
        ([, value]) => Number.isInteger(value) && value >= 0 && value <= 3
      )
    ) as AssignmentQuizAnswerMap;
    const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Date.now();
    const isExpired = Date.now() > startedAt + attempt.time_limit_seconds * 1000;
    const { correctCount, score } = scoreAnswers(attempt.questions, normalizedAnswers);
    const snapshot = await buildSubmissionSnapshot({
      sessionId,
      quiz: attempt,
      answers: normalizedAnswers,
      score,
    });
    const compressed = compressData({
      chatHistory: snapshot,
      quiz: {
        answers: normalizedAnswers,
        score,
        correctCount,
        totalQuestions: attempt.questions.length,
        expired: isExpired,
      },
    });

    const [quizUpdate, submissionUpsert, sessionUpdate] = await Promise.all([
      supabase
        .from("session_quiz_attempts")
        .update({
          answers: normalizedAnswers,
          score,
          submitted_at: now,
          status: "submitted",
          updated_at: now,
          ...(attempt.started_at ? {} : { started_at: now }),
        })
        .eq("id", attempt.id)
        .is("submitted_at", null),
      supabase
        .from("submissions")
        .upsert(
          {
            session_id: sessionId,
            q_idx: 0,
            answer: snapshot,
            updated_at: now,
          },
          { onConflict: "session_id,q_idx" }
        ),
      supabase
        .from("sessions")
        .update({
          status: "submitted",
          submitted_at: now,
          is_active: false,
          auto_submitted: true,
          compressed_session_data: compressed.data,
          compression_metadata: compressed.metadata,
        })
        .eq("id", sessionId)
        .is("submitted_at", null),
    ]);

    if (quizUpdate.error || submissionUpsert.error || sessionUpdate.error) {
      logError("[assignment-quiz] Deadline auto-submit finalize failed", {
        quizError: quizUpdate.error,
        submissionError: submissionUpsert.error,
        sessionError: sessionUpdate.error,
      });
      return { ok: false, error: "FINALIZE_FAILED" };
    }

    await triggerGradingIfNeeded(sessionId, "submit_assignment");
  }

  return { ok: true };
}
