/**
 * 답안 무결성 — 서버 전용 (DB 로드, AI 분석기).
 * API 라우트에서만 import 하세요. 클라이언트 컴포넌트는 @/lib/answer-integrity 사용.
 */

import { z } from "zod";
import type { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseServer as getSupabase } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { getOpenAI, AI_MODEL_HEAVY } from "@/lib/openai";
import { buildAnswerAuthenticityAnalyzerSystemPrompt } from "@/lib/prompts";
import { logError } from "@/lib/logger";
import { isAssignmentType } from "@/lib/grading-helpers";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import {
  assignmentIntegrityScope,
  buildExternalPasteSuspicionDetails,
  computeAnswerIntegrityMetrics,
  detectAbnormalInputBursts,
  formatMetricsForAnalyzerPrompt,
  parseIntegrityScope,
  resolvePasteAssessment,
  resolvePasteLogQuestionId,
  type AnswerIntegrityAnalysis,
  type AnswerIntegrityMetrics,
  type AnswerIntegrityScope,
  type AnswerIntegritySnapshot,
  type InputEvent,
  type IntegrityClassification,
  type PasteAssessment,
  type PasteLogRow,
} from "@/lib/answer-integrity";

type IntegrityDb = ReturnType<typeof getSupabaseServer>;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** paste 로그 + (과제만) 입력 타임라인으로 무결성 스냅샷 생성 */
export async function loadAnswerIntegritySnapshot(
  supabase: IntegrityDb,
  sessionId: string,
  scope: AnswerIntegrityScope = assignmentIntegrityScope()
): Promise<AnswerIntegritySnapshot> {
  const questionId = resolvePasteLogQuestionId(scope);
  const pasteResult = await supabase
    .from("paste_logs")
    .select("length, is_internal, suspicious, timestamp, pasted_text, paste_start")
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .order("timestamp", { ascending: true });

  let events: InputEvent[] = [];
  if (scope.kind === "assignment") {
    const telemetryResult = await supabase
      .from("final_answer_input_telemetry")
      .select("events")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!telemetryResult.error) {
      events = Array.isArray(telemetryResult.data?.events)
        ? (telemetryResult.data.events as InputEvent[])
        : [];
    }
  }

  const pasteLogs = (pasteResult.data ?? []) as PasteLogRow[];
  const external = pasteLogs.filter((l) => l.suspicious && !l.is_internal);
  const internal = pasteLogs.filter((l) => l.is_internal);

  return {
    scope,
    externalPasteCount: external.length,
    externalPasteChars: external.reduce((s, l) => s + (l.length || 0), 0),
    internalPasteCount: internal.length,
    internalPasteChars: internal.reduce((s, l) => s + (l.length || 0), 0),
    abnormalBursts: detectAbnormalInputBursts(events),
    pasteLogs,
    externalPasteDetails: buildExternalPasteSuspicionDetails(pasteLogs, "ko"),
  };
}

/** @deprecated loadAnswerIntegritySnapshot 사용 */
export const loadFinalAnswerIntegrity = (
  supabase: IntegrityDb,
  sessionId: string
) => loadAnswerIntegritySnapshot(supabase, sessionId, assignmentIntegrityScope());

/** API 라우트용 — 세션 exam.type 기준으로 scope 결정 */
export async function resolveIntegrityScopeForSession(
  sessionId: string,
  questionId?: string | null,
  qIdx?: number | null
): Promise<AnswerIntegrityScope> {
  const supabase = getSupabase();
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("exam_id")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) throw new Error("SESSION_NOT_FOUND");

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("type")
    .eq("id", session.exam_id)
    .single();
  if (examError || !exam) throw new Error("EXAM_NOT_FOUND");

  return parseIntegrityScope({
    examType: exam.type as string,
    questionId,
    qIdx,
  });
}

const pasteAssessmentSchema = z.object({
  external_paste_suspected: z.boolean(),
  review_level: z.enum(["해당 없음", "낮음", "중간", "높음"]),
  summary: z.string().min(1),
  evidence: z.array(z.string()).min(1).max(6),
});

const analysisSchema = z.object({
  authenticity_score: z.number().min(0).max(100),
  classification: z.enum([
    "정상",
    "낮은 검토 필요",
    "검토 권장",
    "우선 검토 필요",
  ]),
  evidence: z.array(z.string()).min(1).max(8),
  risk_factors: z.array(z.string()).max(8),
  reasoning_summary: z.string().min(1),
  paste_assessment: pasteAssessmentSchema,
});

async function loadCachedIntegrityAnalysis(
  supabase: IntegrityDb,
  sessionId: string
): Promise<AnswerIntegrityAnalysis | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("final_answer_authenticity")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.final_answer_authenticity as AnswerIntegrityAnalysis | null) ?? null;
}

export async function loadAnswerIntegrityInput(
  sessionId: string,
  scope: AnswerIntegrityScope
) {
  const supabase = getSupabase();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, exam_id, student_id, created_at, submitted_at, final_answer, final_answer_updated_at"
    )
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, instructor_id, type, questions")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    throw new Error("EXAM_NOT_FOUND");
  }

  if (scope.kind === "assignment" && !isAssignmentType(exam.type)) {
    throw new Error("INVALID_SCOPE");
  }
  if (scope.kind === "exam_question" && isAssignmentType(exam.type)) {
    throw new Error("INVALID_SCOPE");
  }

  const snapshot = await loadAnswerIntegritySnapshot(supabase, sessionId, scope);

  let inputEvents: InputEvent[] = [];
  if (scope.kind === "assignment") {
    const { data: telemetry, error: telemetryError } = await supabase
      .from("final_answer_input_telemetry")
      .select("events")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!telemetryError) {
      inputEvents = Array.isArray(telemetry?.events)
        ? (telemetry.events as InputEvent[])
        : [];
    }
  }

  let answerText = "";
  let answerUpdatedAt: string | null = null;

  if (scope.kind === "assignment") {
    answerText = typeof session.final_answer === "string" ? session.final_answer : "";
    answerUpdatedAt = session.final_answer_updated_at ?? null;
  } else {
    const { data: submission } = await supabase
      .from("submissions")
      .select("answer, updated_at")
      .eq("session_id", sessionId)
      .eq("q_idx", scope.qIdx)
      .maybeSingle();
    answerText = stripHtml(typeof submission?.answer === "string" ? submission.answer : "");
    answerUpdatedAt = (submission?.updated_at as string | null) ?? null;
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content, compressed_content, created_at, q_idx")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const aiMessages: Array<{ role: string; content: string; created_at?: string }> = [];
  for (const msg of messages ?? []) {
    if (scope.kind === "exam_question" && msg.q_idx !== scope.qIdx) continue;
    let content = msg.content as string;
    if (msg.compressed_content && typeof msg.compressed_content === "string") {
      try {
        content = decompressData(msg.compressed_content) as string;
      } catch {
        // keep raw
      }
    }
    aiMessages.push({
      role: msg.role as string,
      content: content ?? "",
      created_at: msg.created_at as string,
    });
  }

  const metrics = computeAnswerIntegrityMetrics({
    answerText,
    sessionCreatedAt: session.created_at ?? null,
    submissionTime: session.submitted_at ?? null,
    answerUpdatedAt,
    pasteLogs: snapshot.pasteLogs,
    inputEvents,
    aiMessages,
  });

  const cached =
    scope.kind === "assignment"
      ? await loadCachedIntegrityAnalysis(supabase, sessionId)
      : null;

  return {
    session,
    exam,
    scope,
    snapshot,
    metrics,
    cached,
    pasteAssessment: resolvePasteAssessment(cached, metrics),
  };
}

export async function runAnswerIntegrityAnalysis(params: {
  sessionId: string;
  instructorId: string;
  scope: AnswerIntegrityScope;
  force?: boolean;
}): Promise<{
  analysis: AnswerIntegrityAnalysis;
  metrics: AnswerIntegrityMetrics;
  snapshot: AnswerIntegritySnapshot;
  pasteAssessment: PasteAssessment | null;
  fromCache: boolean;
}> {
  const { sessionId, instructorId, scope, force = false } = params;
  const loaded = await loadAnswerIntegrityInput(sessionId, scope);

  if (loaded.exam.instructor_id !== instructorId) {
    throw new Error("FORBIDDEN");
  }

  if (loaded.cached && !force && scope.kind === "assignment") {
    return {
      analysis: loaded.cached,
      metrics: loaded.metrics,
      snapshot: loaded.snapshot,
      pasteAssessment: resolvePasteAssessment(loaded.cached, loaded.metrics),
      fromCache: true,
    };
  }

  const systemPrompt = buildAnswerAuthenticityAnalyzerSystemPrompt();
  const userPrompt = `아래는 한 학생의 답안 작성 과정에서 수집된 **복합 행동 지표** JSON입니다.
모든 제공 필드를 함께 검토하고, unavailable_metrics는 단독 근거로 쓰지 마십시오.

${formatMetricsForAnalyzerPrompt(loaded.metrics)}`;

  const tracked = await callTrackedChatCompletion(
    () =>
      getOpenAI().chat.completions.create({
        model: AI_MODEL_HEAVY,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1200,
      }),
    {
      feature: "answer_integrity_analyzer",
      route: `/api/session/${sessionId}/answer-integrity`,
      model: AI_MODEL_HEAVY,
      userId: instructorId,
      examId: loaded.exam.id,
      sessionId,
      metadata: buildAiTextMetadata({
        inputText: [systemPrompt, userPrompt],
      }),
    },
    {
      metadataBuilder: (result) =>
        buildAiTextMetadata({
          outputText:
            (
              result as {
                choices?: Array<{ message?: { content?: string | null } }>;
              }
            ).choices?.[0]?.message?.content ?? null,
        }),
    }
  );

  const raw = tracked.data.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("EMPTY_AI_RESPONSE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_AI_JSON");
  }

  const validated = analysisSchema.safeParse(parsed);
  if (!validated.success) {
    logError("[answer-integrity] schema validation failed", validated.error, {
      path: "/lib/answer-integrity-server",
      additionalData: { sessionId, scope },
    });
    throw new Error("INVALID_AI_SCHEMA");
  }

  const analysis: AnswerIntegrityAnalysis = {
    ...validated.data,
    classification: validated.data.classification as IntegrityClassification,
    paste_assessment: validated.data.paste_assessment,
    analyzed_at: new Date().toISOString(),
    metrics_snapshot: loaded.metrics,
  };

  if (scope.kind === "assignment") {
    const supabase = getSupabase();
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ final_answer_authenticity: analysis })
      .eq("id", sessionId);

    if (updateError) {
      logError("[answer-integrity] failed to cache analysis", updateError, {
        path: "/lib/answer-integrity-server",
        additionalData: { sessionId },
      });
    }
  }

  return {
    analysis,
    metrics: loaded.metrics,
    snapshot: loaded.snapshot,
    pasteAssessment: resolvePasteAssessment(analysis, loaded.metrics),
    fromCache: false,
  };
}
