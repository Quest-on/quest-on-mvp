import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import type { InputEvent as AnswerTelemetryEvent } from "@/lib/answer-integrity";

const MAX_EVENTS_PER_BATCH = 2_000;
const MAX_TOTAL_EVENTS = 50_000;

function isValidEvent(raw: unknown): raw is AnswerTelemetryEvent {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.ts === "number" &&
    (e.kind === "insert" || e.kind === "delete" || e.kind === "paste") &&
    typeof e.delta === "number" &&
    typeof e.len === "number"
  );
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServer();
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `final-answer-input:${user.id}`,
      RATE_LIMITS.finalAnswerInput
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many telemetry requests", 429);
    }

    const body = await request.json();
    const { sessionId, events } = body as {
      sessionId?: string;
      events?: unknown[];
    };

    if (!sessionId) {
      return errorJson("BAD_REQUEST", "sessionId is required", 400);
    }
    if (!Array.isArray(events) || events.length === 0) {
      return errorJson("BAD_REQUEST", "events array is required", 400);
    }
    if (events.length > MAX_EVENTS_PER_BATCH) {
      return errorJson("BAD_REQUEST", "Too many events in batch", 400);
    }

    const validEvents = events.filter(isValidEvent);
    if (validEvents.length === 0) {
      return errorJson("BAD_REQUEST", "No valid events", 400);
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    const { data: existing } = await supabase
      .from("final_answer_input_telemetry")
      .select("events")
      .eq("session_id", sessionId)
      .maybeSingle();

    const prior = Array.isArray(existing?.events)
      ? (existing.events as AnswerTelemetryEvent[])
      : [];
    const merged = [...prior, ...validEvents].slice(-MAX_TOTAL_EVENTS);

    const { error: upsertError } = await supabase
      .from("final_answer_input_telemetry")
      .upsert(
        {
          session_id: sessionId,
          events: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id" }
      );

    if (upsertError) {
      logError("[final-answer-input] Failed to upsert telemetry", upsertError, {
        path: "/api/log/final-answer-input",
        additionalData: { sessionId },
      });
      return errorJson("INTERNAL_ERROR", "Failed to save telemetry", 500);
    }

    return successJson({ saved: validEvents.length, total: merged.length });
  } catch (error) {
    logError("[final-answer-input] Unhandled error", error, {
      path: "/api/log/final-answer-input",
    });
    return errorJson("INTERNAL_ERROR", "Failed to log input telemetry", 500);
  }
}
