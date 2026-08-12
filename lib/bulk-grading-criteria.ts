/**
 * Bulk grading criteria interview helpers — parse markers, extract structured criteria.
 */

import { getOpenAI, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/openai";
import { callTrackedChatCompletion, buildAiTextMetadata } from "@/lib/ai-tracking";
import {
  buildCriteriaExtractionSystemPrompt,
  type ExtractedCriteria,
  type GradingScoreRange,
} from "@/lib/prompts";

import {
  countInterviewQuestions,
  MIN_BULK_GRADE_INTERVIEW_QUESTIONS,
} from "@/lib/bulk-grade-thread";

export type { GradingScoreRange };

const CRITERIA_READY_RE =
  /\[CRITERIA_READY\]\s*(\{[\s\S]*?\})\s*\[\/CRITERIA_READY\]/;

/** Instructor-confirmed score distribution for this cohort (0–100). */
export function parseCriteriaReadyMarker(content: string): GradingScoreRange | null {
  const match = content.match(CRITERIA_READY_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as {
      score_range?: GradingScoreRange;
    } & GradingScoreRange;
    const range = parsed.score_range ?? parsed;
    if (
      typeof range.min === "number" &&
      typeof range.max === "number" &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      range.min >= 0 &&
      range.max <= 100 &&
      range.min <= range.max
    ) {
      return {
        min: Math.round(range.min),
        max: Math.round(range.max),
        notes: typeof range.notes === "string" ? range.notes : undefined,
      };
    }
  } catch {
    // ignore malformed marker
  }
  return null;
}

export function stripCriteriaReadyMarker(content: string): string {
  return content.replace(CRITERIA_READY_RE, "").trim();
}

export function isInterviewReady(calibrationStatus: string | null | undefined): boolean {
  return calibrationStatus === "sample_review";
}

export function buildInterviewChatMeta(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  calibrationStatus: string | null | undefined,
): {
  interviewQuestionCount: number;
  canProceedToGrading: boolean;
  canStartGrading: boolean;
} {
  const interviewQuestionCount = countInterviewQuestions(messages);
  const ready = isInterviewReady(calibrationStatus);
  return {
    interviewQuestionCount,
    canProceedToGrading:
      !ready && interviewQuestionCount >= MIN_BULK_GRADE_INTERVIEW_QUESTIONS,
    canStartGrading: ready,
  };
}

function normalizeExtractedCriteria(raw: unknown): ExtractedCriteria | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const summary =
    typeof record.criteria_summary === "string" ? record.criteria_summary.trim() : "";
  if (!summary) return null;

  const perQuestion = Array.isArray(record.per_question)
    ? record.per_question
        .filter(
          (item): item is { q_idx: number; criteria: string } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { q_idx?: unknown }).q_idx === "number" &&
            typeof (item as { criteria?: unknown }).criteria === "string",
        )
        .map((item) => ({
          q_idx: item.q_idx,
          criteria: item.criteria.trim(),
        }))
    : [];

  let scoreRange: GradingScoreRange | undefined;
  const sr = record.score_range;
  if (sr && typeof sr === "object") {
    const r = sr as GradingScoreRange;
    if (
      typeof r.min === "number" &&
      typeof r.max === "number" &&
      r.min >= 0 &&
      r.max <= 100
    ) {
      scoreRange = {
        min: Math.round(r.min),
        max: Math.round(r.max),
        notes: typeof r.notes === "string" ? r.notes : undefined,
      };
    }
  }

  const edgeCases = Array.isArray(record.edge_case_rules)
    ? record.edge_case_rules.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : undefined;

  const tradeoffs = Array.isArray(record.priority_tradeoffs)
    ? record.priority_tradeoffs.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : undefined;

  return {
    criteria_summary: summary,
    per_question: perQuestion,
    score_range: scoreRange,
    edge_case_rules: edgeCases?.length ? edgeCases : undefined,
    priority_tradeoffs: tradeoffs?.length ? tradeoffs : undefined,
  };
}

/**
 * Extract structured grading criteria (including score range) from the interview chat.
 */
export async function extractGradingCriteriaFromChat(params: {
  messages: Array<{ role: string; content: string }>;
  language: "ko" | "en";
  isAssignment: boolean;
  userId?: string;
  examId?: string;
}): Promise<ExtractedCriteria | null> {
  const transcript = params.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const label = m.role === "user" ? "Instructor" : "Interviewer";
      const body =
        m.role === "assistant" ? stripCriteriaReadyMarker(m.content) : m.content;
      return `${label}: ${body}`;
    })
    .join("\n\n");

  if (!transcript.trim()) return null;

  const systemPrompt = buildCriteriaExtractionSystemPrompt({
    language: params.language,
    isAssignment: params.isAssignment,
    preferences: null,
  });

  const tracked = await callTrackedChatCompletion(
    () =>
      getOpenAI().chat.completions.create({
        model: AI_MODEL_BULK_GRADING_WORKER,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      }),
    {
      feature: "bulk_grading_criteria_extract",
      route: "lib/bulk-grading-criteria",
      model: AI_MODEL_BULK_GRADING_WORKER,
      userId: params.userId,
      examId: params.examId,
      metadata: buildAiTextMetadata({ inputText: [systemPrompt, transcript] }),
    },
    {
      metadataBuilder: (result) =>
        buildAiTextMetadata({
          outputText:
            (result as { choices?: Array<{ message?: { content?: string | null } }> })
              .choices?.[0]?.message?.content ?? null,
        }),
    },
  );

  const raw = tracked.data.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;

  try {
    return normalizeExtractedCriteria(JSON.parse(raw));
  } catch {
    return null;
  }
}
