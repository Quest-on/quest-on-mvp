export const AI_PRICING_VERSION = "2026-03-07-v1";

export type AiEndpoint = "chat.completions" | "responses" | "embeddings";

export type AiFeature =
  | "student_chat"
  | "instructor_chat"
  | "feedback_chat"
  | "auto_grading_question"
  | "auto_grading_question_summary"
  | "auto_grading_summary"
  | "generate_questions"
  | "generate_questions_stream"
  | "adjust_question"
  | "generate_rubric"
  | "generate_summary"
  | "assignment_quiz"
  | "instructor_agent"
  | "case_grading_chat"
  | "bulk_grading_chat"
  | "bulk_grading_chat_options"
  | "bulk_grading_criteria_extract"
  | "bulk_grading_execute"
  | "embedding";

export const AI_FEATURES: AiFeature[] = [
  "student_chat",
  "instructor_chat",
  "feedback_chat",
  "auto_grading_question",
  "auto_grading_question_summary",
  "auto_grading_summary",
  "generate_questions",
  "generate_questions_stream",
  "adjust_question",
  "generate_rubric",
  "generate_summary",
  "assignment_quiz",
  "instructor_agent",
  "case_grading_chat",
  "bulk_grading_chat",
  "bulk_grading_chat_options",
  "bulk_grading_criteria_extract",
  "bulk_grading_execute",
  "embedding",
];

export interface AiUsageSnapshot {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

interface ModelPricing {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cachedInputUsdPer1M?: number;
}

// OpenAI 공식 요금 (developers.openai.com/api/docs/models/<model>.md 기준, 2026-08 확인).
// 여기 없는 모델은 resolveModelPricing 이 null 을 돌려주고 비용이 0 으로 기록된다.
// 즉 모델을 바꿀 때 이 표를 같이 갱신하지 않으면 비용 관측이 조용히 눈을 감는다.
const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = {
  // ── GPT-5.6 (Sol / Terra / Luna). 2026-07-30 인하가 반영된 가격 ──
  "gpt-5.6-sol": {
    inputUsdPer1M: 5,
    outputUsdPer1M: 30,
    cachedInputUsdPer1M: 0.5,
  },
  "gpt-5.6-terra": {
    inputUsdPer1M: 2,
    outputUsdPer1M: 12,
    cachedInputUsdPer1M: 0.2,
  },
  "gpt-5.6-luna": {
    inputUsdPer1M: 0.2,
    outputUsdPer1M: 1.2,
    cachedInputUsdPer1M: 0.02,
  },
  // ── GPT-5.5 ──
  "gpt-5.5": {
    inputUsdPer1M: 5,
    outputUsdPer1M: 30,
    cachedInputUsdPer1M: 0.5,
  },
  // ── GPT-5.4 계열 ──
  "gpt-5.4": {
    inputUsdPer1M: 2.5,
    outputUsdPer1M: 15,
    cachedInputUsdPer1M: 0.25,
  },
  "gpt-5.4-mini": {
    inputUsdPer1M: 0.75,
    outputUsdPer1M: 4.5,
    cachedInputUsdPer1M: 0.075,
  },
  "gpt-5.4-nano": {
    inputUsdPer1M: 0.2,
    outputUsdPer1M: 1.25,
    cachedInputUsdPer1M: 0.02,
  },
  // ── 폐기 예정. 공식 문서가 GPT-5.6 이전을 권고한다 ──
  "gpt-5.3-chat-latest": {
    inputUsdPer1M: 1.75,
    outputUsdPer1M: 14,
    cachedInputUsdPer1M: 0.175,
  },
  // ── 레거시 ──
  "gpt-5": {
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    cachedInputUsdPer1M: 0.125,
  },
  "gpt-5-chat-latest": {
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    cachedInputUsdPer1M: 0.125,
  },
  "gpt-4o-mini": {
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
    cachedInputUsdPer1M: 0.075,
  },
  "text-embedding-3-small": {
    inputUsdPer1M: 0.02,
    outputUsdPer1M: 0,
    cachedInputUsdPer1M: 0.02,
  },
};

export function resolveModelPricing(model: string): ModelPricing | null {
  return OPENAI_MODEL_PRICING[model] ?? null;
}

export function calculateEstimatedCostUsdMicros(
  model: string,
  usage: AiUsageSnapshot | null
): number {
  if (!usage) return 0;

  const pricing = resolveModelPricing(model);
  if (!pricing) return 0;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  const inputCost =
    (billableInputTokens / 1_000_000) * pricing.inputUsdPer1M * 1_000_000;
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) *
    (pricing.cachedInputUsdPer1M ?? pricing.inputUsdPer1M) *
    1_000_000;
  const outputCost =
    (outputTokens / 1_000_000) * pricing.outputUsdPer1M * 1_000_000;

  return Math.round(inputCost + cachedInputCost + outputCost);
}
