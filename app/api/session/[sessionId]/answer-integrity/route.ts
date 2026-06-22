export const maxDuration = 120;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  loadAnswerIntegrityInput,
  resolveIntegrityScopeForSession,
  runAnswerIntegrityAnalysis,
} from "@/lib/answer-integrity-server";

function readScopeParams(
  searchParams: URLSearchParams,
  body?: { questionId?: string; qIdx?: number }
) {
  const questionId = body?.questionId ?? searchParams.get("questionId") ?? undefined;
  const qIdxRaw = body?.qIdx ?? searchParams.get("qIdx");
  const qIdx =
    qIdxRaw != null && qIdxRaw !== "" && Number.isFinite(Number(qIdxRaw))
      ? Number(qIdxRaw)
      : undefined;
  return { questionId, qIdx };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const invalid = validateUUID(sessionId, "sessionId");
    if (invalid) return invalid;

    const user = await currentUser();
    if (!user || user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const { questionId, qIdx } = readScopeParams(request.nextUrl.searchParams);
    const scope = await resolveIntegrityScopeForSession(sessionId, questionId, qIdx);
    const data = await loadAnswerIntegrityInput(sessionId, scope);

    if (data.exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    if (data.cached) {
      return successJson({
        scope,
        snapshot: data.snapshot,
        analysis: data.cached,
        metrics: data.metrics,
        pasteAssessment: data.pasteAssessment,
        fromCache: true,
      });
    }

    return successJson({
      scope,
      snapshot: data.snapshot,
      analysis: null,
      metrics: data.metrics,
      pasteAssessment: data.pasteAssessment,
      fromCache: false,
      needsAnalysis: scope.kind === "assignment",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "SESSION_NOT_FOUND") return errorJson("NOT_FOUND", "Session not found", 404);
    if (msg === "QUESTION_ID_REQUIRED") {
      return errorJson("BAD_REQUEST", "questionId is required for exam answers", 400);
    }
    if (msg === "INVALID_SCOPE") {
      return errorJson("BAD_REQUEST", "Invalid scope for this session type", 400);
    }
    logError("[answer-integrity] GET failed", error, {
      path: "/api/session/answer-integrity",
    });
    return errorJson("INTERNAL_ERROR", "Failed to load integrity data", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const invalid = validateUUID(sessionId, "sessionId");
    if (invalid) return invalid;

    const user = await currentUser();
    if (!user || user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const rl = await checkRateLimitAsync(
      `answer-integrity:${user.id}`,
      RATE_LIMITS.ai
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many analysis requests", 429);
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;
    const { questionId, qIdx } = readScopeParams(request.nextUrl.searchParams, body);
    const scope = await resolveIntegrityScopeForSession(sessionId, questionId, qIdx);

    const result = await runAnswerIntegrityAnalysis({
      sessionId,
      instructorId: user.id,
      scope,
      force,
    });

    return successJson({
      scope,
      snapshot: result.snapshot,
      analysis: result.analysis,
      metrics: result.metrics,
      pasteAssessment: result.pasteAssessment,
      fromCache: result.fromCache,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "SESSION_NOT_FOUND") return errorJson("NOT_FOUND", "Session not found", 404);
    if (msg === "FORBIDDEN") return errorJson("FORBIDDEN", "Forbidden", 403);
    if (msg === "QUESTION_ID_REQUIRED") {
      return errorJson("BAD_REQUEST", "questionId is required for exam answers", 400);
    }
    if (msg === "INVALID_SCOPE") {
      return errorJson("BAD_REQUEST", "Invalid scope for this session type", 400);
    }
    logError("[answer-integrity] POST failed", error, {
      path: "/api/session/answer-integrity",
    });
    return errorJson("INTERNAL_ERROR", "Failed to run integrity analysis", 500);
  }
}
