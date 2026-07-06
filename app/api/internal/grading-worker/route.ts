export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withQStashSignature } from "@/lib/qstash-signature";
import { z } from "zod";
import {
  gradeOneQuestion,
  generateOneQuestionSummary,
  generateSessionSummaryPhase,
  listQuestionsToGrade,
  listGradedQuestionsForSummary,
  listCaseQuestionsForSummary,
  isAssignmentGradingSession,
  markObjectiveOnlyGradingDone,
} from "@/lib/grading";
import { enqueueGradingPhase } from "@/lib/qstash";
import { getSupabaseServer } from "@/lib/supabase-server";
import { logError } from "@/lib/logger";
import type {
  GradingPhasePayload,
  GradingProgress,
} from "@/lib/types/grading";

/**
 * QStash grading worker — handles ONE phase per invocation.
 *
 * Exam pipeline:
 *   grade_question (objective only)
 *   → caseCount 0: objective_only_done
 *   → caseCount 1: session_summary
 *   → caseCount ≥ 2: question_summary (per case) → session_summary
 *
 * Assignment pipeline unchanged: grade → question_summary → session_summary.
 */

const payloadSchema: z.ZodType<GradingPhasePayload> = z.discriminatedUnion(
  "phase",
  [
    z.object({
      sessionId: z.string().uuid(),
      phase: z.literal("grade_question"),
      qIdx: z.number().int().min(0),
    }),
    z.object({
      sessionId: z.string().uuid(),
      phase: z.literal("question_summary"),
      qIdx: z.number().int().min(0),
    }),
    z.object({
      sessionId: z.string().uuid(),
      phase: z.literal("session_summary"),
    }),
  ]
);

async function markFailed(
  sessionId: string,
  lastError: string
): Promise<void> {
  const supabase = getSupabaseServer();
  try {
    const { data } = await supabase
      .from("sessions")
      .select("grading_progress")
      .eq("id", sessionId)
      .maybeSingle();

    const existing = (data?.grading_progress as GradingProgress | null) || {
      status: "queued" as const,
      total: 0,
      completed: 0,
      failed: 0,
      updated_at: new Date().toISOString(),
    };

    const patched: GradingProgress = {
      ...existing,
      last_error: lastError.slice(0, 500),
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("sessions")
      .update({ grading_progress: patched })
      .eq("id", sessionId);
  } catch (err) {
    logError("[GRADING_WORKER] Failed to record phase error", err, {
      path: "/api/internal/grading-worker",
      additionalData: { sessionId },
    });
  }
}

async function enqueueExamSummaryPipeline(
  sessionId: string,
  objectiveTotal: number,
  objectiveGraded: number
): Promise<GradingPhasePayload | null> {
  const caseIdxs = await listCaseQuestionsForSummary(sessionId);

  if (caseIdxs.length === 0) {
    await markObjectiveOnlyGradingDone(sessionId, {
      total: objectiveTotal,
      completed: objectiveGraded,
      failed: Math.max(0, objectiveTotal - objectiveGraded),
    });
    return null;
  }

  if (caseIdxs.length === 1) {
    return { sessionId, phase: "session_summary" };
  }

  return {
    sessionId,
    phase: "question_summary",
    qIdx: caseIdxs[0],
  };
}

/**
 * Given current phase output, figure out what to enqueue next.
 * Returns null when the pipeline is complete.
 */
async function computeNextPhase(
  payload: GradingPhasePayload
): Promise<GradingPhasePayload | null> {
  if (payload.phase === "grade_question") {
    const toGrade = await listQuestionsToGrade(payload.sessionId);
    const next = toGrade.find((idx) => idx > payload.qIdx);
    if (typeof next === "number") {
      return { sessionId: payload.sessionId, phase: "grade_question", qIdx: next };
    }

    const graded = await listGradedQuestionsForSummary(payload.sessionId);
    const isAssignment = await isAssignmentGradingSession(payload.sessionId);

    if (!isAssignment) {
      return enqueueExamSummaryPipeline(
        payload.sessionId,
        toGrade.length,
        graded.length
      );
    }

    // Assignment grading keeps its separate AI summary pipeline.
    if (graded.length === 0) {
      return { sessionId: payload.sessionId, phase: "session_summary" };
    }
    return {
      sessionId: payload.sessionId,
      phase: "question_summary",
      qIdx: graded[0],
    };
  }

  if (payload.phase === "question_summary") {
    const isAssignment = await isAssignmentGradingSession(payload.sessionId);
    const indices = isAssignment
      ? await listGradedQuestionsForSummary(payload.sessionId)
      : await listCaseQuestionsForSummary(payload.sessionId);

    const next = indices.find((idx) => idx > payload.qIdx);
    if (typeof next === "number") {
      return {
        sessionId: payload.sessionId,
        phase: "question_summary",
        qIdx: next,
      };
    }
    return { sessionId: payload.sessionId, phase: "session_summary" };
  }

  return null;
}

async function handler(request: NextRequest): Promise<Response> {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (parseErr) {
    logError("[GRADING_WORKER] Invalid JSON body", parseErr, {
      path: "/api/internal/grading-worker",
    });
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    logError("[GRADING_WORKER] Schema validation failed", parsed.error, {
      path: "/api/internal/grading-worker",
      additionalData: { rawPayload },
    });
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    let result: { skipped: boolean } = { skipped: false };

    if (payload.phase === "grade_question") {
      result = await gradeOneQuestion(payload.sessionId, payload.qIdx);
    } else if (payload.phase === "question_summary") {
      result = await generateOneQuestionSummary(payload.sessionId, payload.qIdx);
    } else {
      result = await generateSessionSummaryPhase(payload.sessionId);
    }

    const next = await computeNextPhase(payload);
    let nextQueued = false;
    if (next) {
      const publish = await enqueueGradingPhase(next);
      if (!publish.ok) {
        await markFailed(
          payload.sessionId,
          `Failed to enqueue next phase (${next.phase}): reason=${publish.reason}`
        );
        return NextResponse.json(
          {
            error: "NEXT_PHASE_ENQUEUE_FAILED",
            reason: publish.reason,
          },
          { status: 500 }
        );
      }
      nextQueued = true;
    }

    return NextResponse.json({
      ok: true,
      sessionId: payload.sessionId,
      phase: payload.phase,
      qIdx: "qIdx" in payload ? payload.qIdx : undefined,
      skipped: result.skipped,
      nextQueued,
      nextPhase: next?.phase ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`[GRADING_WORKER] Phase ${payload.phase} failed`, err, {
      path: "/api/internal/grading-worker",
      additionalData: { payload },
    });
    await markFailed(payload.sessionId, `${payload.phase}: ${message}`);
    return NextResponse.json(
      {
        error: "PHASE_FAILED",
        phase: payload.phase,
        message,
      },
      { status: 500 }
    );
  }
}

export const POST = withQStashSignature(handler);
