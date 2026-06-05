import { z } from "zod";
import { getOpenAI, AI_MODEL_HEAVY } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildSummaryGenerationSystemPrompt,
  buildSummaryEvaluationSystemPrompt,
  buildAssignmentResearchSummarySystemPrompt,
  buildAssignmentGradingPrompt,
} from "@/lib/prompts";
import { logError } from "@/lib/logger";
import {
  decompressSubmissions,
  decompressMessages,
  normalizeQuestions,
  analyzeAiDependency,
  formatAiDependencyForPrompt,
  summarizeAiDependencyAssessments,
  isCaseQuestion,
  isObjectiveQuestion,
  gradeObjectiveAnswer,
  formatSummaryScoreLabel,
  type DecompressionWarning,
  type NormalizedQuestion,
} from "@/lib/grading-helpers";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { sanitizeUserInput } from "@/lib/sanitize";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import {
  normalizeAssignmentGradeScore,
  scoreToAssignmentLabel,
} from "@/lib/grading-utils";
import { isSuccessfulGradeType } from "@/lib/grade-utils";
import type {
  StageGrading,
  SummaryData,
  QuestionSummaryData,
  AiDependencyAssessment,
  GradingProgress,
  GradingProgressStatus,
} from "@/lib/types/grading";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges a patch into sessions.grading_progress atomically in JS.
 * Best-effort — failures are logged but do not abort grading.
 */
async function updateGradingProgress(
  supabase: SupabaseClient,
  sessionId: string,
  patch: Partial<GradingProgress>
): Promise<void> {
  try {
    const { data: current, error: readErr } = await supabase
      .from("sessions")
      .select("grading_progress")
      .eq("id", sessionId)
      .maybeSingle();

    if (readErr) {
      logError("[AUTO_GRADE] Failed to read grading_progress", readErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
      return;
    }

    const existing = (current?.grading_progress as GradingProgress | null) || {
      status: "queued" as GradingProgressStatus,
      total: 0,
      completed: 0,
      failed: 0,
      updated_at: new Date().toISOString(),
    };

    const merged: GradingProgress = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ grading_progress: merged })
      .eq("id", sessionId);

    if (updateErr) {
      logError("[AUTO_GRADE] Failed to update grading_progress", updateErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId, patch },
      });
    }
  } catch (err) {
    logError("[AUTO_GRADE] Unexpected error in updateGradingProgress", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId, patch },
    });
  }
}

interface GradeResult {
  q_idx: number;
  score: number; // 0-100
  comment: string;
  stage_grading?: StageGrading;
  ai_summary?: QuestionSummaryData | null;
  /** Case/essay question submitted but not manually graded yet. */
  ungraded?: boolean;
}

interface AutoGradeResult {
  grades: GradeResult[];
  summary: SummaryData | null;
  failedQuestions: number[];
  timedOut: boolean;
  decompressionWarnings?: DecompressionWarning[];
}

/** P0-4: Sanitize AI-generated comment to plain text (server-safe, no jsdom). */
function sanitizeComment(comment: string): string {
  if (!comment) return "";
  return sanitizeUserInput(comment).slice(0, 10000);
}

/** Clamp a score to [0, 100] and log if clamping occurred */
function clampAndLog(
  score: number,
  context: { sessionId: string; qIdx: number; field: string }
): { value: number; clamped: boolean } {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const wasClamped = clamped !== Math.round(score);
  if (wasClamped) {
    logError("[AUTO_GRADE] Score clamped to 0-100 range", null, {
      path: "lib/grading.ts",
      additionalData: {
        sessionId: context.sessionId,
        qIdx: context.qIdx,
        field: context.field,
        originalScore: score,
        clampedScore: clamped,
      },
    });
  }
  return { value: clamped, clamped: wasClamped };
}

type GradeSingleQuestionOutcome =
  | { ok: true; result: GradeResult; aiDependency: AiDependencyAssessment | null }
  | { ok: false; failureReason: string };

type RubricItem = {
  evaluationArea: string;
  detailedCriteria: string;
};

function resolveAssignmentRubric(
  question: { rubric?: RubricItem[] },
  examRubric: unknown
): RubricItem[] {
  if (question.rubric && question.rubric.length > 0) {
    return question.rubric;
  }
  return Array.isArray(examRubric) ? (examRubric as RubricItem[]) : [];
}

function buildAssignmentRubricText(rubricItems: RubricItem[]): string {
  if (rubricItems.length === 0) return "";

  return `
**평가 루브릭 기준:**
${rubricItems
  .map(
    (item, index) =>
      `${index + 1}. ${item.evaluationArea}
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}
`;
}

/**
 * 단일 문제 채점 (기존 pLimit 내부 closure 로직 추출)
 */
async function gradeSingleQuestion(params: {
  question: { idx: number; prompt?: string; ai_context?: string };
  submission: { answer: string; workspace_state?: unknown } | undefined;
  questionMessages: Array<{ role: string; content: string }>;
  exam: { id: string; title: string; rubric?: unknown; chat_weight?: number; type?: string; language?: string };
  rubricItems: RubricItem[];
  chatWeight: number;
  isAssignment: boolean;
  /**
   * 과제(assignment)의 학생 작성 최종답안. exam 모드에선 무시.
   * submission.answer(채팅 스냅샷)와는 별개의 입력이다.
   */
  sessionFinalAnswer?: string | null;
  sessionId: string;
  studentId: string;
  signal: AbortSignal;
  /** Absolute deadline timestamp (ms). Used to cap per-attempt timeout so retries never blow past the overall budget. */
  deadline: number;
}): Promise<GradeSingleQuestionOutcome> {
  const {
    question,
    submission,
    questionMessages,
    exam,
    rubricItems,
    chatWeight,
    isAssignment,
    sessionFinalAnswer,
    sessionId,
    studentId,
    signal,
    deadline,
  } = params;

  const qIdx = question.idx;
  const rubricText = buildAssignmentRubricText(rubricItems);

  if (!submission) {
    return { ok: false, failureReason: "No submission for question" };
  }

  if (!isAssignment) {
    return { ok: false, failureReason: "Non-objective exam question skipped" };
  }

  // 과제 모드에선 학생이 직접 작성한 최종답안과 AI 응답의 유사도를 비교해야 한다.
  // 기존엔 submission.answer(채팅 스냅샷)가 들어가서 사실상 "채팅 vs 채팅"이 됐었음 — 정정.
  const aiDependencyAssessment = analyzeAiDependency({
    messages: questionMessages,
    finalAnswer: sessionFinalAnswer ?? "",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws = submission.workspace_state as any;
  const wsCode = typeof ws?.code === "string" ? ws.code : "";
  const wsErd = ws?.erd as
    | {
        nodes?: Array<{
          data: {
            tableName: string;
            columns: Array<{
              name: string;
              type: string;
              isPrimary?: boolean;
              isForeignKey?: boolean;
              references?: string;
            }>;
          };
        }>;
        edges?: Array<{ source: string; target: string; type?: string }>;
      }
    | undefined;
  const hasWorkspace = !!(wsCode.trim() || (wsErd?.nodes?.length ?? 0) > 0);

  const systemPrompt = buildAssignmentGradingPrompt({
    examTitle: exam.title,
    assignmentPrompt: question.prompt || null,
    rubricText,
    workspaceContext: hasWorkspace
      ? {
          code: wsCode || undefined,
          language: typeof ws?.language === "string" ? ws.language : undefined,
          erd: wsErd?.nodes?.length
            ? { nodes: wsErd.nodes, edges: wsErd.edges || [] }
            : undefined,
        }
      : null,
  });

  const aiSummaryText = aiDependencyAssessment.summary
    ? `\n\n[AI 활용 요약]\n${aiDependencyAssessment.summary}`
    : "";

  const finalAnswerText = (sessionFinalAnswer ?? "").trim();
  const finalAnswerSection = `\n\n[학생이 작성한 최종답안]\n${finalAnswerText || "(작성되지 않음)"}`;

  const userPrompt = `[학생의 채팅 기반 과제 수행 기록]\n${submission.answer || "(기록 없음)"}${finalAnswerSection}${aiSummaryText}`;

  // Retry loop: up to 2 retries (3 total attempts) with exponential backoff (1s, 2s)
  const MAX_GRADING_RETRIES = 2;
  const RETRY_DELAYS_MS = [1_000, 2_000];
  /** Minimum useful timeout per attempt — below this it's not worth trying */
  const MIN_ATTEMPT_TIMEOUT_MS = 15_000;
  /** Hard cap per attempt */
  const MAX_ATTEMPT_TIMEOUT_MS = 75_000;
  /** Safety buffer before deadline (for DB writes, progress updates, etc.) */
  const DEADLINE_SAFETY_BUFFER_MS = 10_000;

  let rawParsed: unknown = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      logError(
        `[AUTO_GRADE] Retrying grading API call (attempt ${attempt + 1}/${MAX_GRADING_RETRIES + 1})`,
        null,
        {
          path: "lib/grading.ts",
          additionalData: { sessionId, qIdx, attempt },
        }
      );
    }

    // Deadline-aware per-attempt timeout:
    // Distribute remaining time evenly across remaining attempts so retries
    // never push past the caller-provided grading deadline.
    const remainingMs = deadline - Date.now() - DEADLINE_SAFETY_BUFFER_MS;
    if (remainingMs < MIN_ATTEMPT_TIMEOUT_MS) {
      logError("[AUTO_GRADE] Insufficient time remaining — skipping attempt", null, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, attempt, remainingMs },
      });
      return { ok: false, failureReason: "Insufficient time remaining before deadline" };
    }
    const remainingAttempts = MAX_GRADING_RETRIES - attempt + 1;
    const attemptTimeoutMs = Math.max(
      MIN_ATTEMPT_TIMEOUT_MS,
      Math.min(MAX_ATTEMPT_TIMEOUT_MS, Math.floor(remainingMs / remainingAttempts))
    );

    try {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create(
            {
              model: AI_MODEL_HEAVY,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            },
            { signal }
          ),
        {
          feature: "auto_grading_question",
          route: "lib/grading.ts",
          model: AI_MODEL_HEAVY,
          userId: studentId,
          examId: exam.id,
          sessionId,
          qIdx,
          metadata: buildAiTextMetadata({
            inputText: [systemPrompt, userPrompt],
            extra: {
              chat_weight: chatWeight,
              rubric_item_count: rubricItems.length,
              message_count: questionMessages.length,
              attempt,
              attemptTimeoutMs,
            },
          }),
        },
        {
          timeoutMs: attemptTimeoutMs,
          // Disable internal retries — gradeSingleQuestion's own deadline-aware
          // retry loop handles all retry logic. Without this, callOpenAIWithTelemetry
          // retries 3× on 5xx/429, multiplying per-question time up to 3× 225s = 675s.
          maxAttempts: 1,
          metadataBuilder: (result) =>
            buildAiTextMetadata({
              outputText:
                (result as { choices?: Array<{ message?: { content?: string | null } }> })
                  .choices?.[0]?.message?.content ?? null,
            }),
        }
      );
      const c = tracked.data;
      if (!c.choices?.length) {
        throw new Error("Empty AI response (no choices)");
      }
      rawParsed = JSON.parse(c.choices[0]?.message?.content || "{}");
      break; // success
    } catch (err) {
      lastError = err;
      if (attempt === MAX_GRADING_RETRIES) {
        logError(
          `[AUTO_GRADE] All ${MAX_GRADING_RETRIES + 1} grading attempts failed`,
          err,
          {
            path: "lib/grading.ts",
            additionalData: { sessionId, qIdx },
          }
        );
        return {
          ok: false,
          failureReason: `API failed after ${MAX_GRADING_RETRIES + 1} attempts: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      logError(`[AUTO_GRADE] Grading attempt ${attempt + 1} failed, will retry`, err, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx, attempt },
      });
    }
  }

  if (rawParsed === null) {
    return {
      ok: false,
      failureReason: `Grading failed: ${lastError instanceof Error ? lastError.message : "unknown"}`,
    };
  }

  const assignmentResponseSchema = z.object({
    rubric_scores: z
      .array(
        z.object({
          area: z.string(),
          score: z.number().finite().min(0).max(100),
          comment: z.string(),
        })
      )
      .optional(),
    overall_score: z.number().finite().min(0).max(100),
    overall_comment: z.string(),
  });

  const assignmentResult = assignmentResponseSchema.safeParse(rawParsed);
  if (!assignmentResult.success) {
    logError("[AUTO_GRADE] Assignment response schema validation failed", assignmentResult.error, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx, rawContent: JSON.stringify(rawParsed).slice(0, 500) },
    });
    return { ok: false, failureReason: "Assignment schema validation failure" };
  }

  const assignmentParsed = assignmentResult.data;
  const normalizedScore = normalizeAssignmentGradeScore(assignmentParsed.overall_score);
  const assignmentLabel = scoreToAssignmentLabel(normalizedScore);
  const scoreClamp = clampAndLog(normalizedScore, {
    sessionId,
    qIdx,
    field: "overall_score",
  });

  const assignmentRubricScores: Record<string, number> = {};
  if (assignmentParsed.rubric_scores) {
    for (const rs of assignmentParsed.rubric_scores) {
      assignmentRubricScores[rs.area] = normalizeAssignmentGradeScore(rs.score);
    }
  }
  const assignmentComment = sanitizeComment(
    assignmentParsed.overall_comment?.includes("등급:")
      ? assignmentParsed.overall_comment
      : `등급: ${assignmentLabel}. ${assignmentParsed.overall_comment || "과제 평가 완료"}`
  );

  const stageGrading: StageGrading = {
    answer: {
      score: scoreClamp.value,
      comment: assignmentComment,
      rubric_scores:
        Object.keys(assignmentRubricScores).length > 0 ? assignmentRubricScores : undefined,
    },
  };

  return {
    ok: true,
    aiDependency: null,
    result: {
      q_idx: qIdx,
      score: scoreClamp.value,
      comment: assignmentComment,
      stage_grading: scoreClamp.clamped
        ? { ...stageGrading, _score_clamped: true }
        : stageGrading,
    },
  };
}

/**
 * 문제별 종합평가 생성 — grades.ai_summary 컬럼에 저장.
 * 기존 buildSummaryEvaluationSystemPrompt를 재활용하되, 단일 문제로 스코프 좁힘.
 */
async function generateQuestionSummary(params: {
  question: { idx: number; prompt?: string; ai_context?: string };
  submission: { answer: string } | undefined;
  questionMessages: Array<{ role: string; content: string }>;
  grade: GradeResult;
  rubricItems: RubricItem[];
  examTitle: string;
  isAssignment?: boolean;
  examId: string;
  sessionId: string;
  studentId: string;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<QuestionSummaryData | null> {
  const {
    question,
    submission,
    questionMessages,
    grade,
    rubricItems,
    examTitle,
    isAssignment = false,
    examId,
    sessionId,
    studentId,
    signal,
    timeoutMs,
  } = params;

  try {
    const rubricText =
      rubricItems.length > 0
        ? `\n[평가 루브릭]\n${rubricItems
            .map(
              (item, index) =>
                `${index + 1}. ${item.evaluationArea}\n   - 세부 기준: ${item.detailedCriteria}`
            )
            .join("\n")}\n`
        : "";

    const chatHistoryText =
      questionMessages.length > 0
        ? `\n\n**학생과 AI의 대화 기록:**\n${questionMessages
            .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
            .join("\n\n")}`
        : "";

    const aiDependencyText = grade.stage_grading?.chat?.ai_dependency
      ? `\nAI 활용/의존 신호:\n${formatAiDependencyForPrompt(grade.stage_grading.chat.ai_dependency)}`
      : "";

    const stageInfoText = [
      grade.stage_grading?.chat ? `채팅 단계 점수: ${grade.stage_grading.chat.score}점` : "",
      grade.stage_grading?.answer ? `답안 단계 점수: ${grade.stage_grading.answer.score}점` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = isAssignment
      ? buildAssignmentResearchSummarySystemPrompt()
      : buildSummaryGenerationSystemPrompt();
    const assignmentLabel = isAssignment ? scoreToAssignmentLabel(grade.score) : null;

    const userPrompt = isAssignment
      ? `
과제 제목: ${examTitle}
${rubricText}
과제 ${question.idx + 1}: ${question.prompt || ""}

학생의 채팅 기반 리서치 수행 기록:
${submission?.answer || "기록 없음"}
${chatHistoryText}

평가 등급: ${assignmentLabel}
${stageInfoText}
${aiDependencyText}

위 과제에 대한 학생의 채팅 기반 리서치 과정을 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 질문 흐름이 개념 확인, 적용 사례 탐색, 성과 지표 확인, 출처 검증, 교차검증으로 어떻게 발전했는지 분석.
3. 주요 강점 (3가지 이내): 후속 질문, 출처 요청, 자료 신뢰도 판단, AI 답변 검증, 방향 전환이 드러난 구체적 행동을 제시하세요.
4. 개선이 필요한 점 (3가지 이내): 부족한 리서치 행동을 다음 대화에서 해야 할 행동으로 제시하세요.
5. 핵심 인용구 (2가지): 학생의 좋은 질문, 검증 시도, 방향 전환, 자료 판단이 드러나는 채팅 또는 퀴즈 기록을 원문 그대로 인용하세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["개선점1", "개선점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`
      : `
시험 제목: ${examTitle}
${rubricText}
문제 ${question.idx + 1}: ${question.prompt || ""}

학생 답안:
${submission?.answer || "답안 없음"}
${chatHistoryText}

점수: ${grade.score}점
${stageInfoText}
${aiDependencyText}

위 문제에 대한 학생의 수행을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 답안과 대화의 논리성, 정확성, 이해도를 종합적으로 분석.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 평가에 결정적인 영향을 미친 문장을 원문 그대로 인용하세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["개선점1", "개선점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create(
          {
            model: AI_MODEL_HEAVY,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            seed: deriveSessionSeed(sessionId),
          },
          { signal }
        ),
      {
        feature: "auto_grading_question_summary",
        route: "lib/grading.ts",
        model: AI_MODEL_HEAVY,
        userId: studentId,
        examId,
        sessionId,
        qIdx: question.idx,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userPrompt],
          extra: { rubric_item_count: rubricItems.length, message_count: questionMessages.length },
        }),
      },
      {
        timeoutMs,
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );

    const completion = tracked.data;

    const questionSummarySchema = z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      summary: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      keyQuotes: z.array(z.string()).optional(),
    });

    let rawSummary: unknown;
    try {
      rawSummary = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (parseErr) {
      logError("[AUTO_GRADE] Failed to parse per-question summary JSON", parseErr, {
        path: "lib/grading.ts",
        additionalData: {
          sessionId,
          qIdx: question.idx,
          rawContent: (completion.choices[0]?.message?.content ?? "(empty)").slice(0, 500),
        },
      });
      return null;
    }

    const validation = questionSummarySchema.safeParse(rawSummary);
    if (!validation.success) {
      logError("[AUTO_GRADE] Per-question summary schema validation failed", validation.error, {
        path: "lib/grading.ts",
        additionalData: {
          sessionId,
          qIdx: question.idx,
          rawContent: JSON.stringify(rawSummary).slice(0, 500),
        },
      });
      return null;
    }

    return validation.data;
  } catch (err) {
    logError("[AUTO_GRADE] generateQuestionSummary failed", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx: question.idx },
    });
    return null;
  }
}

// ============================================================
// Phase-based grading pipeline (chained QStash jobs)
// ------------------------------------------------------------
// autoGradeSession is no longer the production path — QStash
// runs `gradeOneQuestion`, then `generateOneQuestionSummary`,
// then `generateSessionSummaryPhase` as independent jobs.
// Each phase is idempotent (skip-if-done) to make QStash
// retries cheap no-ops rather than cost bombs.
// ============================================================

interface PhaseContext {
  session: { id: string; exam_id: string; student_id: string; final_answer?: string | null };
  exam: {
    id: string;
    title: string;
    questions: unknown;
    rubric?: unknown;
    chat_weight?: number;
    type?: string;
    language?: string;
  };
  questions: NormalizedQuestion[];
  questionsToGrade: NormalizedQuestion[];
  submissionsByQuestion: Record<number, { answer: string; workspace_state?: unknown }>;
  messagesByQuestion: Record<number, Array<{ role: string; content: string }>>;
  chatWeight: number;
  isAssignment: boolean;
  decompressionWarnings: DecompressionWarning[];
}

/**
 * Load everything a single phase job needs. Called once per job; a handful
 * of extra DB queries per phase is the explicit trade-off we accept to make
 * each job self-contained and safely retryable without shared state.
 */
async function loadPhaseContext(
  sessionId: string,
  supabase: SupabaseClient
): Promise<PhaseContext> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id, final_answer")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, questions, rubric, chat_weight, type, language")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    throw new Error(`Exam not found for session: ${sessionId}`);
  }

  const [submissionsResult, messagesResult] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id, q_idx, answer, compressed_answer_data, workspace_state, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, q_idx, role, content, compressed_content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (submissionsResult.error) {
    throw new Error(
      `Failed to fetch submissions: ${submissionsResult.error.message}`
    );
  }

  const decompressionWarnings: DecompressionWarning[] = [];
  const submissionsByQuestion = decompressSubmissions(
    submissionsResult.data || [],
    decompressionWarnings
  );
  const messagesByQuestion = decompressMessages(
    messagesResult.data || [],
    decompressionWarnings
  );

  const questions = normalizeQuestions(exam.questions);
  const chatWeight = Math.max(0, Math.min(100, exam.chat_weight ?? 50));
  const isAssignment = exam.type === "assignment";
  const questionsToGrade = isAssignment
    ? questions.filter((q) => q.idx === 0)
    : questions;

  return {
    session,
    exam,
    questions,
    questionsToGrade,
    submissionsByQuestion,
    messagesByQuestion,
    chatWeight,
    isAssignment,
    decompressionWarnings,
  };
}

/**
 * Ordered list of q_idxes that have a submission and are candidates for
 * grading. Exam sessions only auto-grade objective questions; assignment
 * sessions keep their separate single-question grading path.
 */
export async function listQuestionsToGrade(
  sessionId: string
): Promise<number[]> {
  const supabase = getSupabaseServer();
  const ctx = await loadPhaseContext(sessionId, supabase);
  return ctx.questionsToGrade
    .filter((q) => !!ctx.submissionsByQuestion[q.idx])
    .filter((q) => ctx.isAssignment || isObjectiveQuestion(q.type))
    .map((q) => q.idx)
    .sort((a, b) => a - b);
}

export async function isAssignmentGradingSession(
  sessionId: string
): Promise<boolean> {
  const supabase = getSupabaseServer();
  const ctx = await loadPhaseContext(sessionId, supabase);
  return ctx.isAssignment;
}

export async function markObjectiveOnlyGradingDone(
  sessionId: string,
  totals?: { total?: number; completed?: number; failed?: number }
): Promise<void> {
  const supabase = getSupabaseServer();
  await updateGradingProgress(supabase, sessionId, {
    status: "completed",
    total: totals?.total ?? 0,
    completed: totals?.completed ?? totals?.total ?? 0,
    failed: totals?.failed ?? 0,
    phase: "objective_only_done",
    current_q_idx: undefined,
  });
}

/**
 * Ordered list of q_idxes that have a real successful grade
 * row — these are the ones we generate per-question summaries for.
 */
/**
 * Case/essay q_idxes with a submission — used for per-question summaries on exams.
 */
export async function listCaseQuestionsForSummary(
  sessionId: string
): Promise<number[]> {
  const supabase = getSupabaseServer();
  const ctx = await loadPhaseContext(sessionId, supabase);
  return ctx.questionsToGrade
    .filter((q) => !!ctx.submissionsByQuestion[q.idx])
    .filter((q) => isCaseQuestion(q.type))
    .map((q) => q.idx)
    .sort((a, b) => a - b);
}

export async function listGradedQuestionsForSummary(
  sessionId: string
): Promise<number[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("grades")
    .select("q_idx, grade_type")
    .eq("session_id", sessionId);

  if (error) throw new Error(`Failed to list grades: ${error.message}`);

  return (data || [])
    .filter(
      (g) =>
        isSuccessfulGradeType((g as { grade_type?: string }).grade_type) &&
        typeof (g as { q_idx?: unknown }).q_idx === "number"
    )
    .map((g) => (g as { q_idx: number }).q_idx)
    .sort((a, b) => a - b);
}

/**
 * Phase 1: grade a single question.
 *
 * Idempotent: if a successful grade row (grade_type != "ai_failed") already
 * exists for (sessionId, qIdx), returns immediately without any OpenAI call.
 * This is the key cost-bomb prevention — QStash retries become cheap no-ops.
 *
 * On AI failure, an `ai_failed` row is upserted so the instructor UI can
 * flag it. We do NOT throw on grading failure — the chain proceeds to the
 * next question. Throwing would trigger QStash to replay a terminal failure.
 */
export async function gradeOneQuestion(
  sessionId: string,
  qIdx: number
): Promise<{ skipped: boolean; graded: boolean; failureReason?: string }> {
  const supabase = getSupabaseServer();

  const { data: existing, error: existingErr } = await supabase
    .from("grades")
    .select("id, grade_type")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .maybeSingle();

  if (existingErr) {
    logError("[PHASE_GRADE] Failed to check existing grade", existingErr, {
      path: "lib/grading.ts",
      additionalData: { sessionId, qIdx },
    });
  }

  if (
    existing &&
    (existing as { grade_type?: string }).grade_type &&
    isSuccessfulGradeType((existing as { grade_type?: string }).grade_type)
  ) {
    return { skipped: true, graded: true };
  }

  const ctx = await loadPhaseContext(sessionId, supabase);
  const question = ctx.questionsToGrade.find((q) => q.idx === qIdx);
  if (!question) {
    return { skipped: true, graded: false, failureReason: "Question not in exam" };
  }

  const submission = ctx.submissionsByQuestion[qIdx];
  if (!submission) {
    return { skipped: true, graded: false, failureReason: "No submission" };
  }

  await updateGradingProgress(supabase, sessionId, {
    status: "running",
    phase: "grade",
    current_q_idx: qIdx,
  });

  // ── 객관식/OX 결정론적 채점 (OpenAI 호출 없음) ──
  // 학생 제출 답안은 선택지 인덱스의 문자열("2")로 저장된다. 인덱스를
  // correctOptionIndex 와 비교해 100/0 점을 부여하고 즉시 grade 행을 쓴다.
  // chat 단계 가중치/AI 의존도 분석 없이 단일 결정론 점수만 기록한다.
  if (isObjectiveQuestion(question.type)) {
    const objective = gradeObjectiveAnswer({
      rawAnswer: submission.answer || "",
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
    });

    if (objective) {
      await upsertGradesBySessionQuestion(
        supabase as never,
        [
          {
            session_id: sessionId,
            q_idx: qIdx,
            score: objective.score,
            comment: objective.comment,
            stage_grading: null,
            ai_summary: null,
            grade_type: "auto",
          },
        ],
        "phase_grade_objective"
      );
      return { skipped: false, graded: true };
    }
    // correctOptionIndex 누락 등 결정론 채점 불가 — AI 경로로 폴백하지 않고
    // 수동 채점 필요 행을 남긴다 (objective 문제에 AI 채점은 부적절).
    await upsertGradesBySessionQuestion(
      supabase as never,
      [
        {
          session_id: sessionId,
          q_idx: qIdx,
          score: 0,
          comment:
            "[채점 불가] 객관식 문제에 정답 정보가 없습니다 — 강사의 수동 채점이 필요합니다.",
          stage_grading: null,
          ai_summary: null,
          grade_type: "ai_failed",
        },
      ],
      "phase_grade_objective_failed"
    );
    return {
      skipped: false,
      graded: false,
      failureReason: "Objective question missing correctOptionIndex",
    };
  }

  if (!ctx.isAssignment) {
    return { skipped: true, graded: false, failureReason: "Non-objective exam question skipped" };
  }

  const questionMessages = ctx.messagesByQuestion[qIdx] || [];
  const rubricItems = resolveAssignmentRubric(question, ctx.exam.rubric);

  const abortController = new AbortController();
  const deadline = Date.now() + 180_000;
  const outcome = await gradeSingleQuestion({
    question,
    submission,
    questionMessages,
    exam: ctx.exam,
    rubricItems,
    chatWeight: ctx.chatWeight,
    isAssignment: ctx.isAssignment,
    sessionFinalAnswer: ctx.session.final_answer,
    sessionId,
    studentId: ctx.session.student_id,
    signal: abortController.signal,
    deadline,
  });

  if (!outcome.ok) {
    await upsertGradesBySessionQuestion(
      supabase as never,
      [
        {
          session_id: sessionId,
          q_idx: qIdx,
          score: 0,
          comment: `[AI 채점 실패] ${outcome.failureReason} — 강사의 수동 채점이 필요합니다.`,
          stage_grading: null,
          ai_summary: null,
          grade_type: "ai_failed",
        },
      ],
      "phase_grade_failed"
    );
    await updateGradingProgress(supabase, sessionId, {
      phase: "grade",
      current_q_idx: qIdx,
      last_error: `q${qIdx}: ${outcome.failureReason}`,
    });
    return { skipped: false, graded: false, failureReason: outcome.failureReason };
  }

  const grade = outcome.result;
  await upsertGradesBySessionQuestion(
    supabase as never,
    [
      {
        session_id: sessionId,
        q_idx: grade.q_idx,
        score: grade.score,
        comment: grade.comment,
        stage_grading: grade.stage_grading || null,
        ai_summary: null,
        grade_type: "auto",
      },
    ],
    "phase_grade_success"
  );

  return { skipped: false, graded: true };
}

/**
 * Phase 2: generate per-question AI summary (stored on grades.ai_summary).
 * Idempotent: skips if ai_summary already set, or if grade is `ai_failed`.
 *
 * Throws on summary generation failure so QStash retries — this specific
 * phase is cheap to retry (one OpenAI call) and persistent failures will
 * eventually be picked up by the cron sweeper.
 */
export async function generateOneQuestionSummary(
  sessionId: string,
  qIdx: number
): Promise<{ skipped: boolean; generated: boolean }> {
  const supabase = getSupabaseServer();

  const { data: gradeRow, error: gradeErr } = await supabase
    .from("grades")
    .select("id, q_idx, score, comment, stage_grading, ai_summary, grade_type")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .maybeSingle();

  if (gradeErr) {
    throw new Error(`Failed to fetch grade: ${gradeErr.message}`);
  }

  const typedGrade = gradeRow as {
    q_idx: number;
    score: number;
    comment: string | null;
    stage_grading: StageGrading | null;
    ai_summary: QuestionSummaryData | null;
    grade_type: string | null;
  } | null;

  if (typedGrade?.ai_summary) {
    return { skipped: true, generated: false };
  }
  if (typedGrade?.grade_type === "ai_failed") {
    return { skipped: true, generated: false };
  }

  const ctx = await loadPhaseContext(sessionId, supabase);
  const question = ctx.questionsToGrade.find((q) => q.idx === qIdx);
  if (!question) {
    return { skipped: true, generated: false };
  }

  // 객관식/OX 는 결정론적으로 채점되며 요약할 채팅이 없다 — 요약 단계 생략.
  if (isObjectiveQuestion(question.type)) {
    return { skipped: true, generated: false };
  }

  const submission = ctx.submissionsByQuestion[qIdx];
  if (!submission) {
    return { skipped: true, generated: false };
  }

  await updateGradingProgress(supabase, sessionId, {
    status: "running",
    phase: "qsummary",
    current_q_idx: qIdx,
  });

  const questionMessages = ctx.messagesByQuestion[qIdx] || [];
  const rubricItems = ctx.isAssignment
    ? resolveAssignmentRubric(question, ctx.exam.rubric)
    : [];

  const abortController = new AbortController();
  const grade: GradeResult = {
    q_idx: qIdx,
    score: typedGrade?.score ?? 0,
    comment: typedGrade?.comment || "",
    stage_grading: typedGrade?.stage_grading || undefined,
  };

  const summary = await generateQuestionSummary({
    question,
    submission,
    questionMessages,
    grade,
    rubricItems,
    examTitle: ctx.exam.title,
    isAssignment: ctx.isAssignment,
    examId: ctx.exam.id,
    sessionId,
    studentId: ctx.session.student_id,
    signal: abortController.signal,
    timeoutMs: 60_000,
  });

  if (!summary) {
    await updateGradingProgress(supabase, sessionId, {
      phase: "qsummary",
      current_q_idx: qIdx,
      last_error: `qsummary q${qIdx} returned null`,
    });
    throw new Error(`Failed to generate question summary for q_idx=${qIdx}`);
  }

  if (typedGrade) {
    const { error: updateErr } = await supabase
      .from("grades")
      .update({ ai_summary: summary })
      .eq("session_id", sessionId)
      .eq("q_idx", qIdx);
    if (updateErr) {
      throw new Error(`Failed to save question summary: ${updateErr.message}`);
    }
  } else {
    await upsertGradesBySessionQuestion(
      supabase as never,
      [
        {
          session_id: sessionId,
          q_idx: qIdx,
          score: 0,
          comment: "",
          grade_type: "ai_summary",
          ai_summary: summary,
        },
      ],
      "question_summary"
    );
  }

  return { skipped: false, generated: true };
}

/**
 * Phase 3: generate session-level AI summary (stored on sessions.ai_summary).
 * Idempotent: skips if sessions.ai_summary.summary is already a non-empty string.
 *
 * Throws on failure so QStash retries — the "종합평가 빈칸" symptom is
 * specifically the silent null return this phase now catches loudly.
 */
export async function generateSessionSummaryPhase(
  sessionId: string
): Promise<{ skipped: boolean; generated: boolean }> {
  const supabase = getSupabaseServer();

  const { data: sessionRow, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id, ai_summary")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const existingSummary = (sessionRow as { ai_summary: unknown }).ai_summary as
    | { summary?: unknown }
    | null;
  if (
    existingSummary &&
    typeof existingSummary.summary === "string" &&
    existingSummary.summary.trim().length > 0
  ) {
    await updateGradingProgress(supabase, sessionId, {
      status: "completed",
      phase: "done",
    });
    return { skipped: true, generated: false };
  }

  await updateGradingProgress(supabase, sessionId, {
    status: "running",
    phase: "session_summary",
  });

  const ctx = await loadPhaseContext(sessionId, supabase);
  const summaryQuestions = ctx.isAssignment
    ? ctx.questions
    : ctx.questions.filter((q) => isCaseQuestion(q.type));
  const summaryQIdxSet = new Set(summaryQuestions.map((q) => q.idx));

  const { data: gradesData, error: gradesErr } = await supabase
    .from("grades")
    .select("q_idx, score, comment, stage_grading, ai_summary, grade_type")
    .eq("session_id", sessionId);
  if (gradesErr) {
    throw new Error(`Failed to load grades: ${gradesErr.message}`);
  }

  let grades: GradeResult[] = (gradesData || [])
    .filter(
      (g) =>
        isSuccessfulGradeType((g as { grade_type?: string }).grade_type)
    )
    .map((g) => {
      const row = g as {
        q_idx: number;
        score: number | null;
        comment: string | null;
        stage_grading: StageGrading | null;
        ai_summary: QuestionSummaryData | null;
      };
      return {
        q_idx: row.q_idx,
        score: row.score ?? 0,
        comment: row.comment ?? "",
        stage_grading: row.stage_grading || undefined,
        ai_summary: row.ai_summary || undefined,
      };
    })
    .filter((grade) => ctx.isAssignment || summaryQIdxSet.has(grade.q_idx));

  if (grades.length === 0) {
    const caseIdxs = ctx.isAssignment ? [] : summaryQuestions.map((q) => q.idx);
    if (caseIdxs.length > 0) {
      grades = caseIdxs.map((qIdx) => ({
        q_idx: qIdx,
        score: 0,
        comment: "",
        ungraded: true,
      }));
    } else {
      const fallback = {
        grading_status: "failed" as const,
        grading_failed_questions: ctx.questionsToGrade.map((q) => q.idx),
        grading_completed_count: 0,
        grading_total_count: summaryQuestions.length,
        grading_timed_out: false,
      };
      await supabase
        .from("sessions")
        .update({ ai_summary: fallback })
        .eq("id", sessionId);
      await updateGradingProgress(supabase, sessionId, {
        status: "failed",
        phase: "done",
        last_error: "No successfully graded questions to summarize",
      });
      return { skipped: false, generated: false };
    }
  }

  const summary = await generateSummary(
    sessionId,
    ctx.session.student_id,
    ctx.exam,
    summaryQuestions,
    ctx.submissionsByQuestion,
    ctx.messagesByQuestion,
    grades,
    120_000,
    ctx.isAssignment
  );

  if (!summary) {
    await updateGradingProgress(supabase, sessionId, {
      phase: "session_summary",
      last_error: "generateSummary returned null",
    });
    throw new Error("Session summary generation returned null");
  }

  await updateGradingProgress(supabase, sessionId, {
    status: "completed",
    phase: "done",
  });

  return { skipped: false, generated: true };
}

/**
 * Legacy monolithic wrapper — sequentially runs all phases in-process.
 * Used by:
 *   - Tests
 *   - Local dev when QStash is not configured (via trigger's dev fallback)
 *   - Manual reprocessing tools
 *
 * Production uses chained QStash jobs via the grading worker; this wrapper
 * simply composes the same phase functions for environments where QStash
 * isn't available. Each phase is already idempotent, so partial failure
 * mid-wrapper (e.g. Vercel function timeout) can be resumed safely.
 */
export async function autoGradeSession(
  sessionId: string,
  options?: { signal?: AbortSignal }
): Promise<AutoGradeResult> {
  void options;
  const supabase = getSupabaseServer();

  const questionIdxs = await listQuestionsToGrade(sessionId);
  const isAssignment = await isAssignmentGradingSession(sessionId);

  await updateGradingProgress(supabase, sessionId, {
    status: "running",
    total: questionIdxs.length,
    completed: 0,
    failed: 0,
    phase: "grade",
  });

  const grades: GradeResult[] = [];
  const failedQuestions: number[] = [];

  for (const qIdx of questionIdxs) {
    try {
      const res = await gradeOneQuestion(sessionId, qIdx);
      if (res.graded) {
        const { data } = await supabase
          .from("grades")
          .select("q_idx, score, comment, stage_grading, ai_summary")
          .eq("session_id", sessionId)
          .eq("q_idx", qIdx)
          .maybeSingle();
        if (data) {
          const row = data as {
            q_idx: number;
            score: number | null;
            comment: string | null;
            stage_grading: StageGrading | null;
            ai_summary: QuestionSummaryData | null;
          };
          grades.push({
            q_idx: row.q_idx,
            score: row.score ?? 0,
            comment: row.comment ?? "",
            stage_grading: row.stage_grading || undefined,
            ai_summary: row.ai_summary || undefined,
          });
        }
      } else if (res.failureReason) {
        failedQuestions.push(qIdx);
      }
      await updateGradingProgress(supabase, sessionId, {
        completed: grades.length,
        failed: failedQuestions.length,
      });
    } catch (err) {
      logError("[AUTO_GRADE] gradeOneQuestion threw", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx },
      });
      failedQuestions.push(qIdx);
      await updateGradingProgress(supabase, sessionId, {
        completed: grades.length,
        failed: failedQuestions.length,
        last_error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!isAssignment) {
    const caseIdxs = await listCaseQuestionsForSummary(sessionId);
    if (caseIdxs.length === 0) {
      await markObjectiveOnlyGradingDone(sessionId, {
        total: questionIdxs.length,
        completed: grades.length,
        failed: failedQuestions.length,
      });
      return {
        grades,
        summary: null,
        failedQuestions,
        timedOut: false,
      };
    }

    if (caseIdxs.length >= 2) {
      for (const qIdx of caseIdxs) {
        try {
          await generateOneQuestionSummary(sessionId, qIdx);
        } catch (err) {
          logError("[AUTO_GRADE] generateOneQuestionSummary threw", err, {
            path: "lib/grading.ts",
            additionalData: { sessionId, qIdx },
          });
        }
      }
    }

    let summary: SummaryData | null = null;
    try {
      await generateSessionSummaryPhase(sessionId);
      const { data } = await supabase
        .from("sessions")
        .select("ai_summary")
        .eq("id", sessionId)
        .maybeSingle();
      summary = (data?.ai_summary as SummaryData | null) ?? null;
    } catch (err) {
      logError("[AUTO_GRADE] generateSessionSummaryPhase threw", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }

    return {
      grades,
      summary,
      failedQuestions,
      timedOut: false,
    };
  }

  const gradedIdxs = await listGradedQuestionsForSummary(sessionId);
  for (const qIdx of gradedIdxs) {
    try {
      await generateOneQuestionSummary(sessionId, qIdx);
    } catch (err) {
      logError("[AUTO_GRADE] generateOneQuestionSummary threw", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId, qIdx },
      });
    }
  }

  let summary: SummaryData | null = null;
  if (gradedIdxs.length > 0) {
    try {
      await generateSessionSummaryPhase(sessionId);
      const { data } = await supabase
        .from("sessions")
        .select("ai_summary")
        .eq("id", sessionId)
        .maybeSingle();
      summary = (data?.ai_summary as SummaryData | null) || null;
    } catch (err) {
      logError("[AUTO_GRADE] generateSessionSummaryPhase threw", err, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
    }
  }

  const finalStatus: GradingProgressStatus =
    failedQuestions.length > 0 || gradedIdxs.length === 0
      ? "failed"
      : "completed";

  await updateGradingProgress(supabase, sessionId, {
    status: finalStatus,
    completed: grades.length,
    failed: failedQuestions.length,
    phase: "done",
  });

  return {
    grades,
    summary,
    failedQuestions,
    timedOut: false,
  };
}


/**
 * 세션 레벨 종합 요약 평가 생성 (sessions.ai_summary에 저장).
 * 입력은 grades[].ai_summary 를 기반으로 경량화됨 — 전체 채팅 기록을 재포함하지 않음.
 */
// Deterministic seed from sessionId — stabilizes summary draws across calls.
// Without seed, temperature 1.0 default caused re-grade to produce noticeably
// better/worse summaries from identical inputs (stochastic variance).
function deriveSessionSeed(sessionId: string): number {
  return Array.from(sessionId).reduce(
    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
    0
  );
}

async function generateSummary(
  sessionId: string,
  studentId: string,
  exam: { id: string; title: string; rubric?: unknown },
  questions: Array<{ idx: number; prompt?: string; ai_context?: string; type?: string }>,
  submissionsByQuestion: Record<number, { answer: string }>,
  messagesByQuestion: Record<number, Array<{ role: string; content: string }>>,
  grades: GradeResult[],
  timeBudgetMs?: number,
  isAssignment = false
): Promise<SummaryData | null> {
  const supabase = getSupabaseServer();
  try {
    const rubricText =
      exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
        ? `
[평가 루브릭]
${(exam.rubric as Array<{ evaluationArea: string; detailedCriteria: string }>)
  .map(
    (item, index) =>
      `${index + 1}. ${item.evaluationArea}
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}
`
        : "";

    const questionsText = questions
      .map((q) => {
        const qIdx = q.idx;
        const submission = submissionsByQuestion[qIdx];
        const grade = grades.find((g) => g.q_idx === qIdx);
        const questionMessages = messagesByQuestion[qIdx] || [];

        const chatHistoryText =
          questionMessages.length > 0
            ? `\n\n**학생과 AI의 대화 기록:**\n${questionMessages
                .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
                .join("\n\n")}`
            : "";

        if (isAssignment) {
          return `과제 ${qIdx + 1}:
${q.prompt || ""}

채팅 기반 리서치 수행 기록:
${submission?.answer || "기록 없음"}
${chatHistoryText}

평가 등급: ${grade ? scoreToAssignmentLabel(grade.score) : "미흡"}
`;
        }

        return `문제 ${qIdx + 1}:
${q.prompt || ""}

답안:
${submission?.answer || "답안 없음"}
${chatHistoryText}

점수: ${formatSummaryScoreLabel({
  score: grade?.score,
  ungraded: grade?.ungraded,
  hasSubmission: !!submission,
  questionType: q.type,
  isAssignment,
})}
${grade?.stage_grading?.chat ? `채팅 단계 점수: ${grade.stage_grading.chat.score}점` : ""}
${grade?.stage_grading?.answer ? `답안 단계 점수: ${grade.stage_grading.answer.score}점` : ""}
${
  grade?.stage_grading?.chat?.ai_dependency
    ? `AI 활용/의존 신호:\n${formatAiDependencyForPrompt(grade.stage_grading.chat.ai_dependency)}`
    : ""
}
`;
      })
      .join("\n---\n\n");

    const systemPrompt = isAssignment
      ? buildAssignmentResearchSummarySystemPrompt()
      : buildSummaryEvaluationSystemPrompt();

    const userPrompt = isAssignment
      ? `
      과제 제목: ${exam.title}

      ${rubricText}

      [학생의 채팅 기반 리서치 과정 및 평가 등급]
      ${questionsText}

      위 내용을 바탕으로 학생의 전체적인 과제 수행을 요약 평가해주세요.
      **중요**: AI 채팅 기록 자체가 평가 자료입니다. 이 대화형 수행 방식을 부족한 점으로 쓰지 말고, 학생이 채팅을 통해 리서치 내용을 얼마나 잘 탐색·검증·이해했는지 평가하세요.

      다음 항목을 반드시 포함해야 합니다:
      1. 전체적인 평가 (긍정적/부정적/중립적)
      2. 종합 의견: 질문 흐름이 개념 확인, 적용 사례 탐색, 성과 지표 확인, 출처 검증, 교차검증으로 어떻게 발전했는지 분석.
      3. 주요 강점 (3가지 이내): 후속 질문, 출처 요청, 자료 신뢰도 판단, AI 답변 검증, 방향 전환이 드러난 구체적 행동을 제시하세요.
      4. 개선이 필요한 점 (3가지 이내): 부족한 리서치 행동을 다음 대화에서 해야 할 행동으로 제시하세요.
      5. 핵심 인용구 (2가지): 학생의 좋은 질문, 검증 시도, 방향 전환, 자료 판단이 드러나는 채팅 또는 퀴즈 기록을 원문 그대로 인용하세요.

      JSON 형식으로 응답해주세요:
      {
        "sentiment": "positive" | "negative" | "neutral",
        "summary": "상세한 종합 의견 텍스트",
        "strengths": ["강점1", "강점2", ...],
        "weaknesses": ["약점1", "약점2", ...],
        "keyQuotes": ["인용구1", "인용구2"]
      }`
      : `
      시험 제목: ${exam.title}

      ${rubricText}

      [학생의 CASE 답안, CASE 관련 채팅 대화 기록 및 점수]
      ${questionsText}

      [범용 평가 엄격화 가이드]
      - 질문의 '논리적 구조'와 '내용의 사실 관계'를 분리하여 평가하십시오.
      - 아래 5가지 행동 패턴이 발견되면 '이해도 부족'으로 간주하여 엄격히 평가합니다.
        사용된 표현의 형식(직접적/우회적/공손한)과 무관하게, 행동의 의도로 판단합니다:
        1) **답/풀이 위임형**: 자신의 분석 없이 AI에게 정답, 풀이법, 접근법, 프레임워크 선택을 요청. "어떻게 풀어?"든 "일반적으로 어떤 접근이 통용되나요?"든 의도가 동일하면 동일하게 판단.
        2) **출발점 의존형**: 어디서 시작해야 하는지, 어떤 개념을 써야 하는지를 AI에게 물어봄. 스스로 진입점을 잡지 못함.
        3) **조건/수치 변형형**: 시나리오에 명시된 수치/조건을 임의로 다른 값으로 바꿔서 질문하거나 답안에 사용.
        4) **개념 역전형**: 핵심 인과관계, 정의, 방향성을 거꾸로 이해하여 질문하거나 답안 작성.
        5) **교정 미반영형**: AI가 오류를 교정했음에도 최종 답안이 동일한 오류를 그대로 포함.
      - 질문의 양이 많더라도, 그 질문들이 문제의 본질(Core Task)에서 벗어난 지엽적인 것이라면 '자기주도적 학습 역량' 점수를 높게 주지 마십시오.
      - 직접 답변을 받은 사실 자체는 금지 위반이 아닙니다. 그러나 이후 독립 추론이 약하면 엄격히 감점하고, 회복이 확인되면 그 회복 근거를 분명히 적으십시오.
      - 학생이 주어지지 않은 정보를 논리적으로 가정(Assume)하여 논의를 진전시키는 경우에는 이를 '문제 해결을 위한 창의적 접근'으로 보아 긍정적으로 평가하십시오.
        다만, 이러한 가정이 문제에 이미 명시된 조건을 부정하는 용도로 쓰인다면 예외 없이 엄격하게 감점하십시오.

      [이해도 과대평가 방지 상한 규칙(매우 중요)]
      - 위 5가지 행동 패턴 중 하나라도 1회 이상 발견되었고,
        학생이 이후에 스스로 '개념 선택 + 조건/가정 정리 + 중간 추론/검증'을 모두 보여주지 못했다면 sentiment는 절대 positive로 주지 마세요.
      - 행동 패턴이 반복되거나, 개념 역전형 또는 교정 미반영형이 확인되면 negative를 우선하세요(회복이 매우 강한 경우만 neutral).

      위 내용을 바탕으로 학생의 CASE 수행 능력을 상세하게 분석하여 요약 평가해주세요.
      **중요**: CASE 관련 채팅 대화 기록이 있는 경우, 학생이 AI와의 대화에서 보여준 질문의 질, 문제 이해도, 개념 파악 수준, 학습 태도 등을 종합적으로 고려하세요. 사지선다와 O/X 문제는 이 종합 평가의 근거로 사용하지 마세요.

      다음 항목을 반드시 포함해야 합니다:
      1. 전체적인 평가 (긍정적/부정적/중립적)
      2. 종합 의견: 학생의 CASE 답안과 CASE 관련 채팅 대화 기록을 종합하여 깊이 있게 분석. 답안의 논리성, 정확성, 창의성뿐만 아니라 채팅에서 보여준 학습 과정과 이해도도 함께 고려하세요.
      3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요. 채팅에서 보여준 질문의 질도 강점으로 포함할 수 있습니다.
      4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요. 채팅에서 드러난 문제 이해 부족이나 개념 파악의 어려움을 포함하세요.
      5. 핵심 인용구 (2가지): 학생의 답안 또는 채팅 대화 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요.
         - 감점 트리거가 있다면 2개 중 최소 1개는 그 문장을 반드시 원문 그대로 인용하세요.

      JSON 형식으로 응답해주세요:
      {
        "sentiment": "positive" | "negative" | "neutral",
        "summary": "상세한 종합 의견 텍스트",
        "strengths": ["강점1", "강점2", ...],
        "weaknesses": ["약점1", "약점2", ...],
        "keyQuotes": ["인용구1", "인용구2"]
      }`;

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "auto_grading_summary",
        route: "lib/grading.ts",
        model: AI_MODEL_HEAVY,
        userId: studentId,
        examId: exam.id,
        sessionId,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userPrompt],
          extra: {
            graded_question_count: grades.length,
          },
        }),
      },
      {
        timeoutMs: timeBudgetMs ? Math.min(timeBudgetMs - 5_000, 120_000) : 120_000,
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );
    const completion = tracked.data;

    const summaryResponseSchema = z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      summary: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      keyQuotes: z.array(z.string()).optional(),
    });

    let rawSummary: unknown;
    try {
      rawSummary = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (parseErr) {
      const rawContent = completion.choices[0]?.message?.content ?? "(empty)";
      logError("[AUTO_GRADE] Failed to parse summary JSON response", parseErr, {
        path: "lib/grading.ts",
        additionalData: { sessionId, rawContent: rawContent.slice(0, 500) },
      });
      return null;
    }

    const summaryValidation = summaryResponseSchema.safeParse(rawSummary);
    if (!summaryValidation.success) {
      logError("[AUTO_GRADE] Summary response schema validation failed", summaryValidation.error, {
        path: "lib/grading.ts",
        additionalData: { sessionId, rawContent: JSON.stringify(rawSummary).slice(0, 500) },
      });
      return null;
    }
    const result: SummaryData = summaryValidation.data;

    const aiDependencySummary = summarizeAiDependencyAssessments(
      grades.map((grade) => ({
        q_idx: grade.q_idx,
        assessment: grade.stage_grading?.chat?.ai_dependency,
      }))
    );
    const summaryWithDependency: SummaryData = {
      ...result,
      aiDependency: aiDependencySummary,
    };

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: summaryWithDependency })
      .eq("id", sessionId);

    if (updateError) {
      logError("[AUTO_GRADE] Error saving summary to database — retrying once", updateError, {
        path: "lib/grading.ts",
        additionalData: { sessionId },
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { error: retryUpdateError } = await supabase
        .from("sessions")
        .update({ ai_summary: summaryWithDependency })
        .eq("id", sessionId);
      if (retryUpdateError) {
        logError("[AUTO_GRADE] Retry also failed for summary save", retryUpdateError, {
          path: "lib/grading.ts",
          additionalData: { sessionId },
        });
      }
    }

    return summaryWithDependency;
  } catch (err) {
    logError("[AUTO_GRADE] Summary generation failed in generateSummary", err, {
      path: "lib/grading.ts",
      additionalData: { sessionId },
    });
    return null;
  }
}
