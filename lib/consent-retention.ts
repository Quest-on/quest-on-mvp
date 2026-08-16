import { getSupabaseServer } from "@/lib/supabase-server";

export type PurgeRunStatus = "dry-run" | "success" | "partial" | "failed";

export type PurgeRunInput = {
  job: "consent-retention";
  cutoff: string;
  candidateCount: number;
  deletedCount: number;
  status: PurgeRunStatus;
  error?: string | null;
};

/**
 * Retire the identity-to-pseudonym mapping after an account has been deleted.
 * The consent ledger remains intact until the database retention deadline.
 */
export async function retireConsentSubject(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer().rpc("retire_consent_subject", {
    p_user_id: userId,
  });

  if (error) throw error;
  return data === true;
}

/**
 * The three-year boundary is enforced by the database with `interval '3 years'`.
 * The application must not calculate it with a day count such as 1095, which is
 * incorrect across leap years.
 */
export async function purgeExpiredConsentRecords({
  dryRun = true,
  limit = 500,
}: {
  dryRun?: boolean;
  limit?: number;
} = {}): Promise<{ candidateCount: number; deletedCount: number }> {
  const { data, error } = await getSupabaseServer().rpc("purge_expired_consent_records", {
    p_dry_run: dryRun,
    p_limit: limit,
  });

  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    candidateCount: Number(result?.candidate_count ?? 0),
    deletedCount: Number(result?.deleted_count ?? 0),
  };
}

/** Records aggregate operational evidence only; identifiers must never enter this log. */
export async function recordPurgeRun(input: PurgeRunInput): Promise<void> {
  const { error } = await getSupabaseServer().from("consent_purge_runs").insert({
    job: input.job,
    cutoff: input.cutoff,
    candidate_count: input.candidateCount,
    deleted_count: input.deletedCount,
    status: input.status,
    error: input.error ?? null,
  });

  if (error) throw error;
}
