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
  | "answer_integrity_analyzer"
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
  "answer_integrity_analyzer",
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

const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = {
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
  "gpt-5.4": {
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    cachedInputUsdPer1M: 0.125,
  },
  "gpt-5.3-chat-latest": {
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    cachedInputUsdPer1M: 0.125,
  },
  "gpt-4o-mini": {
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.60,
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
