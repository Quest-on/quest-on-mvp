/**
 * Rate limiter with Upstash Redis support for Vercel serverless.
 *
 * - When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set → uses Upstash Redis
 *   (works across all serverless instances, shared state)
 * - Otherwise → falls back to in-memory Map (fine for local dev / single instance)
 */

export type RateLimitConfig = {
  /** Maximum number of requests in the window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

// ============================================================
// In-memory fallback (local dev / single instance)
// ============================================================

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

/** Maximum number of keys in the in-memory store to prevent unbounded growth in serverless */
const MAX_STORE_SIZE = 10_000;

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/** Evict oldest entries when store exceeds MAX_STORE_SIZE */
function evictIfNeeded() {
  if (store.size <= MAX_STORE_SIZE) return;

  // Evict entries with earliest resetAt first (most likely expired or expiring soon)
  const entries = Array.from(store.entries())
    .sort((a, b) => a[1].resetAt - b[1].resetAt);

  const toEvict = entries.slice(0, store.size - MAX_STORE_SIZE + Math.floor(MAX_STORE_SIZE * 0.1));
  for (const [key] of toEvict) {
    store.delete(key);
  }
}

function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowSec * 1000;
    store.set(key, { count: 1, resetAt });
    evictIfNeeded();
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// ============================================================
// Upstash Redis rate limiter (serverless-safe)
// ============================================================

/**
 * **버킷(config)별로** limiter 를 캐시한다 (이슈 #457).
 *
 * 예전에는 모듈 전역 플래그 하나로 limiter 를 **한 번만** 만들었다. 주석은
 * "once per config change" 라고 말했지만 코드는 config 를 키로 쓰지 않아서,
 * 한 인스턴스에서 **먼저 초기화한 버킷의 한도가 나머지 전부에 적용**됐다.
 *
 * 프로덕션에서 `/api/chat`(30/60s)이 먼저 뜨면 `passwordReset`(3/300s)이
 * 30/60s 가 된다 — 시간당 36통으로 막으려던 것이 1800통이 된다. 반대로
 * `adminLogin`(5/60s)이 먼저면 응시 중 채팅이 5/60s 로 조여진다.
 *
 * in-memory 폴백은 매번 config 를 읽으므로 영향이 없었다. 즉 **Upstash 가
 * 켜진 환경에서만** 어긋나고 로컬·CI 에서는 재현되지 않는다.
 */
const upstashLimiters = new Map<
  string,
  import("@upstash/ratelimit").Ratelimit
>();
let upstashRedis: unknown = null;
/** 패키지 import 실패는 한 번만 시도한다 — 원래 의도를 유지한다. */
let upstashUnavailable = false;

/**
 * `export` 인 이유는 테스트 때문이다.
 *
 * 이 함수는 `require()` 로 선택적 의존성을 늦게 불러오는데, 그래서
 * `vi.mock` 이 걸리지 않는다. `checkRateLimitAsync` 를 통해 간접적으로
 * 검증하려 하면 실제 Redis 로 네트워크를 시도하게 된다. 생성자만 부르는
 * 이 함수를 직접 부르면 네트워크 없이 캐시 동작을 볼 수 있다.
 */
export function getUpstashRatelimit(
  config: RateLimitConfig
): import("@upstash/ratelimit").Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  if (upstashUnavailable) return null;

  const key = `${config.limit}:${config.windowSec}`;
  const cached = upstashLimiters.get(key);
  if (cached) return cached;

  // Lazy init: we can't top-level import optional dependencies
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require("@upstash/ratelimit");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");

    // Redis 클라이언트는 하나만 만들어 버킷들이 공유한다.
    if (!upstashRedis) {
      upstashRedis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    }

    const limiter = new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.fixedWindow(config.limit, `${config.windowSec} s`),
      analytics: false,
      prefix: "rl",
    });
    upstashLimiters.set(key, limiter);
    return limiter;
  } catch {
    // @upstash packages not installed — stay with in-memory
    upstashUnavailable = true;
    return null;
  }
}

async function checkRateLimitUpstash(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const rl = getUpstashRatelimit(config);
  if (!rl) {
    return checkRateLimitInMemory(key, config);
  }

  try {
    const { success, remaining, reset } = await rl.limit(key);
    return {
      allowed: success,
      remaining,
      resetAt: reset,
    };
  } catch {
    // Upstash failure → graceful fallback to in-memory
    return checkRateLimitInMemory(key, config);
  }
}

// ============================================================
// Public API — same signature, auto-selects backend
// ============================================================

// P1-2: Track whether we've already warned about in-memory fallback (once per cold start)
let inMemoryFallbackWarned = false;

/**
 * Check rate limit for a given key.
 * Uses Upstash Redis when available, falls back to in-memory.
 *
 * For synchronous callers that can't await, use `checkRateLimitSync` instead.
 */
export async function checkRateLimitAsync(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return checkRateLimitUpstash(key, config);
  }

  // Log warning once about in-memory fallback (no conservative reduction — it was blocking valid requests)
  if (!inMemoryFallbackWarned && process.env.NODE_ENV === "production") {
    inMemoryFallbackWarned = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS not configured — using in-memory fallback. " +
      "Rate limiting is ineffective across serverless instances. " +
      "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production."
    );
  }

  return checkRateLimitInMemory(key, config);
}

/**
 * Synchronous rate limit check (in-memory only).
 * Kept for backward compatibility — existing callers use this.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  return checkRateLimitInMemory(key, config);
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  /** Chat API: 30 requests per minute per user */
  chat: { limit: 30, windowSec: 60 } satisfies RateLimitConfig,
  /** Admin login: 5 attempts per minute per IP */
  adminLogin: { limit: 5, windowSec: 60 } satisfies RateLimitConfig,
  /** General API: 60 requests per minute per user */
  general: { limit: 60, windowSec: 60 } satisfies RateLimitConfig,
  /** Upload: 10 requests per minute per user */
  upload: { limit: 10, windowSec: 60 } satisfies RateLimitConfig,
  /** AI endpoints (expensive): 20 requests per minute per user */
  ai: { limit: 20, windowSec: 60 } satisfies RateLimitConfig,
  /** Session/data read endpoints: 30 requests per minute per user */
  sessionRead: { limit: 30, windowSec: 60 } satisfies RateLimitConfig,
  /** Exam control (start/end): 10 requests per minute per user */
  examControl: { limit: 10, windowSec: 60 } satisfies RateLimitConfig,
  /** Public search endpoints (IP-based): 20 requests per minute */
  publicSearch: { limit: 20, windowSec: 60 } satisfies RateLimitConfig,
  /** Submission endpoints (expensive: triggers auto-grading): 30 requests per minute */
  submission: { limit: 30, windowSec: 60 } satisfies RateLimitConfig,
  /** Paste log endpoints: 120 requests per minute per user (high frequency during exams) */
  pasteLog: { limit: 120, windowSec: 60 } satisfies RateLimitConfig,
  /** Final answer auto-save (assignment): 60 saves per minute (debounced 2.5s on client) */
  finalAnswerSave: { limit: 60, windowSec: 60 } satisfies RateLimitConfig,
  /** AI 일괄 문제 생성용 (유형별 병렬 3콜 × 최대 제한): 5 requests per minute per user */
  bulkGenerate: { limit: 5, windowSec: 60 } satisfies RateLimitConfig,
  /**
   * 비밀번호 재설정 메일 발송 (IP 기준): 5분에 3회.
   *
   * 다른 버킷보다 창이 훨씬 길다. 이건 사용자가 연타할 동작이 아니라 **남의
   * 주소로 메일을 보내게 만드는** 동작이기 때문이다. 60초 창이면 한 IP 가
   * 시간당 180통을 남의 받은편지함에 넣을 수 있다.
   *
   * 3회로 둔 건 오타를 한 번 고칠 여지는 남기기 위해서다. 메일이 늦게 오는
   * 것처럼 느껴져 한 번 더 누르는 것도 흔하다.
   */
  passwordReset: { limit: 3, windowSec: 300 } satisfies RateLimitConfig,
  /**
   * 비밀번호 재설정 메일 발송 (받는 주소 기준): 1시간에 3회.
   *
   * IP 버킷과 따로 둔다. IP 를 돌리면 IP 버킷은 무력하고, 그러면 한 사람의
   * 받은편지함에 메일이 계속 쌓인다. 게다가 **새 복구 메일은 이전 링크를
   * 무효로 만든다** — 받는 사람이 링크를 누르기도 전에 다음 메일이 그걸 지운다.
   *
   * 이 버킷에 걸려도 호출자에게 429 를 주지 않는다. 주소별로 다른 응답이 나오면
   * 그게 계정 존재 여부를 흘리는 통로가 된다. 라우트가 조용히 발송만 건너뛴다.
   *
   * 이 버킷이 막는 건 **우리 라우트를 거친 발송**뿐이다. anon 키는 공개값이라
   * GoTrue `/auth/v1/recover` 를 직접 부르면 이 한도를 거치지 않는다. 그 경로는
   * Supabase 쪽 한도(프로젝트 메일 발송 한도, 사용자별 재발송 간격)만 받는다.
   */
  passwordResetAddress: { limit: 3, windowSec: 3600 } satisfies RateLimitConfig,
  /**
   * 복구 링크 확인 (IP 기준): 5분에 10회.
   *
   * `token_hash` 는 추측할 수 있는 값이 아니지만, 이 요청은 세션을 만드는
   * 유일한 비로그인 경로라 한도 없이 두지 않는다. 대학 NAT 에서 여러 사람이
   * 같은 시각에 메일 링크를 누르는 경우를 위해 발송보다 넉넉하다.
   */
  passwordResetVerify: { limit: 10, windowSec: 300 } satisfies RateLimitConfig,
} as const;
