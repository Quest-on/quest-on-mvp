import { decompressData } from "@/lib/compression";
import { logError } from "@/lib/logger";
import type {
  AiDependencyAssessment,
  AiDependencyRiskLevel,
} from "@/lib/types/grading";

/** Decompression warning collected during data extraction */
export type DecompressionWarning = {
  target: string;
  error: string;
};

/**
 * Pure helper functions extracted from lib/grading.ts for testability.
 * These have no side-effects and do not depend on Supabase or OpenAI.
 */

/** Select the best submission from a group sharing the same q_idx. */
export function selectBestSubmission(
  subs: Array<Record<string, unknown>>
): Record<string, unknown> {
  return subs.reduce((best, current) => {
    // 1. Prefer submitted (has submitted_at) over draft
    const bestSubmitted = !!best.submitted_at;
    const currentSubmitted = !!current.submitted_at;
    if (currentSubmitted && !bestSubmitted) return current;
    if (bestSubmitted && !currentSubmitted) return best;

    // 1.5. Same status — prefer non-empty answer over empty
    const bestHasContent = !!(best.answer as string)?.trim();
    const currentHasContent = !!(current.answer as string)?.trim();
    if (currentHasContent && !bestHasContent) return current;
    if (bestHasContent && !currentHasContent) return best;

    // 2. Same submission status — prefer most recent (created_at)
    const bestCreated = best.created_at
      ? new Date(best.created_at as string).getTime()
      : 0;
    const currentCreated = current.created_at
      ? new Date(current.created_at as string).getTime()
      : 0;
    if (currentCreated > bestCreated) return current;
    if (bestCreated > currentCreated) return best;

    // 3. Deterministic tiebreak: prefer higher id (lexicographic) for consistency
    const bestId = (best.id as string) || "";
    const currentId = (current.id as string) || "";
    if (currentId > bestId) return current;

    return best;
  });
}

/** Decompressed submission data per question */
export interface DecompressedSubmission {
  answer: string;
  workspace_state?: unknown;
}

/** Group submissions by q_idx, decompress if needed, pick best per question. */
export function decompressSubmissions(
  submissions: Array<Record<string, unknown>>,
  warnings?: DecompressionWarning[]
): Record<number, DecompressedSubmission> {
  const result: Record<number, DecompressedSubmission> = {};

  if (!submissions || submissions.length === 0) return result;

  // Group by q_idx
  const byQIdx = new Map<number, Array<Record<string, unknown>>>();
  submissions.forEach((submission) => {
    const qIdx = submission.q_idx as number;
    if (!byQIdx.has(qIdx)) {
      byQIdx.set(qIdx, []);
    }
    byQIdx.get(qIdx)!.push(submission);
  });

  // Pick best and decompress
  byQIdx.forEach((subs, qIdx) => {
    const bestSubmission = selectBestSubmission(subs);

    let answer = (bestSubmission.answer as string) || "";

    if (
      bestSubmission.compressed_answer_data &&
      typeof bestSubmission.compressed_answer_data === "string"
    ) {
      try {
        const decompressed = decompressData(
          bestSubmission.compressed_answer_data as string
        );
        answer = (decompressed as { answer?: string })?.answer || answer;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown decompression error";
        warnings?.push({ target: `submission_q${qIdx}`, error: errMsg });
        logError("[decompressSubmissions] Decompression failed, using raw answer", error, {
          path: "lib/grading-helpers.ts",
          additionalData: { qIdx },
        });
      }
    }

    result[qIdx] = {
      answer: answer || "",
      workspace_state: bestSubmission.workspace_state ?? undefined,
    };
  });

  return result;
}

/** Group messages by q_idx, decompress if needed. */
export function decompressMessages(
  messages: Array<Record<string, unknown>>,
  warnings?: DecompressionWarning[]
): Record<number, Array<{ role: string; content: string }>> {
  const result: Record<number, Array<{ role: string; content: string }>> = {};

  if (!messages || messages.length === 0) return result;

  messages.forEach((message) => {
    const qIdx = message.q_idx as number;
    let content = message.content as string;

    if (
      message.compressed_content &&
      typeof message.compressed_content === "string"
    ) {
      try {
        content =
          (decompressData(message.compressed_content as string) as string) ||
          content;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown decompression error";
        warnings?.push({ target: `message_q${qIdx}_${message.id}`, error: errMsg });
        logError("[decompressMessages] Decompression failed, using raw content", error, {
          path: "lib/grading-helpers.ts",
          additionalData: { qIdx, messageId: message.id },
        });
      }
    }

    if (!result[qIdx]) {
      result[qIdx] = [];
    }

    result[qIdx].push({
      role: message.role as string,
      content: content || "",
    });
  });

  return result;
}

/** A question normalized for the grading pipeline. */
export interface NormalizedQuestion {
  idx: number;
  prompt?: string;
  ai_context?: string;
  rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
  /** 문제 유형. 객관식/OX(objective)는 결정론적 채점 경로를 탄다. */
  type?: string;
  /** 객관식/OX 선택지. */
  options?: string[];
  /** 객관식/OX 정답 인덱스. */
  correctOptionIndex?: number;
}

/** Normalize DB question rows into a standard shape. */
export function normalizeQuestions(questions: unknown): NormalizedQuestion[] {
  if (!questions || !Array.isArray(questions)) return [];

  return questions.map((q: Record<string, unknown>, index: number) => ({
    idx: q.idx !== undefined && !Number.isNaN(Number(q.idx)) ? Number(q.idx) : index,
    prompt:
      typeof q.prompt === "string"
        ? q.prompt
        : typeof q.text === "string"
        ? q.text
        : undefined,
    ai_context: typeof q.ai_context === "string" ? q.ai_context : undefined,
    rubric: Array.isArray(q.rubric) ? (q.rubric as Array<{ evaluationArea: string; detailedCriteria: string }>) : undefined,
    type: typeof q.type === "string" ? q.type : undefined,
    options: Array.isArray(q.options)
      ? (q.options as unknown[]).filter((o): o is string => typeof o === "string")
      : undefined,
    correctOptionIndex:
      typeof q.correctOptionIndex === "number" && Number.isInteger(q.correctOptionIndex)
        ? q.correctOptionIndex
        : undefined,
  }));
}

/** True when a question is graded deterministically (no LLM): 객관식/OX. */
export function isObjectiveQuestion(type?: string): boolean {
  return type === "multiple-choice" || type === "true-false";
}

/** True when a question belongs to the instructor/AI case-grading surface. */
export function isCaseQuestion(type?: string): boolean {
  return type === "case" || type === "essay" || type === "short-answer";
}

/**
 * Deterministically grade an objective (mcq/true-false) question.
 *
 * The student's submitted answer is stored as the chosen option index in
 * string form (e.g. "2"). We parse it, compare against `correctOptionIndex`,
 * and return a 100/0 score with a Korean comment. No OpenAI call.
 *
 * Returns `null` when the question is not gradeable deterministically
 * (missing/invalid correctOptionIndex) so the caller can fall back.
 */
export function gradeObjectiveAnswer(params: {
  rawAnswer: string;
  options?: string[];
  correctOptionIndex?: number;
}): { score: number; comment: string; selectedIndex: number | null } | null {
  const { rawAnswer, options, correctOptionIndex } = params;
  if (
    typeof correctOptionIndex !== "number" ||
    !Number.isInteger(correctOptionIndex) ||
    correctOptionIndex < 0
  ) {
    return null;
  }

  const trimmed = (rawAnswer ?? "").trim();
  const parsed = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
  const selectedIndex =
    trimmed !== "" && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;

  const optionLabel = (idx: number | null): string => {
    if (idx === null) return "무응답";
    return options && options[idx] !== undefined ? options[idx] : `${idx + 1}번`;
  };

  const correct = selectedIndex !== null && selectedIndex === correctOptionIndex;
  const score = correct ? 100 : 0;
  const comment = correct
    ? `정답입니다. 선택: ${optionLabel(selectedIndex)}`
    : `오답입니다. 선택: ${optionLabel(selectedIndex)} / 정답: ${optionLabel(
        correctOptionIndex
      )}`;

  return { score, comment, selectedIndex };
}

/** Format the score label used inside session-summary prompts. */
export function formatSummaryScoreLabel(params: {
  score?: number;
  ungraded?: boolean;
  hasSubmission: boolean;
  questionType?: string;
  isAssignment?: boolean;
}): string {
  const isUngradedCase =
    !params.isAssignment &&
    params.hasSubmission &&
    !isObjectiveQuestion(params.questionType) &&
    (params.ungraded || params.score === undefined);

  if (isUngradedCase) return "미채점";
  return `${params.score ?? 0}점`;
}

/** Calculate weighted score from chat and answer stages. */
export function calculateWeightedScore(
  stageGrading: {
    chat?: { score: number };
    answer?: { score: number };
  },
  chatWeightPercent: number = 50
): number {
  const chatWeight = chatWeightPercent / 100;
  const answerWeight = 1 - chatWeight;

  // P1-3: Validate input scores are finite numbers
  if (stageGrading.chat && !Number.isFinite(stageGrading.chat.score)) {
    throw new Error(`calculateWeightedScore: chat.score is not a finite number (${stageGrading.chat.score})`);
  }
  if (stageGrading.answer && !Number.isFinite(stageGrading.answer.score)) {
    throw new Error(`calculateWeightedScore: answer.score is not a finite number (${stageGrading.answer.score})`);
  }

  let finalScore = 0;
  if (stageGrading.chat && stageGrading.answer) {
    finalScore = Math.round(
      stageGrading.chat.score * chatWeight +
        stageGrading.answer.score * answerWeight
    );
  } else if (stageGrading.chat) {
    // 단일 스테이지: weight 적용 없이 원점수 사용 (100점 만점 보장)
    finalScore = Math.round(stageGrading.chat.score);
  } else if (stageGrading.answer) {
    // 단일 스테이지: weight 적용 없이 원점수 사용 (100점 만점 보장)
    finalScore = Math.round(stageGrading.answer.score);
  }

  return Math.max(0, Math.min(100, finalScore));
}

function normalizeTextForAnalysis(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForOverlap(text: string): string[] {
  return normalizeTextForAnalysis(text)
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter((token) => token.length >= 2);
}

function pushUniqueEvidence(
  target: string[],
  source: string,
  maxLength: number = 3
): void {
  const normalized = normalizeTextForAnalysis(source);
  if (!normalized || target.includes(normalized) || target.length >= maxLength) {
    return;
  }

  target.push(normalized);
}

function hasIndependentReasoning(text: string): boolean {
  const normalized = normalizeTextForAnalysis(text);
  if (!normalized || normalized.length < 12) return false;

  const reasoningPatterns = [
    /제 생각|제가 보기|제 판단|저는 .*라고/i,
    /왜냐하면|따라서|그러므로|즉|정리하면|결국/i,
    /주어진 조건|조건을 보면|가정하면|전제하면/i,
    /먼저|다음으로|이후에|그 다음/i,
    /이 식|이 공식|이 개념|이 관계/i,
  ];

  const matches = reasoningPatterns.filter((pattern) =>
    pattern.test(normalized)
  ).length;

  return matches >= 1 && normalized.split(/\s+/).length >= 5;
}

function calculateOverlapScore(answer: string, aiMessages: string[]): number {
  const answerTokens = new Set(tokenizeForOverlap(answer));
  if (answerTokens.size === 0 || aiMessages.length === 0) return 0;

  let maxScore = 0;
  for (const aiMessage of aiMessages) {
    const aiTokens = new Set(tokenizeForOverlap(aiMessage));
    if (aiTokens.size === 0) continue;

    let overlapCount = 0;
    answerTokens.forEach((token) => {
      if (aiTokens.has(token)) overlapCount += 1;
    });

    maxScore = Math.max(maxScore, overlapCount / answerTokens.size);
  }

  return Number(maxScore.toFixed(2));
}

export function calculateAiDependencyPenalty(
  assessment: Pick<AiDependencyAssessment, "delegationRequestCount" | "startingPointDependencyCount" | "directAnswerRequestCount" | "directAnswerRelianceCount" | "finalAnswerOverlapScore" | "recoveryObserved">
): number {
  let penalty = 0;

  if (assessment.delegationRequestCount > 0) {
    penalty += 8 + Math.min(assessment.delegationRequestCount - 1, 2) * 2;
  }

  if (assessment.startingPointDependencyCount > 0) {
    penalty += 5 + Math.min(assessment.startingPointDependencyCount - 1, 2);
  }

  if (assessment.directAnswerRequestCount > 0) {
    penalty += 4;
  }

  if (assessment.directAnswerRelianceCount > 0) {
    penalty += 4;
  }

  if (assessment.finalAnswerOverlapScore >= 0.7) {
    penalty += 8;
  } else if (assessment.finalAnswerOverlapScore >= 0.45) {
    penalty += 4;
  }

  if (assessment.recoveryObserved) {
    penalty = Math.max(2, Math.floor(penalty * 0.45));
  }

  return Math.max(0, Math.min(22, penalty));
}

function calculateAiDependencyRiskLevel(params: {
  delegationRequestCount: number;
  startingPointDependencyCount: number;
  directAnswerRequestCount: number;
  directAnswerRelianceCount: number;
  finalAnswerOverlapScore: number;
  recoveryObserved: boolean;
}): AiDependencyRiskLevel {
  let riskScore = 0;

  riskScore += params.delegationRequestCount * 2;
  riskScore += params.startingPointDependencyCount * 2;
  riskScore += params.directAnswerRequestCount;
  riskScore += params.directAnswerRelianceCount;

  if (params.finalAnswerOverlapScore >= 0.7) {
    riskScore += 2;
  } else if (params.finalAnswerOverlapScore >= 0.45) {
    riskScore += 1;
  }

  if (params.recoveryObserved) {
    riskScore = Math.max(0, riskScore - 2);
  }

  if (riskScore >= 5) return "high";
  if (riskScore >= 2) return "medium";
  return "low";
}

function buildAiDependencySummary(params: {
  delegationRequestCount: number;
  startingPointDependencyCount: number;
  directAnswerRequestCount: number;
  directAnswerRelianceCount: number;
  recoveryObserved: boolean;
  finalAnswerOverlapScore: number;
  penaltyApplied: number;
}): string {
  const fragments: string[] = [];

  if (params.delegationRequestCount > 0) {
    fragments.push(`풀이 위임형 요청 ${params.delegationRequestCount}회`);
  }

  if (params.startingPointDependencyCount > 0) {
    fragments.push(`출발점 의존 신호 ${params.startingPointDependencyCount}회`);
  }

  if (params.directAnswerRequestCount > 0) {
    fragments.push(`직접 답 요구 ${params.directAnswerRequestCount}회`);
  }

  if (params.directAnswerRelianceCount > 0) {
    fragments.push(`직접 답 의존 신호 ${params.directAnswerRelianceCount}회`);
  }

  if (params.finalAnswerOverlapScore >= 0.45) {
    fragments.push(
      `최종 답안-응답 유사도 ${(params.finalAnswerOverlapScore * 100).toFixed(0)}%`
    );
  }

  fragments.push(
    params.recoveryObserved
      ? "이후 독립 추론 회복이 관찰됨"
      : "이후 독립 추론 회복 근거가 약함"
  );

  if (params.penaltyApplied > 0) {
    fragments.push(`채팅 단계 ${params.penaltyApplied}점 조정`);
  }

  return fragments.join(", ");
}

export function analyzeAiDependency(params: {
  messages: Array<{ role: string; content: string }>;
  finalAnswer?: string;
}): AiDependencyAssessment {
  const { messages, finalAnswer = "" } = params;
  const delegationPatterns = [
    /어떻게\s*풀/i,
    /풀이.*알려/i,
    /풀어줘/i,
    /해설해/i,
    /접근(법|방법).*(알려|말해)/i,
    /대신.*해줘/i,
    /유도해줘/i,
    /계산해줘/i,
    /증명해줘/i,
  ];
  const startingPointPatterns = [
    /어디서부터/i,
    /뭐부터/i,
    /무엇부터/i,
    /어떻게\s*시작/i,
    /어떤\s*(개념|공식|방법|프레임)/i,
    /뭘\s*써야/i,
    /무슨\s*(개념|공식|방법)/i,
  ];
  const directAnswerPatterns = [
    /정답/i,
    /답만/i,
    /답을?\s*알려/i,
    /결론만/i,
    /최종\s*답/i,
    /바로\s*답/i,
    /그냥\s*답/i,
  ];

  let delegationRequestCount = 0;
  let startingPointDependencyCount = 0;
  let directAnswerRequestCount = 0;
  const triggerEvidence: string[] = [];
  const recoveryEvidence: string[] = [];
  let lastTriggerIndex = -1;

  const assistantMessages: string[] = [];

  messages.forEach((message, index) => {
    const normalized = normalizeTextForAnalysis(message.content);
    if (!normalized) return;

    if (message.role === "assistant" || message.role === "ai") {
      assistantMessages.push(normalized);
      return;
    }

    const matchedDelegation = delegationPatterns.some((pattern) =>
      pattern.test(normalized)
    );
    const matchedStartingPoint = startingPointPatterns.some((pattern) =>
      pattern.test(normalized)
    );
    const matchedDirectAnswer = directAnswerPatterns.some((pattern) =>
      pattern.test(normalized)
    );

    if (matchedDelegation) {
      delegationRequestCount += 1;
      pushUniqueEvidence(triggerEvidence, normalized);
      lastTriggerIndex = index;
    }

    if (matchedStartingPoint) {
      startingPointDependencyCount += 1;
      pushUniqueEvidence(triggerEvidence, normalized);
      lastTriggerIndex = index;
    }

    if (matchedDirectAnswer) {
      directAnswerRequestCount += 1;
      pushUniqueEvidence(triggerEvidence, normalized);
      lastTriggerIndex = index;
    }
  });

  const recoveryObserved =
    lastTriggerIndex >= 0
      ? messages.some((message, index) => {
          if (index <= lastTriggerIndex) return false;
          if (!(message.role === "user" || message.role === "student")) {
            return false;
          }

          const recovered = hasIndependentReasoning(message.content);
          if (recovered) {
            pushUniqueEvidence(recoveryEvidence, message.content);
          }
          return recovered;
        })
      : messages.some((message) => {
          if (!(message.role === "user" || message.role === "student")) {
            return false;
          }
          const recovered = hasIndependentReasoning(message.content);
          if (recovered) {
            pushUniqueEvidence(recoveryEvidence, message.content);
          }
          return recovered;
        });

  const finalAnswerOverlapScore = calculateOverlapScore(
    finalAnswer,
    assistantMessages
  );

  const directAnswerRelianceCount =
    directAnswerRequestCount > 0 && !recoveryObserved
      ? Math.max(
          1,
          finalAnswerOverlapScore >= 0.45 ? directAnswerRequestCount : 0
        )
      : 0;

  const penaltyApplied = calculateAiDependencyPenalty({
    delegationRequestCount,
    startingPointDependencyCount,
    directAnswerRequestCount,
    directAnswerRelianceCount,
    recoveryObserved,
    finalAnswerOverlapScore,
  });

  const overallRisk = calculateAiDependencyRiskLevel({
    delegationRequestCount,
    startingPointDependencyCount,
    directAnswerRequestCount,
    directAnswerRelianceCount,
    finalAnswerOverlapScore,
    recoveryObserved,
  });

  return {
    delegationRequestCount,
    startingPointDependencyCount,
    directAnswerRequestCount,
    directAnswerRelianceCount,
    recoveryObserved,
    recoveryEvidence,
    triggerEvidence,
    finalAnswerOverlapScore,
    overallRisk,
    penaltyApplied,
    summary: buildAiDependencySummary({
      delegationRequestCount,
      startingPointDependencyCount,
      directAnswerRequestCount,
      directAnswerRelianceCount,
      recoveryObserved,
      finalAnswerOverlapScore,
      penaltyApplied,
    }),
  };
}

export function formatAiDependencyForPrompt(
  assessment: AiDependencyAssessment
): string {
  return [
    `- 풀이 위임형 요청: ${assessment.delegationRequestCount}회`,
    `- 출발점 의존 신호: ${assessment.startingPointDependencyCount}회`,
    `- 직접 답 요구: ${assessment.directAnswerRequestCount}회`,
    `- 직접 답 의존 신호: ${assessment.directAnswerRelianceCount}회`,
    `- 최종 답안-응답 유사도 근사치: ${(assessment.finalAnswerOverlapScore * 100).toFixed(0)}%`,
    `- 회복 관찰 여부: ${assessment.recoveryObserved ? "예" : "아니오"}`,
    `- 핵심 요약: ${assessment.summary}`,
    assessment.triggerEvidence.length > 0
      ? `- 트리거 근거: ${assessment.triggerEvidence.join(" / ")}`
      : "- 트리거 근거: 없음",
    assessment.recoveryEvidence.length > 0
      ? `- 회복 근거: ${assessment.recoveryEvidence.join(" / ")}`
      : "- 회복 근거: 없음",
  ].join("\n");
}

export function summarizeAiDependencyAssessments(
  assessments: Array<{ q_idx: number; assessment?: AiDependencyAssessment }>
) {
  const validAssessments = assessments.filter(
    (item): item is { q_idx: number; assessment: AiDependencyAssessment } =>
      !!item.assessment
  );

  if (validAssessments.length === 0) {
    return null;
  }

  const triggerCount = validAssessments.reduce(
    (sum, item) =>
      sum +
      item.assessment.delegationRequestCount +
      item.assessment.startingPointDependencyCount +
      item.assessment.directAnswerRequestCount,
    0
  );

  const riskOrder: Record<AiDependencyRiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  const overallRisk = validAssessments.reduce<AiDependencyRiskLevel>(
    (current, item) =>
      riskOrder[item.assessment.overallRisk] > riskOrder[current]
        ? item.assessment.overallRisk
        : current,
    "low"
  );

  const recoveryObserved = validAssessments.some(
    (item) => item.assessment.recoveryObserved
  );

  const triggerEvidence = validAssessments
    .flatMap((item) => item.assessment.triggerEvidence.slice(0, 1))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 3);

  const recoveryEvidence = validAssessments
    .flatMap((item) => item.assessment.recoveryEvidence.slice(0, 1))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 3);

  return {
    overallRisk,
    recoveryObserved,
    triggerCount,
    summary: recoveryObserved
      ? "AI 도움을 받는 과정에서 의존 신호가 있었지만, 일부 문항에서 독립 추론 회복이 확인되었습니다."
      : "AI 응답을 받는 과정에서 의존 신호가 관찰되었고, 독립 추론 회복 근거는 제한적이었습니다.",
    triggerEvidence,
    recoveryEvidence,
    questionBreakdown: validAssessments.map((item) => ({
      q_idx: item.q_idx,
      overallRisk: item.assessment.overallRisk,
      recoveryObserved: item.assessment.recoveryObserved,
      summary: item.assessment.summary,
    })),
  };
}
