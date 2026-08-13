import OpenAI from "openai";
import pLimit from "p-limit";
import { logError } from "@/lib/logger";

// NOTE: The grading queue that used to live here (`enqueueGrading` +
// `gradingLimiter = pLimit(60)`) was removed when the grading pipeline
// moved to chained QStash jobs. QStash itself serializes work per
// dedup-id and scales naturally — there is no longer any in-process
// serverless promise to throttle.

/**
 * IMPORTANT:
 * Do NOT throw at module import time.
 * If a required env var is missing in production, throwing here can prevent
 * Next.js route handlers from being registered and lead to confusing 404/405/500
 * behavior (often returning HTML error pages).
 */

// Backward compatible client (may have a placeholder key if env is missing).
// Routes should still handle OpenAI errors at call time.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "MISSING_OPENAI_API_KEY",
  // 이슈 #118: SDK 기본값은 maxRetries 2 다. 설정한 적이 없어서 모든 호출이
  // 조용히 3회까지 전송되고 있었고, 래퍼 루프·QStash 재시도와 곱해졌다.
  // 재시도는 요청 옵션(태스크 프로필)만 소유한다.
  maxRetries: 0,
  ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
});

// Preferred: lazy + explicit failure with a clear error message.
let _openai: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  if (!_openai) {
    _openai = new OpenAI({
      apiKey,
      // 위와 같은 이유로 숨은 재시도를 닫는다.
      maxRetries: 0,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
  }
  return _openai;
}

// AI 모델 상수는 `lib/ai-models.ts` 에 있다 — SDK 를 로드하지 않고 모델 이름만 읽어야 하는
// 순수 해석 계층(`lib/ai-task-profile.ts`)을 위해 분리했다. 기존 import 경로 호환을 위해
// 여기서 그대로 재수출한다.
export { AI_MODEL, AI_MODEL_HEAVY, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/ai-models";

// ============================================================
// Global concurrency limiter for OpenAI API calls
// Max 100 concurrent requests for 150-user classroom scale
// ============================================================
const openaiLimiter = pLimit(100);

/**
 * 재시도·타임아웃은 이 계층이 소유하지 않는다 (이슈 #118).
 *
 * 예전에는 여기서 `Promise.race` 타임아웃 + 수동 지수 백오프 3회를 돌렸다. 문제:
 *   1. SDK 기본 `maxRetries`(2회)와 곱해지고 QStash 재시도(3회)와 다시 곱해져
 *      한 번의 논리적 호출이 최악 27회 전송으로 번졌다.
 *   2. `Promise.race` 는 진 쪽을 취소하지 않는다. 120초 타임아웃이 떠도 밑의
 *      fetch 는 계속 살아 있어 좀비 요청이 남았다.
 *   3. 그 120초는 애초에 도달 불가능했다 — 호출 라우트 대부분이 maxDuration=60 이라
 *      Vercel 이 먼저 죽였다. 즉 선언된 예산이 실행될 수 없는 설정이었다.
 *
 * 지금은 전송 재시도와 시도별 타임아웃을 **SDK 요청 옵션 한 층**이 소유한다.
 * 값은 태스크 프로필이 정하고, 남은 deadline 예산으로 `lib/ai-deadline.ts` 가 조인다.
 * 클라이언트 기본 `maxRetries: 0` 은 프로필을 안 거치는 경로에서 숨은 재시도가
 * 되살아나지 않게 막는다.
 *
 * 이 래퍼에 남은 책임은 두 가지뿐이다: 전역 동시성 제한과 지연 측정.
 */

export class OpenAICallTelemetryError extends Error {
  error: unknown;
  attemptCount: number;
  latencyMs: number;

  constructor(params: {
    error: unknown;
    attemptCount: number;
    latencyMs: number;
  }) {
    super("OpenAI call failed");
    this.name = "OpenAICallTelemetryError";
    this.error = params.error;
    this.attemptCount = params.attemptCount;
    this.latencyMs = params.latencyMs;
  }
}

/**
 * 전송 계층 실패인지 판별한다 (이슈 #118).
 *
 * 주의: tracked 래퍼는 실패를 `OpenAICallTelemetryError` 로 감싸지만 최종적으로는
 * 원본 오류(`failure.error`)를 다시 던진다. 따라서 호출부에서 래퍼 타입을 검사하면
 * 절대 매치되지 않는다. 실제로 전파되는 것은 SDK 의 `APIError` 계열이다.
 *
 * 파싱/의미 실패는 여기 걸리지 않으므로, 의미 재시도 루프가 전송 실패까지
 * 다시 시도해 SDK 재시도와 곱해지는 것을 막는 데 쓴다.
 */
export function isOpenAITransportError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) return true;
  if (error instanceof Error && /^API(Error|ConnectionError|ConnectionTimeoutError|UserAbortError)$/.test(error.name)) return true;
  return isOpenAITimeoutError(error);
}

/** SDK 가 던지는 타임아웃(APIConnectionTimeoutError)을 이름으로 식별한다. */
export function isOpenAITimeoutError(error: unknown): boolean {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return true;
  return error instanceof Error && error.name === "APIConnectionTimeoutError";
}

/**
 * 동시성 제한 + 지연 측정만 하는 얇은 래퍼.
 *
 * `attemptCount` 는 **논리적 SDK 호출 수**다(성공하면 1). 실제 전송 시도 횟수가
 * 아니다 — SDK 내부 재시도 횟수는 노출되지 않으므로, 그 상한은 이벤트
 * 메타데이터의 `transport_attempts_upper_bound` 로 따로 기록한다.
 */
export async function callOpenAIWithTelemetry<T>(
  fn: () => Promise<T>
): Promise<{ data: T; attemptCount: number; latencyMs: number }> {
  return openaiLimiter(async () => {
    const startedAt = Date.now();
    try {
      const data = await fn();
      return { data, attemptCount: 1, latencyMs: Date.now() - startedAt };
    } catch (error) {
      throw new OpenAICallTelemetryError({
        error,
        attemptCount: 1,
        latencyMs: Date.now() - startedAt,
      });
    }
  });
}

export async function callOpenAI<T>(fn: () => Promise<T>): Promise<T> {
  const { data } = await callOpenAIWithTelemetry(fn);
  return data;
}
