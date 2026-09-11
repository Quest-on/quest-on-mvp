import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ rpc, from }) }));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(async () => {}),
  logWarn: vi.fn(async () => {}),
  logInfo: vi.fn(async () => {}),
}));

import {
  AI_CONFIG_CACHE_TTL_SECONDS,
  __clearMemoryCacheForTests,
  __setRedisClientForTests,
  loadCurrentVersion,
  publishVersion,
  readCurrentVersionFromDb,
} from "@/lib/ai-config-store";

const VERSION_A = "11111111-1111-4111-8111-111111111111";
const VERSION_B = "22222222-2222-4222-8222-222222222222";

/**
 * production 라벨 조회를 흉내낸다.
 *
 * 저장소는 임베드 조회를 쓰지 않고 라벨 → 버전 순으로 **두 번** 읽는다.
 * PostgREST 가 권한을 회수한 테이블 사이의 FK 관계를 스키마 캐시에서 찾지 못해
 * 임베드가 PGRST200 으로 실패하기 때문이다(로컬 스택에서 재현했다).
 */
function mockLabelRow(versionId: string, profiles: unknown) {
  from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () =>
          table === "ai_config_labels"
            ? { data: { version_id: versionId }, error: null }
            : { data: { id: versionId, profiles }, error: null },
      }),
    }),
  }));
}

type RedisCall = { op: string; key: string; value?: string; opts?: unknown };

function makeRedis(initial: string | null = null) {
  const calls: RedisCall[] = [];
  let store: string | null = initial;
  return {
    calls,
    client: {
      get: async (key: string) => {
        calls.push({ op: "get", key });
        return store;
      },
      set: async (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => {
        calls.push({ op: "set", key, value, opts });
        if (opts?.nx && store !== null) return null; // NX: 이미 있으면 덮지 않는다
        store = value;
        return "OK";
      },
      del: async (key: string) => {
        calls.push({ op: "del", key });
        store = null;
        return 1;
      },
    },
    peek: () => store,
  };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  __setRedisClientForTests(null);
  __clearMemoryCacheForTests();
});

describe("readCurrentVersionFromDb", () => {
  it("returns the sparse overrides exactly as stored", async () => {
    mockLabelRow(VERSION_A, { bulk_grading_worker: { temperature: null, maxRetries: 1 } });

    const snapshot = await readCurrentVersionFromDb();

    expect(snapshot.versionId).toBe(VERSION_A);
    // 명시적 null 은 "상속을 끈다"는 뜻이라 반드시 보존돼야 한다.
    expect(snapshot.overrides.bulk_grading_worker?.temperature).toBeNull();
    expect(snapshot.overrides.bulk_grading_worker?.maxRetries).toBe(1);
    // 저장되지 않은 태스크는 키 자체가 없어야 한다(=상속).
    expect(snapshot.overrides.auto_grading_summary).toBeUndefined();
  });

  it("treats a bootstrap empty object as no overrides", async () => {
    mockLabelRow(VERSION_A, {});
    const snapshot = await readCurrentVersionFromDb();
    expect(snapshot.overrides).toEqual({});
  });

  it("fails loudly when the production label is missing", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: { message: "no rows" } }) }),
      }),
    });
    await expect(readCurrentVersionFromDb()).rejects.toThrow(/AI_CONFIG_READ_FAILED/);
  });
});

describe("loadCurrentVersion — cache protocol", () => {
  it("serves a cache hit without touching the database", async () => {
    const redis = makeRedis(JSON.stringify({ versionId: VERSION_A, overrides: {} }));
    __setRedisClientForTests(redis.client);

    const snapshot = await loadCurrentVersion();

    expect(snapshot.versionId).toBe(VERSION_A);
    expect(from).not.toHaveBeenCalled();
  });

  it("fills the cache with NX and a 45s TTL on a miss", async () => {
    const redis = makeRedis(null);
    __setRedisClientForTests(redis.client);
    mockLabelRow(VERSION_A, {});

    await loadCurrentVersion();

    const set = redis.calls.find((c) => c.op === "set");
    expect(set?.opts).toMatchObject({ ex: AI_CONFIG_CACHE_TTL_SECONDS, nx: true });
  });

  it("does not let a stale loader overwrite a freshly published value", async () => {
    // 발행이 먼저 최신값을 심었고, 뒤늦게 끝난 로더가 NX 로 쓰려다 실패해야 한다.
    const redis = makeRedis(JSON.stringify({ versionId: VERSION_B, overrides: {} }));
    __setRedisClientForTests(redis.client);

    await redis.client.set(
      "ai-config:label:production",
      JSON.stringify({ versionId: VERSION_A, overrides: {} }),
      { ex: AI_CONFIG_CACHE_TTL_SECONDS, nx: true }
    );

    expect(JSON.parse(redis.peek() as string).versionId).toBe(VERSION_B);
  });

  it("falls back to the database when the cache read throws", async () => {
    __setRedisClientForTests({
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => "OK",
      del: async () => 1,
    });
    mockLabelRow(VERSION_A, {});

    const snapshot = await loadCurrentVersion();
    expect(snapshot.versionId).toBe(VERSION_A);
  });

  it("ignores a corrupted cache entry instead of serving it", async () => {
    const redis = makeRedis("{not json");
    __setRedisClientForTests(redis.client);
    mockLabelRow(VERSION_A, {});

    const snapshot = await loadCurrentVersion();
    expect(snapshot.versionId).toBe(VERSION_A);
    expect(from).toHaveBeenCalled();
  });

  it("works with no Redis configured at all", async () => {
    __setRedisClientForTests(null);
    mockLabelRow(VERSION_A, {});
    await expect(loadCurrentVersion()).resolves.toMatchObject({ versionId: VERSION_A });
  });
});

describe("publishVersion", () => {
  it("validates before writing and passes a server-derived actor to the RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ previous_version_id: VERSION_A, new_version_id: VERSION_B }],
      error: null,
    });

    const result = await publishVersion({
      overrides: { bulk_grading_worker: { maxRetries: 1 } },
      actor: "admin:alice",
      reason: "lower retries for the worker",
    });

    expect(rpc).toHaveBeenCalledWith("publish_ai_config_version", {
      p_profiles: { bulk_grading_worker: { maxRetries: 1 } },
      p_actor: "admin:alice",
      p_reason: "lower retries for the worker",
    });
    expect(result).toMatchObject({
      previousVersionId: VERSION_A,
      newVersionId: VERSION_B,
      cacheWarning: null,
    });
  });

  it("refuses an invalid override before any RPC call", async () => {
    await expect(
      publishVersion({
        overrides: { bulk_grading_worker: { maxRetries: 9 } },
        actor: "admin:alice",
        reason: "too many retries",
      })
    ).rejects.toThrow(/maxRetries/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("invalidates then primes the cache after a successful publish", async () => {
    const redis = makeRedis(JSON.stringify({ versionId: VERSION_A, overrides: {} }));
    __setRedisClientForTests(redis.client);
    rpc.mockResolvedValue({
      data: [{ previous_version_id: VERSION_A, new_version_id: VERSION_B }],
      error: null,
    });

    await publishVersion({ overrides: {}, actor: "admin:alice", reason: "reset" });

    const ops = redis.calls.map((c) => c.op);
    expect(ops).toContain("del");
    expect(ops.indexOf("del")).toBeLessThan(ops.lastIndexOf("set"));
    expect(JSON.parse(redis.peek() as string).versionId).toBe(VERSION_B);
  });

  it("keeps the committed publish and only warns when cache propagation fails", async () => {
    __setRedisClientForTests({
      get: async () => null,
      set: async () => {
        throw new Error("redis down");
      },
      del: async () => {
        throw new Error("redis down");
      },
    });
    rpc.mockResolvedValue({
      data: [{ previous_version_id: null, new_version_id: VERSION_B }],
      error: null,
    });

    const result = await publishVersion({ overrides: {}, actor: "admin:alice", reason: "x" });

    // 발행은 성공으로 남는다 — 캐시 실패가 DB 커밋을 되돌리지 않는다.
    expect(result.newVersionId).toBe(VERSION_B);
    expect(result.cacheWarning).toMatch(/45/);
  });

  it("surfaces an RPC denial instead of pretending it succeeded", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(
      publishVersion({ overrides: {}, actor: "anon", reason: "x" })
    ).rejects.toThrow(/AI_CONFIG_PUBLISH_FAILED/);
  });
});

describe("Redis 가 없을 때의 프로세스 폴백 캐시", () => {
  it("두 번째 호출은 DB 를 다시 치지 않는다", async () => {
    // 이게 없으면 채점 경로가 문항마다 PostgREST 왕복 2회를 낸다.
    // 실제로 CI Browser E2E 가 4분대에서 12분대로 늘어나 타임아웃했다.
    __setRedisClientForTests(null);
    mockLabelRow(VERSION_A, {});

    await loadCurrentVersion();
    const afterFirst = from.mock.calls.length;
    await loadCurrentVersion();

    expect(afterFirst).toBeGreaterThan(0);
    expect(from.mock.calls.length).toBe(afterFirst);
  });

  it("발행하면 프로세스 캐시가 즉시 새 버전을 돌려준다", async () => {
    __setRedisClientForTests(null);
    mockLabelRow(VERSION_A, {});
    expect((await loadCurrentVersion()).versionId).toBe(VERSION_A);

    rpc.mockResolvedValue({
      data: [{ previous_version_id: VERSION_A, new_version_id: VERSION_B }],
      error: null,
    });
    await publishVersion({ overrides: {}, actor: "admin:a", reason: "r" });

    // 갱신하지 않으면 관리자가 방금 바꾼 값을 최대 45초 동안 못 본다.
    expect((await loadCurrentVersion()).versionId).toBe(VERSION_B);
  });

  it("Redis 가 있으면 프로세스 캐시를 쓰지 않는다 (즉시 무효화 계약 보존)", async () => {
    const redis = makeRedis(null);
    __setRedisClientForTests(redis.client);
    mockLabelRow(VERSION_A, {});

    await loadCurrentVersion();
    await loadCurrentVersion();

    // 두 번 다 Redis 를 조회해야 한다. 프로세스 캐시가 끼면 라벨 이동이
    // 다른 인스턴스에 즉시 전파되지 않는다.
    expect(redis.calls.filter((c) => c.op === "get").length).toBe(2);
  });
});
