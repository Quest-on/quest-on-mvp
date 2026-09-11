export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  purgeExpiredConsentRecords,
  recordPurgeRun,
  type PurgeRunStatus,
} from "@/lib/consent-retention";
import { logError } from "@/lib/logger";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function recordFailure(
  cutoff: string,
  error: "CONSENT_RETENTION_PURGE_FAILED" | "INVALID_CONSENT_RETENTION_PURGE_MODE"
): Promise<void> {
  await recordPurgeRun({
    job: "consent-retention",
    cutoff,
    candidateCount: 0,
    deletedCount: 0,
    status: "failed",
    error,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED", deletedCount: 0 }, { status: 401 });
  }

  const cutoff = new Date().toISOString();
  if (process.env.CONSENT_RETENTION_PURGE_DISABLED === "1") {
    try {
      await recordPurgeRun({
        job: "consent-retention",
        cutoff,
        candidateCount: 0,
        deletedCount: 0,
        status: "dry-run",
      });
      return NextResponse.json({ ok: true, disabled: true, deletedCount: 0 });
    } catch (error) {
      logError("[consent-retention] Disabled run record failed", error, {
        path: "/api/cron/consent-retention",
      });
      return NextResponse.json({ error: "PURGE_RUN_RECORD_FAILED", deletedCount: 0 }, { status: 500 });
    }
  }

  const mode = process.env.CONSENT_RETENTION_PURGE_MODE ?? "dry-run";
  if (mode !== "dry-run" && mode !== "delete") {
    try {
      await recordFailure(cutoff, "INVALID_CONSENT_RETENTION_PURGE_MODE");
    } catch (error) {
      logError("[consent-retention] Invalid mode record failed", error, {
        path: "/api/cron/consent-retention",
      });
    }
    return NextResponse.json({ error: "INVALID_CONSENT_RETENTION_PURGE_MODE", deletedCount: 0 }, { status: 500 });
  }

  try {
    const result = await purgeExpiredConsentRecords({ dryRun: mode === "dry-run" });
    const status: PurgeRunStatus =
      mode === "dry-run" ? "dry-run" : result.deletedCount === result.candidateCount ? "success" : "partial";

    await recordPurgeRun({
      job: "consent-retention",
      cutoff,
      candidateCount: result.candidateCount,
      deletedCount: result.deletedCount,
      status,
    });

    return NextResponse.json({ ok: true, status, ...result });
  } catch (error) {
    try {
      await recordFailure(cutoff, "CONSENT_RETENTION_PURGE_FAILED");
    } catch (recordError) {
      logError("[consent-retention] Failed run record failed", recordError, {
        path: "/api/cron/consent-retention",
      });
    }
    logError("[consent-retention] Cron run failed", error, {
      path: "/api/cron/consent-retention",
    });
    return NextResponse.json({ error: "CONSENT_RETENTION_PURGE_FAILED", deletedCount: 0 }, { status: 500 });
  }
}

export const POST = GET;
