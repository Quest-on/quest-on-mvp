export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { recordPurgeRun, retireConsentSubject, type PurgeRunStatus } from "@/lib/consent-retention";
import {
  getFirstPolicyReleaseEffectiveAt,
  getIncompleteAccountPurgeCutoff,
  selectIncompleteAccountCandidates,
} from "@/lib/incomplete-account-purge";
import { logError } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";

const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 100;

type IncompleteAccountPurgeStatus = PurgeRunStatus;

type RunRecord = {
  cutoff: string;
  candidateCount: number;
  deletedCount: number;
  status: IncompleteAccountPurgeStatus;
  error?: string;
};

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** The PR6 wrapper's runtime contract accepts this job; its narrow legacy TS type does not. */
async function recordRun(record: RunRecord): Promise<void> {
  await recordPurgeRun({ job: "incomplete-accounts", ...record } as never);
}

async function recordFailure(cutoff: string, error: string): Promise<void> {
  await recordRun({ cutoff, candidateCount: 0, deletedCount: 0, status: "failed", error });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED", deletedCount: 0 }, { status: 401 });
  }

  const cutoff = getIncompleteAccountPurgeCutoff(new Date());
  if (process.env.INCOMPLETE_ACCOUNT_PURGE_DISABLED === "1") {
    try {
      await recordRun({ cutoff, candidateCount: 0, deletedCount: 0, status: "dry-run" });
      return NextResponse.json({ ok: true, disabled: true, deletedCount: 0 });
    } catch (error) {
      logError("[incomplete-account-purge] Disabled run record failed", error, {
        path: "/api/cron/purge-incomplete-accounts",
      });
      return NextResponse.json({ error: "PURGE_RUN_RECORD_FAILED", deletedCount: 0 }, { status: 500 });
    }
  }

  const mode = process.env.INCOMPLETE_ACCOUNT_PURGE_MODE ?? "dry-run";
  if (mode !== "dry-run" && mode !== "delete") {
    try {
      await recordFailure(cutoff, "INVALID_INCOMPLETE_ACCOUNT_PURGE_MODE");
    } catch (error) {
      logError("[incomplete-account-purge] Invalid mode record failed", error, {
        path: "/api/cron/purge-incomplete-accounts",
      });
    }
    return NextResponse.json({ error: "INVALID_INCOMPLETE_ACCOUNT_PURGE_MODE", deletedCount: 0 }, { status: 500 });
  }

  try {
    const firstPolicyReleaseEffectiveAt = await getFirstPolicyReleaseEffectiveAt();
    if (!firstPolicyReleaseEffectiveAt) {
      const status: IncompleteAccountPurgeStatus = mode === "dry-run" ? "dry-run" : "success";
      await recordRun({ cutoff, candidateCount: 0, deletedCount: 0, status });
      return NextResponse.json({ ok: true, status, candidateCount: 0, deletedCount: 0 });
    }

    const supabase = getSupabaseServer();
    let candidateCount = 0;
    let deletedCount = 0;
    let status: IncompleteAccountPurgeStatus = mode === "dry-run" ? "dry-run" : "success";

    for (let page = 1; page <= MAX_PAGES_PER_RUN; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) throw error;

      const users = (data?.users ?? []).map(({ id, created_at }) => ({ id, created_at }));
      const candidates = await selectIncompleteAccountCandidates({
        users,
        cutoff,
        firstPolicyReleaseEffectiveAt,
      });
      candidateCount += candidates.length;

      if (mode === "delete") {
        for (const candidate of candidates) {
          const { error: deleteError } = await supabase.auth.admin.deleteUser(candidate.id);
          if (deleteError) {
            status = "partial";
            break;
          }

          deletedCount += 1;
          try {
            await retireConsentSubject(candidate.id);
          } catch {
            status = "partial";
            break;
          }
        }
      }

      if (status === "partial" || users.length < PAGE_SIZE) break;
    }

    await recordRun({ cutoff, candidateCount, deletedCount, status });
    return NextResponse.json({ ok: status !== "partial", status, candidateCount, deletedCount });
  } catch (error) {
    try {
      await recordFailure(cutoff, "INCOMPLETE_ACCOUNT_PURGE_FAILED");
    } catch (recordError) {
      logError("[incomplete-account-purge] Failed run record failed", recordError, {
        path: "/api/cron/purge-incomplete-accounts",
      });
    }
    logError("[incomplete-account-purge] Cron run failed", error, {
      path: "/api/cron/purge-incomplete-accounts",
    });
    return NextResponse.json({ error: "INCOMPLETE_ACCOUNT_PURGE_FAILED", deletedCount: 0 }, { status: 500 });
  }
}

export const POST = GET;
