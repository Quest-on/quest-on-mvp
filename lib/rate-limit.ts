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

let upstashRatelimit: import("@upstash/ratelimit").Ratelimit | null = null;
let upstashInitialized = false;

function getUpstashRatelimit(
  config: RateLimitConfig
): import("@upstash/ratelimit").Ratelimit | null {
  // Only try to initialize once per config change — avoid repeated import failures
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  // Lazy init: we can't top-level import optional dependencies
  if (!upstashInitialized) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Ratelimit } = require("@upstash/ratelimit");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis");

      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      upstashRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(config.limit, `${config.windowSec} s`),
        analytics: false,
        prefix: "rl",
      });
    } catch {
      // @upstash packages not installed — stay with in-memory
      upstashRatelimit = null;
    }
    upstashInitialized = true;
  }

  return upstashRatelimit;
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
} as const;
