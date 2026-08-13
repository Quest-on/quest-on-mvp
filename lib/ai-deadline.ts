/**
 * Deadline 예산 → SDK 요청 옵션 (이슈 #118)
 *
 * 왜 필요한가: `lib/openai.ts` 의 옛 구조는 120초 타임아웃과 3회 재시도를 선언했지만
 * 호출 라우트 대부분이 `maxDuration = 60` 이라 그 예산은 실행될 수 없었다. 게다가
 * `Promise.race` 는 진 쪽을 취소하지 않아 좀비 요청이 남았다.
 *
 * 대신 gRPC 스타일 deadline propagation 을 쓴다: 라우트 진입 시각에 절대 deadline 을
 * 잡고, 남은 예산에서 SDK 재시도 sleep 최악값까지 보수적으로 예약한 뒤 실효 재시도 수와
 * 시도당 타임아웃을 역산한다. 예산이 모자라면 OpenAI 를 호출하지 않고 즉시 실패한다.
 *
 * openai@5.15.0 의 재시도 sleep 은 `Retry-After` 대기 중 abort signal 을 보지 않는다.
 * 따라서 signal 만으로는 라우트 deadline 을 지킬 수 없어 재시도 수 자체를 조인다.
 */

import type { ResolvedAiTaskProfile } from "@/lib/ai-task-profile";

/** 서버리스 라우트가 강제 종료되기 전에 남겨 두는 여유. */
export const DEFAULT_SAFETY_MARGIN_MS = 10_000;

/** SDK 가 `Retry-After` 로 대기할 수 있는 최악값(보수적 예약). */
export const MAX_SDK_RETRY_SLEEP_MS = 60_000;

/** 이보다 짧은 시도는 의미가 없다. */
export const MIN_USEFUL_ATTEMPT_MS = 1_000;

/** 시도당 스케줄링/네트워크 예약. */
export const PER_ATTEMPT_OVERHEAD_MS = 250;

export class AiDeadlineExhaustedError extends Error {
  readonly remainingMs: number;
  readonly requestedMaxRetries: number;
  readonly effectiveMaxRetries: number;
  readonly attemptTimeoutMs: number;

  constructor(params: {
    remainingMs: number;
    requestedMaxRetries: number;
    effectiveMaxRetries: number;
    attemptTimeoutMs: number;
  }) {
    super(
      `AI_DEADLINE_BUDGET_EXHAUSTED: ${params.remainingMs}ms remaining is not enough for one useful attempt`
    );
    this.name = "AiDeadlineExhaustedError";
    this.remainingMs = params.remainingMs;
    this.requestedMaxRetries = params.requestedMaxRetries;
    this.effectiveMaxRetries = params.effectiveMaxRetries;
    this.attemptTimeoutMs = params.attemptTimeoutMs;
  }
}

/** 라우트 진입 시각과 `maxDuration` 으로 절대 deadline 을 만든다. */
export function createRouteDeadline(params: {
  startedAtMs: number;
  maxDurationSec: number;
  safetyMarginMs?: number;
}): number {
  const margin = params.safetyMarginMs ?? DEFAULT_SAFETY_MARGIN_MS;
  return params.startedAtMs + params.maxDurationSec * 1000 - margin;
}

/**
 * 프로필 타임아웃과 라우트가 계산한 남은 예산 중 **더 짧은 쪽**을 고른다.
 *
 * 두 축이 각각 필요하다:
 *   - 프로필 타임아웃은 관리자가 낮출 수 있어야 한다. ad-hoc 값만 쓰면
 *     관리자 오버라이드가 조용히 무시된다.
 *   - 남은 deadline 예산은 서버리스 강제 종료를 막는다. 프로필이 더 길어도
 *     예산을 넘길 수 없다.
 *
 * 세 채점 호출부가 이 함수 하나를 공유한다 — 각자 Math.min 을 적으면
 * 한 곳만 되돌아가도 아무도 눈치채지 못한다.
 */
export function clampTimeoutToProfile(
  profile: Pick<ResolvedAiTaskProfile, "timeoutMs">,
  budgetMs: number
): number {
  return Math.min(profile.timeoutMs, budgetMs);
}

export type AiRequestBudget = {
  /** SDK 요청 옵션에 그대로 전달한다. */
  readonly timeout: number;
  readonly maxRetries: number;
  readonly signal: AbortSignal;
  /** 관측용 — 요청값과 실효값의 차이를 이벤트 메타데이터에 남긴다. */
  readonly requestedMaxRetries: number;
  readonly effectiveMaxRetries: number;
  readonly transportAttemptsUpperBound: number;
  readonly remainingBudgetMs: number;
};

/**
 * 남은 예산 안에 들어가는 가장 큰 재시도 수 `k` 를 고른다.
 *   (k+1)*(M+O) + k*D <= remaining
 * 그 다음 시도당 타임아웃을 남은 예산에서 역산한다.
 *
 * 60초 라우트는 보통 k=0 으로 조여지는 게 정상이다. 요청된 기본값(채점 2)은
 * 프로필에 그대로 남고, 여기서 나온 실효값만 낮아진다.
 */
export function resolveAiRequestBudget(params: {
  profile: ResolvedAiTaskProfile;
  deadlineMs: number;
  nowMs?: number;
  externalSignal?: AbortSignal;
}): AiRequestBudget {
  const now = params.nowMs ?? Date.now();
  const remaining = params.deadlineMs - now;
  const requested = params.profile.maxRetries;

  let effective = -1;
  for (let k = requested; k >= 0; k -= 1) {
    const needed =
      (k + 1) * (MIN_USEFUL_ATTEMPT_MS + PER_ATTEMPT_OVERHEAD_MS) + k * MAX_SDK_RETRY_SLEEP_MS;
    if (needed <= remaining) {
      effective = k;
      break;
    }
  }

  if (effective < 0) {
    throw new AiDeadlineExhaustedError({
      remainingMs: remaining,
      requestedMaxRetries: requested,
      effectiveMaxRetries: 0,
      attemptTimeoutMs: 0,
    });
  }

  const attemptTimeout = Math.min(
    params.profile.timeoutMs,
    Math.floor(
      (remaining - effective * MAX_SDK_RETRY_SLEEP_MS - (effective + 1) * PER_ATTEMPT_OVERHEAD_MS) /
        (effective + 1)
    )
  );

  if (attemptTimeout < MIN_USEFUL_ATTEMPT_MS) {
    throw new AiDeadlineExhaustedError({
      remainingMs: remaining,
      requestedMaxRetries: requested,
      effectiveMaxRetries: effective,
      attemptTimeoutMs: attemptTimeout,
    });
  }

  return {
    timeout: attemptTimeout,
    maxRetries: effective,
    signal: composeAbortSignals(remaining, params.externalSignal),
    requestedMaxRetries: requested,
    effectiveMaxRetries: effective,
    transportAttemptsUpperBound: effective + 1,
    remainingBudgetMs: remaining,
  };
}

/** deadline 신호와 호출자 신호(클라이언트 연결 등)를 하나로 합친다. */
function composeAbortSignals(remainingMs: number, external?: AbortSignal): AbortSignal {
  const deadlineSignal = AbortSignal.timeout(remainingMs);
  if (!external) return deadlineSignal;

  // AbortSignal.any 는 Node 20+ 에서 사용 가능하다.
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([deadlineSignal, external]);

  const controller = new AbortController();
  const forward = (reason: unknown) => controller.abort(reason);
  if (external.aborted) forward(external.reason);
  else external.addEventListener("abort", () => forward(external.reason), { once: true });
  if (deadlineSignal.aborted) forward(deadlineSignal.reason);
  else
    deadlineSignal.addEventListener("abort", () => forward(deadlineSignal.reason), { once: true });
  return controller.signal;
}
