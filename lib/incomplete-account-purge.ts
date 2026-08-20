import { evaluateConsentGate } from "@/lib/consent-gate";
import { getSupabaseServer } from "@/lib/supabase-server";

export interface AuthAccountCandidate {
  id: string;
  created_at: string;
}

/** Exactly seven 24-hour periods before the run starts; accounts on the boundary are eligible. */
export function getIncompleteAccountPurgeCutoff(now: Date): string {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Returns the earliest policy release. A missing release is intentionally
 * indistinguishable from an unavailable one to callers: both must purge nobody.
 */
export async function getFirstPolicyReleaseEffectiveAt(): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseServer()
      .from("consent_policy_releases")
      .select("effective_at")
      .order("effective_at", { ascending: true })
      .limit(1);

    if (error) return null;
    return data?.[0]?.effective_at ?? null;
  } catch {
    return null;
  }
}

/**
 * Selects one bounded auth-admin page. The policy-release guard prevents
 * pre-consent existing accounts from ever being treated as abandoned onboarding.
 */
export async function selectIncompleteAccountCandidates({
  users,
  cutoff,
  firstPolicyReleaseEffectiveAt,
  evaluateGate = evaluateConsentGate,
}: {
  users: readonly AuthAccountCandidate[];
  cutoff: string;
  firstPolicyReleaseEffectiveAt: string | null;
  evaluateGate?: typeof evaluateConsentGate;
}): Promise<AuthAccountCandidate[]> {
  if (!firstPolicyReleaseEffectiveAt) return [];

  const cutoffTime = Date.parse(cutoff);
  const firstReleaseTime = Date.parse(firstPolicyReleaseEffectiveAt);
  if (!Number.isFinite(cutoffTime) || !Number.isFinite(firstReleaseTime)) return [];

  const candidates: AuthAccountCandidate[] = [];
  for (const user of users) {
    const createdAt = Date.parse(user.created_at);
    if (!Number.isFinite(createdAt) || createdAt > cutoffTime || createdAt < firstReleaseTime) {
      continue;
    }

    if (!(await evaluateGate(user.id)).complete) candidates.push(user);
  }

  return candidates;
}
