import { getSupabaseServer } from "@/lib/supabase-server";
import {
  REQUIRED_CONSENT_KEYS,
  getLatestConsentDecisions,
  type ConsentKey,
} from "@/lib/consent-records";

/**
 * 서버 권위 동의 게이트 판정.
 *
 * 판정 규칙:
 *   1. `current release` = `effective_at <= now()` 중 가장 최신
 *   2. `acceptance floor` = 그 범위에서 `requires_reconsent = true` 인 가장 최신 릴리스
 *   3. 필수 키마다 **floor 이후에 기록된** 최신 결정을 본다
 *   4. 그 결정이 `granted = true` 여야 통과. 하나라도 아니면 미완료
 *
 * floor 를 쓰는 이유: 문구를 고쳤는데 재동의 트리거가 없으면 기존 사용자가
 * 아무 고지 없이 통과한다. `requires_reconsent = false` 인 릴리스는 floor 를
 * 올리지 않으므로 오탈자 수정 같은 변경이 전원 재온보딩을 유발하지 않는다.
 *
 * 조회 실패는 fail-closed 다. 알 수 없으면 통과시키지 않는다.
 */

export interface PolicyRelease {
  releaseId: string;
  contentHash: string;
  effectiveAt: string;
  requiresReconsent: boolean;
}

export type ConsentGateResult =
  | { complete: true; currentRelease: PolicyRelease }
  | {
      complete: false;
      reason: "no_active_release" | "missing" | "latest_false" | "stale_release" | "query_error";
      currentRelease: PolicyRelease | null;
      missingKeys: ConsentKey[];
    };

export class ConsentGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentGateError";
  }
}

/** 지금 시점에 유효한 최신 릴리스. 없으면 null. */
export async function getCurrentPolicyRelease(): Promise<PolicyRelease | null> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("consent_policy_releases")
    .select("release_id, content_hash, effective_at, requires_reconsent")
    .lte("effective_at", new Date().toISOString())
    .order("effective_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new ConsentGateError(`정책 릴리스 조회에 실패했다: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    releaseId: row.release_id,
    contentHash: row.content_hash,
    effectiveAt: row.effective_at,
    requiresReconsent: row.requires_reconsent,
  };
}

/**
 * 수락 기준선. 이 시각 이전에 받은 동의는 무효로 본다.
 * `requires_reconsent = true` 인 릴리스가 하나도 없으면 null 이고,
 * 그때는 시각 조건 없이 최신 결정만 본다.
 */
export async function getAcceptanceFloor(): Promise<string | null> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("consent_policy_releases")
    .select("effective_at")
    .lte("effective_at", new Date().toISOString())
    .eq("requires_reconsent", true)
    .order("effective_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new ConsentGateError(`수락 기준선 조회에 실패했다: ${error.message}`);
  }

  return data?.[0]?.effective_at ?? null;
}

/**
 * 필수 동의 완료 여부를 판정한다.
 *
 * 어떤 이유로든 판정할 수 없으면 `complete: false` 다. 조회 오류에 통과를
 * 주면 게이트가 있으나 마나가 된다.
 */
export async function evaluateConsentGate(userId: string): Promise<ConsentGateResult> {
  let currentRelease: PolicyRelease | null;
  let floor: string | null;

  try {
    currentRelease = await getCurrentPolicyRelease();
    floor = await getAcceptanceFloor();
  } catch {
    return {
      complete: false,
      reason: "query_error",
      currentRelease: null,
      missingKeys: [...REQUIRED_CONSENT_KEYS],
    };
  }

  if (!currentRelease) {
    // 최초 릴리스 seed(020) 가 아직 적용되지 않았다.
    return {
      complete: false,
      reason: "no_active_release",
      currentRelease: null,
      missingKeys: [...REQUIRED_CONSENT_KEYS],
    };
  }

  let decisions: Awaited<ReturnType<typeof getLatestConsentDecisions>>;
  try {
    decisions = await getLatestConsentDecisions(userId, REQUIRED_CONSENT_KEYS);
  } catch {
    return {
      complete: false,
      reason: "query_error",
      currentRelease,
      missingKeys: [...REQUIRED_CONSENT_KEYS],
    };
  }

  const missingKeys: ConsentKey[] = [];
  let sawStale = false;
  let sawExplicitFalse = false;

  for (const key of REQUIRED_CONSENT_KEYS) {
    const decision = decisions.get(key) ?? { state: "unset" as const };

    if (decision.state === "unset") {
      missingKeys.push(key);
      continue;
    }

    // floor 이전 동의는 옛 문구에 대한 동의라 현재 릴리스를 수락한 게 아니다.
    if (floor && decision.recordedAt < floor) {
      missingKeys.push(key);
      sawStale = true;
      continue;
    }

    // 최신 결정이 거부면 거부가 이긴다. 과거에 true 였어도 마찬가지다.
    if (!decision.granted) {
      missingKeys.push(key);
      sawExplicitFalse = true;
    }
  }

  if (missingKeys.length === 0) {
    return { complete: true, currentRelease };
  }

  // 여러 사유가 겹치면 더 구체적인 쪽을 남긴다.
  const reason = sawExplicitFalse ? "latest_false" : sawStale ? "stale_release" : "missing";

  return { complete: false, reason, currentRelease, missingKeys };
}
