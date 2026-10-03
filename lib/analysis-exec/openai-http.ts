/**
 * 분석 실행 경로 전용 OpenAI HTTP 호출 (이슈 #545)
 *
 * 왜 SDK(openai 5.15.0)가 아니라 raw fetch 인가
 *   - 저장소 SDK 에는 컨테이너 `memory_limit` 같은 필드의 타입이 없다(스파이크 2절). 올리려면 SDK 를 메이저로 올려야
 *     하고, 그러면 이 경로 밖의 모든 AI 호출(채점, 출제, 채팅)이 같이 바뀐다. 이 경로만 raw fetch 로 가면 다른 경로의
 *     회귀 위험이 0 이다.
 *   - 오류 분류에 필요한 값(HTTP 상태, `error.code`, `error.type`, `retry-after-ms` 헤더)을 그대로 읽는다.
 *   - 스트림을 우리 SSE 파서(`lib/analysis-exec/sse.ts`)로 읽어 이벤트 경계와 부분 청크를 테스트로 고정한다.
 *
 * 재시도는 여기서 하지 않는다. 호출부(분석 턴)가 오류 종류를 보고 정한다.
 * 키는 환경변수에서만 읽고 어떤 오류 메시지와 로그에도 넣지 않는다.
 */

import { OpenAIHttpError, parseRetryAfterMs } from "@/lib/analysis-exec/errors";
import { OPENAI_SETUP_CALL_TIMEOUT_MS } from "@/lib/analysis-exec/limits";

export type OpenAIHttpConfig = {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** 환경변수에서 설정을 읽는다. 키가 없으면 던진다(`getOpenAI` 와 같은 규칙). */
export function getOpenAIHttpConfig(): OpenAIHttpConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY environment variable");
  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/** 두 신호 중 하나라도 취소되면 취소되는 신호. (Node 의 AbortSignal.any 에 기대지 않는다.) */
export function linkAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${ms}ms`)), ms);
  // 타이머가 프로세스 종료를 막지 않게 한다(Node).
  (timer as unknown as { unref?: () => void }).unref?.();
  return controller.signal;
}

/** 오류 응답 본문을 읽어 `OpenAIHttpError` 로 바꾼다. 본문 전체는 메시지에 넣지 않는다(길이 상한). */
export async function toOpenAIHttpError(response: Response): Promise<OpenAIHttpError> {
  let message = `OpenAI HTTP ${response.status}`;
  let code: string | null = null;
  let type: string | null = null;
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown; code?: unknown; type?: unknown } };
      const err = body?.error;
      if (err && typeof err === "object") {
        if (typeof err.message === "string" && err.message) message = err.message.slice(0, 500);
        if (typeof err.code === "string") code = err.code;
        if (typeof err.type === "string") type = err.type;
      }
    } catch {
      if (text) message = `${message}: ${text.slice(0, 200)}`;
    }
  } catch {
    // 본문을 못 읽어도 상태 코드로 분류한다.
  }
  return new OpenAIHttpError({
    message,
    status: response.status,
    code,
    type,
    retryAfterMs: parseRetryAfterMs(response.headers, message),
    requestId: response.headers.get("x-request-id"),
  });
}

async function send(
  config: OpenAIHttpConfig,
  path: string,
  init: { method: string; json?: unknown; body?: BodyInit; accept?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}` };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.accept) headers.Accept = init.accept;
  const signal =
    init.timeoutMs !== undefined ? linkAbortSignals(init.signal, timeoutSignal(init.timeoutMs)) : init.signal;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error; // 호출부가 취소했다. 그대로 올린다.
    throw new OpenAIHttpError({
      message: `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
      status: null,
    });
  }
  if (!response.ok) throw await toOpenAIHttpError(response);
  return response;
}

async function sendJson<T>(
  config: OpenAIHttpConfig,
  path: string,
  init: Parameters<typeof send>[2]
): Promise<T> {
  const response = await send(config, path, { timeoutMs: OPENAI_SETUP_CALL_TIMEOUT_MS, ...init });
  return (await response.json()) as T;
}

export type ContainerInfo = { id: string; status: string; last_active_at?: number | null };
export type ContainerFileInfo = { id: string; path: string; bytes?: number | null; source?: string | null };

/** 명시 컨테이너를 만든다. 메모리 1g, 만료는 마지막 사용 뒤 20분(상한). */
export async function createContainer(
  config: OpenAIHttpConfig,
  params: { name: string; fileIds: string[]; signal?: AbortSignal }
): Promise<ContainerInfo> {
  return sendJson<ContainerInfo>(config, "/containers", {
    method: "POST",
    json: {
      name: params.name,
      file_ids: params.fileIds,
      memory_limit: "1g",
      expires_after: { anchor: "last_active_at", minutes: 20 },
    },
    signal: params.signal,
  });
}

/** 컨테이너 상태를 읽는다. 이 GET 이 마지막 사용 시각을 갱신한다(스파이크 T5). */
export async function retrieveContainer(
  config: OpenAIHttpConfig,
  params: { containerId: string; signal?: AbortSignal }
): Promise<ContainerInfo> {
  return sendJson<ContainerInfo>(config, `/containers/${encodeURIComponent(params.containerId)}`, {
    method: "GET",
    signal: params.signal,
  });
}

/** 컨테이너 안 파일 목록(경로 포함). 첫 페이지만 읽는다(데이터 파일은 몇 개뿐이다). */
export async function listContainerFiles(
  config: OpenAIHttpConfig,
  params: { containerId: string; signal?: AbortSignal }
): Promise<ContainerFileInfo[]> {
  const body = await sendJson<{ data?: ContainerFileInfo[] }>(
    config,
    `/containers/${encodeURIComponent(params.containerId)}/files?limit=100&order=asc`,
    { method: "GET", signal: params.signal }
  );
  return Array.isArray(body?.data) ? body.data : [];
}

/** Files API 로 파일을 올린다(purpose user_data). 컨테이너를 만들 때 file_ids 로 연결한다. */
export async function uploadFile(
  config: OpenAIHttpConfig,
  params: { filename: string; bytes: Uint8Array; mime: string; signal?: AbortSignal }
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([params.bytes as BlobPart], { type: params.mime }), params.filename);
  return sendJson<{ id: string }>(config, "/files", { method: "POST", body: form, signal: params.signal });
}

/** 컨테이너 파일(그림) 내용을 내려받는다. 상한을 넘으면 null. */
export async function downloadContainerFile(
  config: OpenAIHttpConfig,
  params: { containerId: string; fileId: string; maxBytes: number; signal?: AbortSignal; timeoutMs?: number }
): Promise<Uint8Array | null> {
  const response = await send(
    config,
    `/containers/${encodeURIComponent(params.containerId)}/files/${encodeURIComponent(params.fileId)}/content`,
    {
      method: "GET",
      signal: params.signal,
      timeoutMs: Math.max(1_000, Math.min(params.timeoutMs ?? OPENAI_SETUP_CALL_TIMEOUT_MS, OPENAI_SETUP_CALL_TIMEOUT_MS)),
    }
  );
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > params.maxBytes) return null;
  const buffer = new Uint8Array(await response.arrayBuffer());
  return buffer.byteLength > params.maxBytes ? null : buffer;
}

/**
 * Responses API 를 foreground `stream: true` 로 연다. 성공하면 SSE 바이트 스트림을 돌려주고, HTTP 오류면
 * `OpenAIHttpError` 를 던진다. background 모드는 쓰지 않는다(폴링하면 code_interpreter 출력이 빈다, 스파이크 T6).
 */
export async function openResponseStream(
  config: OpenAIHttpConfig,
  params: { body: Record<string, unknown>; signal?: AbortSignal }
): Promise<ReadableStream<Uint8Array>> {
  const response = await send(config, "/responses", {
    method: "POST",
    json: { ...params.body, stream: true },
    accept: "text/event-stream",
    signal: params.signal,
  });
  if (!response.body) {
    throw new OpenAIHttpError({ message: "OpenAI stream has no body", status: response.status });
  }
  return response.body;
}
