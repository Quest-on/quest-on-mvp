/**
 * 환경 타깃 가드 (env-target guard)
 *
 * 모든 Supabase write 경로(runtime service-role client, browser client,
 * mutating scripts)가 "지금 붙은 프로젝트가 의도한 환경이 맞는지"를
 * fail-closed로 검증하기 위한 공통 모듈.
 *
 * 핵심 규칙:
 *  - URL ref ↔ service-role/anon JWT ref ↔ DATABASE_URL ref 가 서로 다르면 즉시 throw.
 *  - EXPECTED_SUPABASE_REF(server) / NEXT_PUBLIC_EXPECTED_SUPABASE_REF(client) 가
 *    설정되어 있는데 실제 ref 와 다르면 즉시 throw.
 *  - EXPECTED 가 아직 설정 안 됐으면(롤아웃 전 전환 구간) throw 하지 않고 1회 경고만 한다
 *    → 기존 배포를 깨지 않으면서 env 프로비저닝 이후 enforce 로 전환.
 *  - TARGET_ENV=local 은 명시적 예외.
 *
 * 스크립트용: assertStagingTarget / assertNotProd 로 prod 오작동을 강제 차단.
 */

export type GuardContext = "server" | "client" | "script";

const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[env-target] ${message}`);
}

/** `https://<ref>.supabase.co` → `<ref>` */
export function extractSupabaseRef(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|in|net)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Supabase JWT payload 의 `ref` claim 추출 (실패 시 null) */
export function decodeJwtRef(jwt: string | undefined | null): string | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: string };
    return typeof payload.ref === "string" ? payload.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * DATABASE_URL 에서 Supabase project ref 추출.
 * - direct: `db.<ref>.supabase.co`
 * - pooler: user `postgres.<ref>@...pooler.supabase.com`
 */
export function extractDatabaseRef(databaseUrl: string | undefined | null): string | null {
  if (!databaseUrl) return null;
  const direct = databaseUrl.match(/@db\.([a-z0-9]+)\.supabase\.(co|in|net)/i);
  if (direct) return direct[1].toLowerCase();
  const poolerUser = databaseUrl.match(/\/\/postgres\.([a-z0-9]+):/i);
  if (poolerUser) return poolerUser[1].toLowerCase();
  return null;
}

export interface AssertTargetArgs {
  url: string | undefined | null;
  serviceRoleKey?: string | null;
  anonKey?: string | null;
  databaseUrl?: string | null;
  context: GuardContext;
  /** 명시적 기대 ref (스크립트에서 직접 지정). 없으면 env 에서 해석. */
  expectedRef?: string | null;
}

function resolveExpectedRef(context: GuardContext, explicit?: string | null): string | null {
  if (explicit) return explicit.toLowerCase();
  if (context === "client") {
    const v = process.env.NEXT_PUBLIC_EXPECTED_SUPABASE_REF;
    return v ? v.toLowerCase() : null;
  }
  const v =
    process.env.EXPECTED_SUPABASE_REF ||
    process.env.NEXT_PUBLIC_EXPECTED_SUPABASE_REF;
  return v ? v.toLowerCase() : null;
}

/**
 * 현재 붙은 Supabase 타깃이 의도한 환경인지 검증한다. 불일치면 throw.
 */
export function assertSupabaseTarget(args: AssertTargetArgs): void {
  const { url, serviceRoleKey, anonKey, databaseUrl, context } = args;
  const actualRef = extractSupabaseRef(url);

  // URL 자체가 없으면 호출자(누락 처리)에게 위임.
  if (!actualRef) return;

  // 1) URL ref ↔ key ref ↔ DB ref 교차 검증
  const keyRef = decodeJwtRef(serviceRoleKey);
  if (keyRef && keyRef !== actualRef) {
    throw new Error(
      `[env-target] Supabase URL ref(${actualRef})와 service-role 키 ref(${keyRef})가 다릅니다. 환경 혼선 가능성 — 즉시 중단합니다.`
    );
  }
  const anonRef = decodeJwtRef(anonKey);
  if (anonRef && anonRef !== actualRef) {
    throw new Error(
      `[env-target] Supabase URL ref(${actualRef})와 anon 키 ref(${anonRef})가 다릅니다. 환경 혼선 가능성 — 즉시 중단합니다.`
    );
  }
  const dbRef = extractDatabaseRef(databaseUrl);
  if (dbRef && dbRef !== actualRef) {
    throw new Error(
      `[env-target] Supabase URL ref(${actualRef})와 DATABASE_URL ref(${dbRef})가 다릅니다. 환경 혼선 가능성 — 즉시 중단합니다.`
    );
  }

  // 2) 기대 ref 와 비교 (설정된 경우 fail-closed)
  const expected = resolveExpectedRef(context, args.expectedRef);
  const targetEnv = process.env.TARGET_ENV?.toLowerCase();

  if (expected) {
    if (expected !== actualRef) {
      throw new Error(
        `[env-target] 기대 Supabase ref(${expected})와 실제 ref(${actualRef})가 다릅니다 (TARGET_ENV=${targetEnv ?? "unset"}, context=${context}). 잘못된 환경 접속을 차단합니다.`
      );
    }
    return;
  }

  // 3) 기대 ref 미설정 — 전환 구간
  if (targetEnv === "local") return;
  warnOnce(
    `${context}:${actualRef}`,
    `EXPECTED_SUPABASE_REF 미설정(context=${context}, ref=${actualRef}). 환경 프로비저닝 후 EXPECTED_SUPABASE_REF / NEXT_PUBLIC_EXPECTED_SUPABASE_REF 를 설정하면 fail-closed 로 강제됩니다.`
  );
}

/** 스크립트용: 실제 ref 가 prod denylist 에 있으면 throw */
export function assertNotProd(
  url: string | undefined | null,
  prodRefDenylist: string[]
): void {
  const actualRef = extractSupabaseRef(url);
  if (!actualRef) {
    throw new Error("[env-target] Supabase URL 이 없어 환경 타깃을 검증할 수 없습니다.");
  }
  const deny = prodRefDenylist.map((r) => r.toLowerCase());
  if (deny.includes(actualRef)) {
    throw new Error(
      `[env-target] 대상 ref(${actualRef})가 prod denylist 에 있습니다. staging 전용 작업이 prod 를 가리키고 있어 중단합니다.`
    );
  }
}

/** 스크립트용: 실제 ref 가 confirmRef 와 정확히 일치하지 않으면 throw */
export function assertStagingTarget(
  url: string | undefined | null,
  confirmRef: string
): void {
  const actualRef = extractSupabaseRef(url);
  if (!actualRef) {
    throw new Error("[env-target] Supabase URL 이 없어 staging 타깃을 검증할 수 없습니다.");
  }
  if (actualRef !== confirmRef.toLowerCase()) {
    throw new Error(
      `[env-target] staging 확인 ref(${confirmRef.toLowerCase()})와 실제 ref(${actualRef})가 다릅니다. 잘못된 프로젝트 접속을 차단합니다.`
    );
  }
}
