import { getSupabaseServer } from "@/lib/supabase-server";
import { deriveSubjectRef } from "@/lib/consent-subject-ref";

/**
 * 동의 원장 기록·조회.
 *
 * 불변식:
 *   · append-only — 철회도 UPDATE 가 아니라 `granted=false` 새 행이다
 *   · `controller_type` 은 서버 상수 'platform'. 클라이언트가 지정할 수 없다
 *   · 원장에 `user_id` 를 쓰지 않는다. `subject_ref` 만 쓴다
 *   · 미설정("아직 안 물어봄")과 명시적 거부("granted=false")를 구분한다
 *     → 자동 백필 금지가 여기서 성립한다. 안 받은 동의를 false 행으로 채우지 않는다
 *
 * DB 쪽에도 같은 불변식이 trigger 로 걸려 있다(019). 앱이 실수해도 원장은 안전하다.
 */

/** 서버가 고정하는 처리자 유형. 현재 Quest-On 단일 처리자다. */
export const CONTROLLER_TYPE = "platform" as const;

/** 필수 동의 키. 온보딩 게이트가 이 둘을 요구한다. */
export const REQUIRED_CONSENT_KEYS = ["age_over_14", "terms"] as const;

/** 선택 동의 키. 가입 흐름에서 받지 않고 이후 설정·재사용 직전에 받는다. */
export const OPTIONAL_CONSENT_KEYS = [
  "marketing",
  "ads_receive",
  "ai_training",
] as const;

export const ALL_CONSENT_KEYS = [
  ...REQUIRED_CONSENT_KEYS,
  ...OPTIONAL_CONSENT_KEYS,
] as const;

export type ConsentKey = (typeof ALL_CONSENT_KEYS)[number];

export function isConsentKey(value: string): value is ConsentKey {
  return (ALL_CONSENT_KEYS as readonly string[]).includes(value);
}

/** 한 건의 동의 결정. */
export interface ConsentDecisionInput {
  consentKey: ConsentKey;
  granted: boolean;
}

/** 조회 결과. `unset` 은 "아직 묻지 않았다" 이며 거부와 다르다. */
export type ConsentDecision =
  | { state: "unset" }
  | { state: "recorded"; granted: boolean; policyVersion: string; recordedAt: string };

export class ConsentRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentRecordError";
  }
}

/**
 * 매핑을 등록하고 subject_ref 를 돌려준다.
 *
 * 앱은 `consent_subject_map` 에 직접 쓰지 못한다(019 에서 권한 회수).
 * insert-once RPC 만 통과한다. 이미 다른 값이 등록돼 있으면 RPC 가 실패하는데,
 * 그건 HMAC 키가 바뀌었다는 뜻이라 조용히 넘기면 원장이 둘로 갈라진다.
 */
async function ensureSubjectRef(userId: string): Promise<string> {
  const subjectRef = deriveSubjectRef(userId);
  const supabase = getSupabaseServer();

  const { data, error } = await supabase.rpc("register_consent_subject", {
    p_user_id: userId,
    p_subject_ref: subjectRef,
  });

  if (error) {
    throw new ConsentRecordError(`동의 주체 매핑 등록에 실패했다: ${error.message}`);
  }

  if (typeof data === "string" && data !== subjectRef) {
    throw new ConsentRecordError("동의 주체 매핑이 현재 파생값과 일치하지 않는다.");
  }

  return subjectRef;
}

/**
 * 동의 결정들을 **한 번의 배열 INSERT** 로 기록한다.
 *
 * 여러 번 나눠 쓰면 일부만 저장된 채 실패하는 부분 성공이 생긴다.
 * 필수 2건 중 하나만 남으면 게이트가 영원히 막힌다.
 */
export async function recordConsentDecisions(
  userId: string,
  decisions: readonly ConsentDecisionInput[],
  policyVersion: string,
): Promise<{ subjectRef: string; insertedCount: number }> {
  if (decisions.length === 0) {
    throw new ConsentRecordError("기록할 동의 결정이 없다.");
  }

  const subjectRef = await ensureSubjectRef(userId);

  const rows = decisions.map((decision) => ({
    subject_ref: subjectRef,
    controller_type: CONTROLLER_TYPE,
    consent_key: decision.consentKey,
    granted: decision.granted,
    policy_version: policyVersion,
  }));

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("consent_records")
    .insert(rows)
    .select("id");

  if (error) {
    // 실패를 성공처럼 처리하지 않는다. 호출자가 비-2xx 를 내야 한다.
    throw new ConsentRecordError(`동의 기록에 실패했다: ${error.message}`);
  }

  return { subjectRef, insertedCount: data?.length ?? 0 };
}

/**
 * 철회. UPDATE 가 아니라 `granted=false` 새 행을 쌓는다.
 * 원본 행은 손대지 않으므로 "언제 동의했고 언제 철회했나" 가 남는다.
 */
export async function revokeConsent(
  userId: string,
  consentKey: ConsentKey,
  policyVersion: string,
): Promise<void> {
  await recordConsentDecisions(userId, [{ consentKey, granted: false }], policyVersion);
}

/**
 * 특정 키의 최신 결정을 읽는다.
 *
 * 행이 하나도 없으면 `unset` 이다. 이건 거부가 아니라 "아직 묻지 않았다" 이며,
 * 선택 동의를 `granted=false` 로 미리 채워두지 않기 때문에 생기는 정상 상태다.
 */
export async function getLatestConsentDecision(
  userId: string,
  consentKey: ConsentKey,
): Promise<ConsentDecision> {
  const subjectRef = deriveSubjectRef(userId);
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("consent_records")
    .select("granted, policy_version, recorded_at")
    .eq("subject_ref", subjectRef)
    .eq("consent_key", consentKey)
    .order("recorded_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new ConsentRecordError(`동의 조회에 실패했다: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    return { state: "unset" };
  }

  return {
    state: "recorded",
    granted: row.granted,
    policyVersion: row.policy_version,
    recordedAt: row.recorded_at,
  };
}

/**
 * 여러 키의 최신 결정을 한 번에 읽는다. 게이트가 매 요청 쓰므로 왕복을 줄인다.
 * 반환 맵에 없는 키는 `unset` 이다.
 */
export async function getLatestConsentDecisions(
  userId: string,
  consentKeys: readonly ConsentKey[],
): Promise<Map<ConsentKey, ConsentDecision>> {
  const result = new Map<ConsentKey, ConsentDecision>();
  for (const key of consentKeys) {
    result.set(key, { state: "unset" });
  }

  if (consentKeys.length === 0) return result;

  const subjectRef = deriveSubjectRef(userId);
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("consent_records")
    .select("consent_key, granted, policy_version, recorded_at")
    .eq("subject_ref", subjectRef)
    .in("consent_key", consentKeys as unknown as string[])
    .order("recorded_at", { ascending: false });

  if (error) {
    throw new ConsentRecordError(`동의 조회에 실패했다: ${error.message}`);
  }

  // recorded_at DESC 로 정렬돼 있으므로 키별 첫 행이 최신이다.
  // 과거 true 뒤 최신 false 면 false 가 이긴다.
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (seen.has(row.consent_key)) continue;
    seen.add(row.consent_key);

    if (!isConsentKey(row.consent_key)) continue;
    result.set(row.consent_key, {
      state: "recorded",
      granted: row.granted,
      policyVersion: row.policy_version,
      recordedAt: row.recorded_at,
    });
  }

  return result;
}
