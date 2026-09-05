import crypto from "crypto";
import OpenAI from "openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { logError } from "@/lib/logger";
import {
  AI_PRICING_VERSION,
  type AiEndpoint,
  type AiFeature,
  type AiUsageSnapshot,
  calculateEstimatedCostUsdMicros,
  resolveModelPricing,
} from "@/lib/ai-pricing";
import {
  isOpenAITimeoutError,
  callOpenAIWithTelemetry,
} from "@/lib/openai";

type JsonRecord = Record<string, unknown>;

interface TrackedRequestContext {
  feature: AiFeature;
  route: string;
  endpoint: AiEndpoint;
  model: string;
  userId?: string | null;
  examId?: string | null;
  sessionId?: string | null;
  qIdx?: number | null;
  metadata?: JsonRecord;
  /**
   * 이 요청을 만든 AI 설정 버전 (이슈 #118).
   * 프로필이 통제하는 호출은 반드시 넘겨야 한다 — 없으면 어떤 설정이 이 결과를
   * 만들었는지 사후에 되짚을 수 없고 마이그레이션 030 의 컬럼이 빈 채로 남는다.
   */
  configVersion?: string | null;
}

interface TrackedRequestOptions<T> {
  // 이슈 #118: `timeoutMs`/`maxAttempts` 는 제거됐다. 이 래퍼는 더 이상 타임아웃과
  // 재시도를 구현하지 않으므로 여기 남겨 두면 조용히 무시되는 죽은 옵션이 된다.
  // 타임아웃·재시도는 호출부가 SDK 요청 옵션으로 직접 넘긴다:
  //   create(params, { timeout, maxRetries, signal })
  metadataBuilder?: (result: T) => JsonRecord | undefined;
}

interface OpenAIRequestFailure {
  error: unknown;
  attemptCount: number;
  latencyMs: number;
}

export interface TrackedOpenAIResult<T> {
  data: T;
  usage: AiUsageSnapshot | null;
  requestId: string | null;
  responseId: string | null;
  attemptCount: number;
  latencyMs: number;
  estimatedCostUsdMicros: number;
}

export type AiTrackingFailure = {
  at: string;
  code: string | null;
  schemaDrift: boolean;
};

type AiEventInsert = {
  provider: string;
  endpoint: AiEndpoint;
  feature: AiFeature;
  route: string;
  model: string;
  user_id?: string | null;
  exam_id?: string | null;
  session_id?: string | null;
  q_idx?: number | null;
  // 이슈 #118: 스트리밍 경로는 학생이 탭을 닫는 정상 종료가 있어서
  // 실패와 구분되는 client_cancelled 가 필요하다.
  status: "success" | "error" | "timeout" | "client_cancelled";
  attempt_count: number;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd_micros: number;
  pricing_version: string;
  request_id: string | null;
  response_id: string | null;
  error_code: string | null;
  /** 이 요청이 사용한 AI 설정 버전 (이슈 #118). 마이그레이션 이전 행은 null 이다. */
  config_version?: string | null;
  metadata: JsonRecord;
};

let lastAiTrackingFailure: AiTrackingFailure | null = null;

/** 직전 ai_events 기록 실패. 없으면 null. */
export function getLastAiTrackingFailure(): AiTrackingFailure | null {
  return lastAiTrackingFailure;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function safeMetadata(metadata?: JsonRecord): JsonRecord {
  return metadata ? { ...metadata } : {};
}

function extractRequestId(result: unknown): string | null {
  if (!isRecord(result)) return null;

  const requestId = result._request_id;
  return typeof requestId === "string" ? requestId : null;
}

function extractResponseId(result: unknown): string | null {
  if (!isRecord(result)) return null;

  const id = result.id;
  return typeof id === "string" ? id : null;
}

export function extractUsageFromOpenAIResult(
  endpoint: AiEndpoint,
  result: unknown
): AiUsageSnapshot | null {
  if (!isRecord(result)) return null;

  if (endpoint === "responses") {
    const usage = isRecord(result.usage) ? result.usage : null;
    if (!usage) return null;

    const inputDetails = isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : null;
    const outputDetails = isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : null;

    return {
      inputTokens:
        typeof usage.input_tokens === "number" ? usage.input_tokens : null,
      outputTokens:
        typeof usage.output_tokens === "number" ? usage.output_tokens : null,
      cachedInputTokens:
        inputDetails && typeof inputDetails.cached_tokens === "number"
          ? inputDetails.cached_tokens
          : 0,
      reasoningTokens:
        outputDetails && typeof outputDetails.reasoning_tokens === "number"
          ? outputDetails.reasoning_tokens
          : 0,
      totalTokens:
        typeof usage.total_tokens === "number" ? usage.total_tokens : null,
    };
  }

  if (endpoint === "embeddings") {
    const usage = isRecord(result.usage) ? result.usage : null;
    if (!usage) return null;

    return {
      inputTokens:
        typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens:
        typeof usage.total_tokens === "number" ? usage.total_tokens : null,
    };
  }

  const usage = isRecord(result.usage) ? result.usage : null;
  if (!usage) return null;

  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : null;
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : null;

  return {
    inputTokens:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    outputTokens:
      typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
    cachedInputTokens:
      promptDetails && typeof promptDetails.cached_tokens === "number"
        ? promptDetails.cached_tokens
        : 0,
    reasoningTokens:
      completionDetails && typeof completionDetails.reasoning_tokens === "number"
        ? completionDetails.reasoning_tokens
        : 0,
    totalTokens:
      typeof usage.total_tokens === "number" ? usage.total_tokens : null,
  };
}

export function buildAiTextMetadata(params: {
  inputText?: string | string[];
  outputText?: string | null;
  extra?: JsonRecord;
}): JsonRecord {
  const metadata: JsonRecord = { ...(params.extra ?? {}) };
  const input = Array.isArray(params.inputText)
    ? params.inputText.join("\n\n")
    : params.inputText;

  if (typeof input === "string" && input.length > 0) {
    metadata.input_chars = input.length;
    metadata.prompt_hash = crypto
      .createHash("sha256")
      .update(input)
      .digest("hex");
  }

  if (typeof params.outputText === "string" && params.outputText.length > 0) {
    metadata.output_chars = params.outputText.length;
  }

  return metadata;
}

function getOpenAIErrorCode(error: unknown): string | null {
  if (isOpenAITimeoutError(error)) {
    return "timeout";
  }
  if (error instanceof OpenAI.APIError) {
    return error.code ? String(error.code) : `http_${error.status}`;
  }
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return null;
}

function getTrackingErrorCode(error: unknown): string | null {
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

function isAiTrackingSchemaDrift(code: string | null): boolean {
  return code === "PGRST204" || code === "PGRST205" || code === "42703";
}

async function insertAiEvent(event: AiEventInsert): Promise<void> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("ai_events").insert(event);

  if (error) {
    throw error;
  }
}

function buildFailure(error: unknown): OpenAIRequestFailure {
  if (
    isRecord(error) &&
    "error" in error &&
    "attemptCount" in error &&
    "latencyMs" in error
  ) {
    const attemptCount =
      typeof error.attemptCount === "number" ? error.attemptCount : 1;
    const latencyMs = typeof error.latencyMs === "number" ? error.latencyMs : 0;

    return {
      error: error.error,
      attemptCount,
      latencyMs,
    };
  }

  return {
    error,
    attemptCount: 1,
    latencyMs: 0,
  };
}

async function persistAiEvent(event: AiEventInsert, route: string): Promise<void> {
  try {
    await insertAiEvent(event);
    lastAiTrackingFailure = null;
  } catch (trackingError) {
    const code = getTrackingErrorCode(trackingError);
    const schemaDrift = isAiTrackingSchemaDrift(code);
    lastAiTrackingFailure = {
      at: new Date().toISOString(),
      code,
      schemaDrift,
    };

    await logError(
      schemaDrift
        ? "AI event tracking schema drift"
        : "Failed to insert ai_events row",
      trackingError,
      {
        path: route,
        additionalData: {
          feature: event.feature,
          endpoint: event.endpoint,
          model: event.model,
          trackingErrorCode: code,
          schemaDrift,
        },
      }
    );
  }
}

/**
 * 스트리밍 호출용 1회성 이벤트 기록기 (이슈 #118).
 *
 * SSE 경로는 thunk 래퍼를 쓸 수 없다. 응답이 이터레이터로 흘러나오고 종료 사유가
 * 넷(정상 완료 / 완료 이벤트 없이 종료 / 예외 / 클라이언트 취소)이나 되기 때문이다.
 * 그래서 `app/api/assignment-chat` 은 이 함수를 종료 경로에서 **정확히 한 번** 부른다.
 *
 * 지금까지 이 경로는 ai_events 에 아무것도 남기지 않았다(인터뷰 f4). 학생 채팅
 * 트래픽 전체가 비용·지연 관측에서 빠져 있었다는 뜻이다.
 */
export async function recordAiStreamEvent(params: {
  context: Omit<TrackedRequestContext, "endpoint">;
  status: "success" | "error" | "timeout" | "client_cancelled";
  latencyMs: number;
  usage?: AiUsageSnapshot | null;
  responseId?: string | null;
  error?: unknown;
  metadata?: JsonRecord;
  configVersion?: string | null;
}): Promise<void> {
  const { context, status, latencyMs } = params;
  const usage = params.usage ?? null;

  await persistAiEvent(
    {
      provider: "openai",
      endpoint: "responses",
      feature: context.feature,
      route: context.route,
      model: context.model,
      user_id: context.userId ?? null,
      exam_id: context.examId ?? null,
      session_id: context.sessionId ?? null,
      q_idx: context.qIdx ?? null,
      status,
      // 논리적 SDK 호출 수다 — 스트림이 시작됐으면 1.
      attempt_count: 1,
      latency_ms: latencyMs,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cached_input_tokens: usage?.cachedInputTokens ?? null,
      reasoning_tokens: usage?.reasoningTokens ?? null,
      total_tokens: usage?.totalTokens ?? null,
      estimated_cost_usd_micros: calculateEstimatedCostUsdMicros(context.model, usage),
      pricing_version: AI_PRICING_VERSION,
      request_id: null,
      response_id: params.responseId ?? null,
      error_code: params.error ? getOpenAIErrorCode(params.error) : null,
      config_version: params.configVersion ?? null,
      metadata: { ...(context.metadata ?? {}), ...(params.metadata ?? {}) },
    },
    context.route
  );
}

export async function callTrackedOpenAI<T>(
  fn: () => Promise<T>,
  context: TrackedRequestContext,
  options?: TrackedRequestOptions<T>
): Promise<TrackedOpenAIResult<T>> {
  try {
    const { data, attemptCount, latencyMs } = await callOpenAIWithTelemetry(fn);
    const usage = extractUsageFromOpenAIResult(context.endpoint, data);
    const requestId = extractRequestId(data);
    const responseId = extractResponseId(data);
    const estimatedCostUsdMicros = calculateEstimatedCostUsdMicros(
      context.model,
      usage
    );
    const metadata = {
      ...safeMetadata(context.metadata),
      ...(options?.metadataBuilder?.(data) ?? {}),
    };

    if (!usage) {
      metadata.usage_missing = true;
    }
    if (!resolveModelPricing(context.model)) {
      metadata.pricing_missing = true;
    }

    await persistAiEvent(
      {
        provider: "openai",
        endpoint: context.endpoint,
        feature: context.feature,
        route: context.route,
        model: context.model,
        user_id: context.userId ?? null,
        exam_id: context.examId ?? null,
        session_id: context.sessionId ?? null,
        q_idx: context.qIdx ?? null,
        status: "success",
        attempt_count: attemptCount,
        latency_ms: latencyMs,
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        cached_input_tokens: usage?.cachedInputTokens ?? null,
        reasoning_tokens: usage?.reasoningTokens ?? null,
        total_tokens: usage?.totalTokens ?? null,
        estimated_cost_usd_micros: usage ? estimatedCostUsdMicros : 0,
        pricing_version: AI_PRICING_VERSION,
        request_id: requestId,
        response_id: responseId,
        error_code: null,
        config_version: context.configVersion ?? null,
        metadata,
      },
      context.route
    );

    return {
      data,
      usage,
      requestId,
      responseId,
      attemptCount,
      latencyMs,
      estimatedCostUsdMicros: usage ? estimatedCostUsdMicros : 0,
    };
  } catch (error) {
    const failure = buildFailure(error);
    const status =
      isOpenAITimeoutError(failure.error) ? "timeout" : "error";

    await persistAiEvent(
      {
        provider: "openai",
        endpoint: context.endpoint,
        feature: context.feature,
        route: context.route,
        model: context.model,
        user_id: context.userId ?? null,
        exam_id: context.examId ?? null,
        session_id: context.sessionId ?? null,
        q_idx: context.qIdx ?? null,
        status,
        attempt_count: failure.attemptCount,
        latency_ms: failure.latencyMs,
        input_tokens: null,
        output_tokens: null,
        cached_input_tokens: null,
        reasoning_tokens: null,
        total_tokens: null,
        estimated_cost_usd_micros: 0,
        pricing_version: AI_PRICING_VERSION,
        request_id: null,
        response_id: null,
        error_code: getOpenAIErrorCode(failure.error),
        config_version: context.configVersion ?? null,
        metadata: safeMetadata(context.metadata),
      },
      context.route
    );

    throw failure.error;
  }
}

export async function callTrackedChatCompletion<T>(
  fn: () => Promise<T>,
  context: Omit<TrackedRequestContext, "endpoint">,
  options?: TrackedRequestOptions<T>
): Promise<TrackedOpenAIResult<T>> {
  return callTrackedOpenAI(fn, { ...context, endpoint: "chat.completions" }, options);
}

export async function callTrackedResponse<T>(
  fn: () => Promise<T>,
  context: Omit<TrackedRequestContext, "endpoint">,
  options?: TrackedRequestOptions<T>
): Promise<TrackedOpenAIResult<T>> {
  return callTrackedOpenAI(fn, { ...context, endpoint: "responses" }, options);
}

export async function callTrackedEmbedding<T>(
  fn: () => Promise<T>,
  context: Omit<TrackedRequestContext, "endpoint">,
  options?: TrackedRequestOptions<T>
): Promise<TrackedOpenAIResult<T>> {
  return callTrackedOpenAI(fn, { ...context, endpoint: "embeddings" }, options);
}
