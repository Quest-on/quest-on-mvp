export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { readMemoryFlags } from "@/lib/preferences/flags";
import {
  callMemoryExtractor,
  processMemoryExtractionJob,
} from "@/lib/preferences/extraction";
import { enqueueMemoryExtractionRetry } from "@/lib/qstash";
import { withQStashSignature } from "@/lib/qstash-signature";
import { getSupabaseServer } from "@/lib/supabase-server";

const payloadSchema = z
  .object({
    sourceTable: z.enum(["bulk_grading_messages", "grading_chats"]),
    sourceRefId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(200).optional(),
    retryAttempt: z.number().int().nonnegative().optional(),
  })
  .strict();

async function handler(request: NextRequest): Promise<NextResponse> {
  if (!readMemoryFlags().extractionEnabled) {
    return NextResponse.json(
      { ok: false, reason: "extraction_disabled" },
      { status: 200 },
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    logError("memory-extraction-worker: invalid JSON body", error, {
      path: "/api/internal/memory-extraction-worker",
    });
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 200 },
    );
  }

  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    logError("memory-extraction-worker: invalid payload", parsed.error, {
      path: "/api/internal/memory-extraction-worker",
    });
    return NextResponse.json(
      { ok: false, reason: "invalid_payload" },
      { status: 200 },
    );
  }

  try {
    const result = await processMemoryExtractionJob(parsed.data, {
      getClient: getSupabaseServer,
      extractCandidates: callMemoryExtractor,
      requeue: async (payload) => {
        const queued = await enqueueMemoryExtractionRetry(payload);
        if (!queued.ok) {
          throw new Error(
            `memory extraction CAS retry was not queued: ${queued.reason}`,
          );
        }
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError("memory-extraction-worker: processing failed", error, {
      path: "/api/internal/memory-extraction-worker",
      additionalData: {
        sourceTable: parsed.data.sourceTable,
        sourceRefId: parsed.data.sourceRefId,
        retryAttempt: parsed.data.retryAttempt ?? 0,
      },
    });
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 },
    );
  }
}

export const POST = withQStashSignature(handler);
