/**
 * OpenAI 오류 분류 (이슈 #545)
 *
 * 분석 턴은 오류 종류마다 다르게 행동해야 한다(스파이크 7.4절).
 *   - quota_exhausted: `credit_balance_exhausted`, `insufficient_quota`. HTTP 429 로 오지만 재시도하면 안 된다.
 *     잔액이 바닥나면 모든 학생이 같이 막히므로 학생에게 감독자를 부르라고 알리고 서버 로그에 error 를 남긴다.
 *   - container_expired: `Container is expired.` (Responses 는 400, 컨테이너 파일 API 는 404). 새 컨테이너를
 *     만들고 이전 코드를 다시 실행하게 하는 복구 흐름으로 간다.
 *   - rate_limited: 그 밖의 429(TPM, RPM). `retry-after-ms`, `retry-after` 를 따라 최대 2회 다시 보낸다.
 *   - upstream: 그 밖의 HTTP 오류.
 *   - network: 응답을 받지 못한 실패(연결, 타임아웃).
 *
 * 이 모듈은 순수하다.
 */

import { RATE_LIMIT_MAX_WAIT_MS } from "@/lib/analysis-exec/limits";

export type OpenAIFailureKind = "quota_exhausted" | "container_expired" | "rate_limited" | "upstream" | "network";

/** raw fetch 경로가 던지는 오류. 비밀값(키, 헤더 전체)은 담지 않는다. */
export class OpenAIHttpError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly type: string | null;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;
  readonly kind: OpenAIFailureKind;

  constructor(params: {
    message: string;
    status: number | null;
    code?: string | null;
    type?: string | null;
    retryAfterMs?: number | null;
    requestId?: string | null;
  }) {
    super(params.message);
    this.name = "OpenAIHttpError";
    this.status = params.status;
    this.code = params.code ?? null;
    this.type = params.type ?? null;
    this.retryAfterMs = params.retryAfterMs ?? null;
    this.requestId = params.requestId ?? null;
    this.kind = classifyOpenAIFailure({
      status: params.status,
      code: this.code,
      type: this.type,
      message: params.message,
    });
  }
}

const QUOTA_MARKERS = new Set(["credit_balance_exhausted", "insufficient_quota"]);

/**
 * 오류를 분류한다. 순서가 중요하다: 잔액 소진은 429 로 오므로 일반 429 보다 먼저 본다.
 * 스트림 안의 `error` 이벤트와 `response.failed` 의 오류도 같은 함수로 분류한다(상태 코드 없음).
 */
export function classifyOpenAIFailure(input: {
  status?: number | null;
  code?: string | null;
  type?: string | null;
  message?: string | null;
}): OpenAIFailureKind {
  const code = (input.code ?? "").toLowerCase();
  const type = (input.type ?? "").toLowerCase();
  const message = input.message ?? "";

  if (QUOTA_MARKERS.has(code) || QUOTA_MARKERS.has(type)) return "quota_exhausted";
  if (/container is expired/i.test(message)) return "container_expired";
  if (input.status === 429 || code === "rate_limit_exceeded" || type === "rate_limit_exceeded") return "rate_limited";
  if (input.status === null || input.status === undefined) {
    // 상태 코드가 없는 실패: 스트림 안의 오류 이벤트이거나 연결 실패다.
    return code || type ? "upstream" : "network";
  }
  return "upstream";
}

/**
 * 재시도까지 기다릴 시간. `retry-after-ms`(밀리초), `retry-after`(초 또는 HTTP 날짜), 오류 문장의
 * "try again in 1.782s" 순서로 읽는다. 읽지 못하면 null.
 */
export function parseRetryAfterMs(
  headers: { get(name: string): string | null } | null | undefined,
  message?: string | null,
  nowMs: number = Date.now()
): number | null {
  const ms = headers?.get("retry-after-ms");
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.ceil(Number(ms));

  const after = headers?.get("retry-after");
  if (after) {
    const trimmed = after.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.ceil(Number(trimmed) * 1000);
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) return Math.max(0, date - nowMs);
  }

  const match = message ? /try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(message) : null;
  if (match) {
    const value = Number(match[1]);
    return Math.ceil(match[2].toLowerCase() === "ms" ? value : value * 1000);
  }
  return null;
}

/**
 * 일반 429 의 재시도 대기 시간. 모르면 2초, 최소 0.5초, 최대 10초. 남은 시간 예산을 넘으면 null(재시도 안 함).
 */
export function rateLimitWaitMs(retryAfterMs: number | null, remainingBudgetMs: number): number | null {
  const wanted = retryAfterMs ?? 2_000;
  const wait = Math.min(Math.max(wanted, 500), RATE_LIMIT_MAX_WAIT_MS);
  // 기다린 뒤에도 턴 하나(최소 30초)를 돌릴 시간이 남아야 의미가 있다.
  if (wait + 30_000 > remainingBudgetMs) return null;
  return wait;
}
