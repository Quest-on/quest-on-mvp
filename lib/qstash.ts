import { Client } from "@upstash/qstash";
import { logError } from "@/lib/logger";
import type { GradingPhasePayload } from "@/lib/types/grading";

/**
 * QStash client for durable background job queueing.
 *
 * Used to enqueue chained grading phase jobs (grade_question,
 * question_summary, session_summary) so that grading survives
 * serverless instance restarts and gets automatic retry on 5xx.
 *
 * Returns null in dev/test when QSTASH_TOKEN is not configured —
 * callers must detect this and decide (prod → error, dev → inline).
 */
let cachedClient: Client | null | undefined = undefined;

export function getQStash(): Client | null {
  if (cachedClient !== undefined) return cachedClient;

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    cachedClient = null;
    return null;
  }

  cachedClient = new Client({ token });
  return cachedClient;
}

/**
 * Returns true when QStash is configured and should be used for queueing.
 */
export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

/**
 * Resolves the base URL the QStash worker should POST back to.
 *
 * Priority (most → least preferred):
 *   1. `QSTASH_WORKER_BASE_URL` — explicit override, useful for local dev (ngrok)
 *      or pinning to a specific canary domain.
 *   2. `NEXT_PUBLIC_APP_URL` — stable production domain (e.g. https://quest-on.app).
 *      This is what we WANT on Vercel so QStash hits the latest production code
 *      instead of a deployment-specific preview URL.
 *   3. `VERCEL_URL` — deployment-specific preview URL (e.g. quest-xyz.vercel.app).
 *      Changes on every deploy, which means old in-flight QStash retries end up
 *      pinned to stale/paused deployments. Only used as a last-resort fallback
 *      and emits a warning so misconfiguration is visible in logs.
 *
 * Returns null when nothing is configured (dev without tunnel).
 */
let warnedVercelUrlFallback = false;
export function getWorkerBaseUrl(): string | null {
  const explicit = process.env.QSTASH_WORKER_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    if (!warnedVercelUrlFallback) {
      warnedVercelUrlFallback = true;
      logError(
        "[QSTASH] Falling back to VERCEL_URL for worker base — set QSTASH_WORKER_BASE_URL or NEXT_PUBLIC_APP_URL to a stable production domain to avoid in-flight retries hitting preview deployments",
        null,
        { path: "lib/qstash.ts", additionalData: { vercelUrl: vercel } }
      );
    }
    return `https://${vercel}`;
  }

  return null;
}

/**
 * Deterministic dedup key for each (session, phase, qIdx) triple.
 * QStash drops duplicate publishes that share this id, preventing
 * the same grading work from being queued twice (e.g. submit + heartbeat
 * racing, or sweeper overlapping with a still-pending retry).
 */
export function gradingDedupId(payload: GradingPhasePayload): string {
  if (payload.phase === "session_summary") {
    return `grading-${payload.sessionId}-session_summary`;
  }
  return `grading-${payload.sessionId}-${payload.phase}-${payload.qIdx}`;
}

// ─── Bulk Grading Jobs ────────────────────────────────────────────────────────

export type BulkGradeJobPayload = {
  gradingSessionId: string;
  studentSessionId: string;
  examId: string;
  scope?: "sample" | "full";
  attemptId?: string;
};

export function bulkGradingDedupId(
  gradingSessionId: string,
  studentSessionId: string,
  scope?: "sample" | "full",
  attemptId?: string,
): string {
  return `bulk-grade-${gradingSessionId}-${studentSessionId}-${scope ?? "full"}-${attemptId ?? "default"}`;
}

export type EnqueueBulkGradeJobsResult = {
  published: number;
  failed: number;
};

/**
 * Enqueues bulk grading jobs for all students.
 * Splits into chunks of 100 (QStash batchJSON limit).
 * Payload contains only IDs — worker loads data from DB.
 */
export async function enqueueBulkGradeJobs(
  jobs: BulkGradeJobPayload[],
): Promise<EnqueueBulkGradeJobsResult> {
  const qstash = getQStash();
  if (!qstash) {
    return { published: 0, failed: jobs.length };
  }

  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return { published: 0, failed: jobs.length };
  }

  const CHUNK_SIZE = 100;
  // Cap how many bulk-grade workers QStash runs concurrently *per grading session*.
  // Without this, every student's job is delivered at once → a large class slams the
  // OpenAI rate limit → many workers 429 → those students get no proposed grade and
  // silently drop out of the panel. Keyed per grading session so concurrent exams
  // don't share a budget. Tune via BULK_GRADE_FLOW_PARALLELISM (default 5).
  const flowParallelism = Math.max(
    1,
    Number(process.env.BULK_GRADE_FLOW_PARALLELISM) || 5,
  );
  let published = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
    const chunk = jobs.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((job) => ({
      url: `${baseUrl}/api/internal/bulk-grade-worker`,
      body: job,
      retries: 3,
      flowControl: {
        key: `bulk-grade-${job.gradingSessionId}`,
        parallelism: flowParallelism,
      },
      headers: {
        "Upstash-Deduplication-Id": bulkGradingDedupId(
          job.gradingSessionId,
          job.studentSessionId,
          job.scope,
          job.attemptId,
        ),
      },
    }));

    try {
      // batchJSON publishes all messages in a single HTTP request
      type QStashWithBatch = Client & { batchJSON?: (msgs: typeof messages) => Promise<unknown[]> };
      const client = qstash as QStashWithBatch;
      if (typeof client.batchJSON === "function") {
        await client.batchJSON(messages);
      } else {
        // Fallback: publishJSON sequentially if batchJSON not available
        await Promise.all(messages.map((m) => qstash.publishJSON(m)));
      }
      published += chunk.length;
    } catch (err) {
      logError("[QSTASH] Bulk grade batch publish failed", err, {
        path: "lib/qstash.ts",
        additionalData: { chunkStart: i, chunkSize: chunk.length },
      });
      failed += chunk.length;
    }
  }

  return { published, failed };
}

export type EnqueueGradingPhaseResult =
  | { ok: true; dedupId: string; messageId: string | null }
  | { ok: false; reason: "qstash_disabled" | "no_base_url" | "publish_failed"; error?: unknown };

/**
 * Publishes one grading-phase job to QStash with idempotent dedup.
 *
 * Returns structured result so callers can surface the reason to
 * operators (rather than swallowing the failure silently).
 */
export async function enqueueGradingPhase(
  payload: GradingPhasePayload
): Promise<EnqueueGradingPhaseResult> {
  const qstash = getQStash();
  if (!qstash) {
    return { ok: false, reason: "qstash_disabled" };
  }

  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    logError(
      "[QSTASH] Grading phase publish skipped — worker base URL unresolved",
      null,
      { path: "lib/qstash.ts", additionalData: { payload } }
    );
    return { ok: false, reason: "no_base_url" };
  }

  const dedupId = gradingDedupId(payload);

  try {
    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/internal/grading-worker`,
      body: payload,
      retries: 3,
      // Upstash-Deduplication-Id header (custom header style)
      headers: {
        "Upstash-Deduplication-Id": dedupId,
      },
    });

    const messageId =
      (result as { messageId?: string } | undefined)?.messageId ?? null;
    return { ok: true, dedupId, messageId };
  } catch (err) {
    logError("[QSTASH] Grading phase publish failed", err, {
      path: "lib/qstash.ts",
      additionalData: { payload, dedupId },
    });
    return { ok: false, reason: "publish_failed", error: err };
  }
}
