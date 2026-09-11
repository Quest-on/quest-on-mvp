/**
 * AI 설정 저장소 (이슈 #118)
 *
 * 저장 모델: 불변 버전 + 이동 가능한 `production` 라벨.
 *   - 읽기: 라벨이 가리키는 버전의 **sparse override 원본**을 그대로 돌려준다.
 *     effective 값은 해석 계층이 만든다 — 여기서 기본값을 물질화하지 않는다.
 *   - 쓰기: `publish_ai_config_version` RPC 한 곳뿐. service_role 도 테이블을
 *     직접 수정할 수 없으므로(019 마이그레이션) 감사 없는 변경 경로가 존재하지 않는다.
 *
 * 캐시 프로토콜(계획 옵션 3-A):
 *   key   `ai-config:label:production`
 *   value `{versionId, overrides}`
 *   TTL   45초 (무효화가 실패해도 이 시간 안에 수렴한다)
 *   miss  `SET NX EX 45` — 늦게 도착한 stale 로더가 새 값을 덮지 못한다
 *   발행  `DEL` 후 최신값 `SET EX 45`
 *
 * 캐시 실패는 DB 커밋을 되돌리지 않는다. 발행은 이미 성공했고, 전파만 늦어진다.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { logError, logWarn } from "@/lib/logger";
import {
  type SparseAiConfigOverrides,
  parseSparseOverrides,
} from "@/lib/ai-task-profile";
import type { AiConfigVersionSnapshot } from "@/lib/ai-execution-context";

const CACHE_KEY = "ai-config:label:production";
export const AI_CONFIG_CACHE_TTL_SECONDS = 45;

type RedisLike = {
  get: (key: string) => Promise<unknown>;
  set: (
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean }
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

let redisClient: RedisLike | null = null;
let redisAttempted = false;

async function getRedis(): Promise<RedisLike | null> {
  if (redisAttempted) return redisClient;
  redisAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token }) as unknown as RedisLike;
    return redisClient;
  } catch {
    return null;
  }
}

/** 테스트 전용 — 주입한 클라이언트로 캐시 경로를 검증한다. */
export function __setRedisClientForTests(client: RedisLike | null): void {
  redisClient = client;
  redisAttempted = true;
}

function decodeSnapshot(raw: unknown): AiConfigVersionSnapshot | null {
  const parsedRaw = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!parsedRaw || typeof parsedRaw !== "object") return null;

  const candidate = parsedRaw as { versionId?: unknown; overrides?: unknown };
  if (typeof candidate.versionId !== "string" || candidate.versionId === "") return null;

  try {
    return {
      versionId: candidate.versionId,
      overrides: parseSparseOverrides(candidate.overrides ?? {}),
    };
  } catch {
    // 캐시에 깨진 값이 들어 있으면 무시하고 DB 로 간다.
    return null;
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * DB 에서 production 라벨이 가리키는 버전을 읽는다.
 *
 * 임베드 조회(`select("version_id, ai_config_versions(...)")`)를 쓰지 않고 두 번
 * 나눠 읽는다. 임베드는 PostgREST 가 두 테이블 사이의 FK 관계를 스키마 캐시에서
 * 찾아낼 수 있을 때만 동작하는데, 이 테이블들은 보안상 anon/authenticated 권한을
 * 전부 회수해 둔 상태라 관계 탐지가 되지 않는다. 실제 로컬 스택에서
 * `PGRST200: Could not find a relationship` 으로 관리자 화면 전체가 500 이 되는 것을
 * 확인했다. 두 번 읽어도 이 경로는 Redis 로 45초 캐시되므로 비용이 무시할 만하고,
 * 대신 PostgREST 의 관계 추론에 의존하지 않아 훨씬 견고하다.
 */
export async function readCurrentVersionFromDb(): Promise<AiConfigVersionSnapshot> {
  const supabase = getSupabaseServer();

  const { data: label, error: labelError } = await supabase
    .from("ai_config_labels")
    .select("version_id")
    .eq("label", "production")
    .single();

  if (labelError || !label) {
    throw new Error(
      `AI_CONFIG_READ_FAILED: production label is unavailable (${labelError?.message ?? "no row"})`
    );
  }

  const versionId = (label as { version_id?: string }).version_id;
  if (!versionId) {
    throw new Error("AI_CONFIG_READ_FAILED: production label has no version id");
  }

  const { data: version, error: versionError } = await supabase
    .from("ai_config_versions")
    .select("id, profiles")
    .eq("id", versionId)
    .single();

  if (versionError || !version) {
    throw new Error(
      `AI_CONFIG_READ_FAILED: version ${versionId} is unavailable (${versionError?.message ?? "no row"})`
    );
  }

  return {
    versionId,
    overrides: parseSparseOverrides((version as { profiles?: unknown }).profiles ?? {}),
  };
}

/**
 * Redis 가 없는 환경(CI, 로컬 개발, Upstash 장애)을 위한 프로세스 내 폴백 캐시.
 *
 * 왜 필요한가: 이 로더는 채점 경로에서 문항마다 불린다. 캐시가 없으면 한 번 호출에
 * PostgREST 왕복 2회(라벨 → 버전)가 붙어서, 5문항 시험 하나에 20회 넘는 왕복이
 * 생긴다. 실제로 CI Browser E2E 가 4분대에서 12분대로 늘어나 타임아웃했다.
 *
 * 왜 Redis 가 있을 때는 쓰지 않는가: 관리자가 라벨을 옮기면 Redis DEL 로 **즉시**
 * 무효화되는 것이 이 설계의 계약이다. 프로세스 캐시를 함께 쓰면 DEL 이 다른
 * 인스턴스의 사본까지 지우지 못해 그 즉시성이 깨진다. 그래서 Redis 가 없을 때만
 * 켜고, 그때의 최대 지연은 어차피 같은 TTL(45초)로 묶는다.
 */
let memoryCache: { at: number; snapshot: AiConfigVersionSnapshot } | null = null;

/** 테스트 전용 — 프로세스 캐시를 비운다. */
export function __clearMemoryCacheForTests(): void {
  memoryCache = null;
}

/**
 * 상시 경로가 쓰는 로더. 캐시 히트면 그대로, 미스면 DB 를 읽고 `SET NX` 로 채운다.
 * `NX` 라서 발행 직후 뒤늦게 끝난 stale 로더가 새 값을 덮어쓰지 못한다.
 */
export async function loadCurrentVersion(): Promise<AiConfigVersionSnapshot> {
  const redis = await getRedis();

  if (redis) {
    try {
      const cached = decodeSnapshot(await redis.get(CACHE_KEY));
      if (cached) return cached;
    } catch (error) {
      await logWarn("AI_CONFIG_CACHE_READ_FAILED", {
        path: "lib/ai-config-store.ts",
        payload: { message: String(error) },
      });
    }
  } else if (memoryCache && Date.now() - memoryCache.at < AI_CONFIG_CACHE_TTL_SECONDS * 1000) {
    // Redis 가 없을 때만. 있으면 즉시 무효화 계약을 지키기 위해 건너뛴다.
    return memoryCache.snapshot;
  }

  const snapshot = await readCurrentVersionFromDb();

  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(snapshot), {
        ex: AI_CONFIG_CACHE_TTL_SECONDS,
        nx: true,
      });
    } catch (error) {
      await logWarn("AI_CONFIG_CACHE_FILL_FAILED", {
        path: "lib/ai-config-store.ts",
        payload: { message: String(error) },
      });
    }
  }

  if (!redis) memoryCache = { at: Date.now(), snapshot };

  return snapshot;
}

export type PublishResult = {
  previousVersionId: string | null;
  newVersionId: string;
  /** 캐시 전파가 실패했으면 사용자에게 "최대 45초 내 반영" 을 알려야 한다. */
  cacheWarning: string | null;
};

/**
 * 새 버전을 발행하고 production 라벨을 옮긴다.
 * actor 는 반드시 서버가 파생한 값이어야 한다 — 요청 페이로드에서 오면 안 된다.
 */
export async function publishVersion(params: {
  overrides: SparseAiConfigOverrides;
  actor: string;
  reason: string;
}): Promise<PublishResult> {
  // 저장 전에 한 번 더 검증한다. RPC 는 JSON 모양만 보고 의미는 모른다.
  const validated = parseSparseOverrides(params.overrides);

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("publish_ai_config_version", {
    p_profiles: validated,
    p_actor: params.actor,
    p_reason: params.reason,
  });

  if (error) {
    throw new Error(`AI_CONFIG_PUBLISH_FAILED: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const newVersionId = (row as { new_version_id?: string } | null)?.new_version_id;
  if (!newVersionId) {
    throw new Error("AI_CONFIG_PUBLISH_FAILED: RPC returned no new version id");
  }

  const snapshot: AiConfigVersionSnapshot = {
    versionId: newVersionId,
    overrides: validated,
  };

  // DB 커밋은 이미 끝났다. 여기서 실패해도 되돌리지 않고 경고만 올린다.
  const cacheWarning = await primeCache(snapshot);

  return {
    previousVersionId:
      (row as { previous_version_id?: string | null } | null)?.previous_version_id ?? null,
    newVersionId,
    cacheWarning,
  };
}

/** 무효화 후 최신값을 심는다. 실패하면 TTL 이 안전망이 된다. */
async function primeCache(snapshot: AiConfigVersionSnapshot): Promise<string | null> {
  // 발행 직후에는 프로세스 캐시부터 갱신한다. 이걸 빼면 Redis 없는 환경에서
  // 관리자가 저장해도 최대 45초 동안 자기가 방금 바꾼 값이 안 보인다.
  memoryCache = { at: Date.now(), snapshot };

  const redis = await getRedis();
  if (!redis) return null;

  try {
    await redis.del(CACHE_KEY);
    await redis.set(CACHE_KEY, JSON.stringify(snapshot), {
      ex: AI_CONFIG_CACHE_TTL_SECONDS,
    });
    return null;
  } catch (error) {
    await logError("AI_CONFIG_CACHE_INVALIDATION_FAILED", error, {
      path: "lib/ai-config-store.ts",
      additionalData: { versionId: snapshot.versionId },
    });
    return `설정은 저장됐지만 캐시 전파가 실패했습니다. 최대 ${AI_CONFIG_CACHE_TTL_SECONDS}초 내에 반영됩니다.`;
  }
}
