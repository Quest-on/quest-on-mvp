import OpenAI from "openai";
import pLimit from "p-limit";
import { logError } from "@/lib/logger";

// NOTE: The grading queue that used to live here (`enqueueGrading` +
// `gradingLimiter = pLimit(60)`) was removed when the grading pipeline
// moved to chained QStash jobs. QStash itself serializes work per
// dedup-id and scales naturally — there is no longer any in-process
// serverless promise to throttle.

/**
 * IMPORTANT:
 * Do NOT throw at module import time.
 * If a required env var is missing in production, throwing here can prevent
 * Next.js route handlers from being registered and lead to confusing 404/405/500
 * behavior (often returning HTML error pages).
 */

// Backward compatible client (may have a placeholder key if env is missing).
// Routes should still handle OpenAI errors at call time.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "MISSING_OPENAI_API_KEY",
  ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
});

// Preferred: lazy + explicit failure with a clear error message.
let _openai: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  if (!_openai) {
    _openai = new OpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
  }
  return _openai;
}

// AI 모델 상수 - 여기서 변경하면 전체 코드에 적용됨
export const AI_MODEL = process.env.AI_MODEL || "gpt-5.3-chat-latest";
export const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || "gpt-5.4";
export const AI_MODEL_BULK_GRADING_WORKER =
  process.env.AI_MODEL_BULK_GRADING_WORKER || "gpt-4o-mini";

// ============================================================
// Global concurrency limiter for OpenAI API calls
// Max 100 concurrent requests for 150-user classroom scale
// ============================================================
const openaiLimiter = pLimit(100);

const OPENAI_TIMEOUT_MS = 120_000;

export class OpenAITimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`OpenAI call timed out after ${timeoutMs}ms`);
    this.name = "OpenAITimeoutError";
  }
}

export class OpenAICallTelemetryError extends Error {
  error: unknown;
  attemptCount: number;
  latencyMs: number;

  constructor(params: {
    error: unknown;
    attemptCount: number;
    latencyMs: number;
  }) {
    super("OpenAI call failed");
    this.name = "OpenAICallTelemetryError";
    this.error = params.error;
    this.attemptCount = params.attemptCount;
    this.latencyMs = params.latencyMs;
  }
}

export async function callOpenAIWithTelemetry<T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; maxAttempts?: number }
): Promise<{ data: T; attemptCount: number; latencyMs: number }> {
  const timeout = options?.timeoutMs ?? OPENAI_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);

  return openaiLimiter(async () => {
    const startedAt = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new OpenAITimeoutError(timeout)), timeout)
          ),
        ]);

        return {
          data,
          attemptCount: attempt + 1,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];
        const isRetryable =
          error instanceof OpenAI.APIError &&
          RETRYABLE_STATUS.includes(error.status);
        const isLastAttempt = attempt === maxAttempts - 1;

        if (!isRetryable || isLastAttempt) {
          throw new OpenAICallTelemetryError({
            error,
            attemptCount: attempt + 1,
            latencyMs: Date.now() - startedAt,
          });
        }

        // Exponential backoff with jitter: 1-2s, 2-3s, 4-5s
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        const statusCode = error instanceof OpenAI.APIError ? error.status : "unknown";
        logError(
          `[callOpenAI] ${statusCode} error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new OpenAICallTelemetryError({
      error: new Error("callOpenAI: unexpected retry loop exit"),
      attemptCount: maxAttempts,
      latencyMs: Date.now() - startedAt,
    });
  });
}

/**
 * Wraps an OpenAI API call with:
 * 1. Global concurrency limit (max 100 simultaneous calls)
 * 2. Exponential backoff retry on 429 errors (max 3 attempts)
 * 3. Configurable timeout (default 25s) to prevent connection pool exhaustion
 */
export async function callOpenAI<T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; maxAttempts?: number }
): Promise<T> {
  const { data } = await callOpenAIWithTelemetry(fn, options);
  return data;
}
