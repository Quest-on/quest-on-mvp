/**
 * 분석 턴 하나의 Responses 스트림 처리 (이슈 #545)
 *
 * 스트림을 열고(일반 429 는 retry-after 에 따라 최대 2회 다시 연다), SSE 이벤트를 읽으며
 *   - 코드 셀 시작을 세고(`CellCollector`), 13번째 셀이 시작되면 스트림을 닫는다(cell_limit),
 *   - 요청 시작부터 240초가 지나면 스트림을 닫는다(time_limit),
 *   - 셀 완료(`response.output_item.done`)마다 코드, 로그, 그림을 모으고,
 *   - 답변 글자(`response.output_text.delta`)를 호출부에 흘려 보내고,
 *   - 마지막 응답(`response.completed`, `response.incomplete`)에서 id, 모델, 사용량, output 을 읽는다.
 *
 * 저장과 화면 전송은 하지 않는다. 결과를 돌려주면 라우트가 저장한다. 시계, 대기, 스트림 열기는 주입받아 테스트에서
 * 실제 OpenAI 를 부르지 않는다.
 */

import { CellCollector, type CollectedCell } from "@/lib/analysis-exec/cells";
import {
  OpenAIHttpError,
  classifyOpenAIFailure,
  rateLimitWaitMs,
  type OpenAIFailureKind,
} from "@/lib/analysis-exec/errors";
import { ANALYSIS_MAX_CELLS_PER_TURN, ANALYSIS_TURN_BUDGET_MS, RATE_LIMIT_MAX_RETRIES } from "@/lib/analysis-exec/limits";
import { readSseStream } from "@/lib/analysis-exec/sse";
import { extractUsageFromOpenAIResult } from "@/lib/ai-tracking";
import type { AiUsageSnapshot } from "@/lib/ai-pricing";

export type StreamTurnOutcome =
  | "completed"
  | "incomplete"
  | "cell_limit"
  | "time_limit"
  | "client_cancelled"
  | "failed";

export type StreamTurnFailure = {
  kind: OpenAIFailureKind;
  message: string;
  code: string | null;
  /** 스트림이 열리기 전(HTTP 오류)에 실패했는가. 열리기 전이면 아무 셀도 실행되지 않았다. */
  beforeStream: boolean;
};

export type StreamTurnResult = {
  outcome: StreamTurnOutcome;
  failure: StreamTurnFailure | null;
  responseId: string | null;
  responseModel: string | null;
  usage: AiUsageSnapshot | null;
  /** 마지막 응답의 output 배열(완료, 미완료일 때). 파일 인용과 답변 텍스트를 여기서 읽는다. */
  finalOutput: unknown[] | null;
  /** 스트림으로 받은 답변 글자. 마지막 응답이 없을 때(중단) 쓴다. */
  streamedText: string;
  cells: CollectedCell[];
  collector: CellCollector;
  /** 일반 429 로 다시 연 횟수. */
  retries: number;
};

export type StreamTurnCallbacks = {
  /** 셀 n 번째가 시작됐다(1부터). */
  onCellStarted?: (n: number) => void;
  /** 답변 글자를 쓰기 시작했다. */
  onWriting?: () => void;
  onTextDelta?: (delta: string) => void;
};

export type RunStreamTurnParams = {
  /** 스트림을 연다. 신호는 이 턴의 취소 신호다. */
  open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  /** 학생이 연결을 끊으면 취소되는 신호(라우트의 ReadableStream.cancel). */
  clientSignal?: AbortSignal;
  /** 요청 시작 시각(ms). 시간 예산은 여기서부터 센다. */
  startedAtMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  callbacks?: StreamTurnCallbacks;
  maxCells?: number;
  budgetMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runStreamTurn(params: RunStreamTurnParams): Promise<StreamTurnResult> {
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? defaultSleep;
  const budgetMs = params.budgetMs ?? ANALYSIS_TURN_BUDGET_MS;
  const collector = new CellCollector({ maxCells: params.maxCells ?? ANALYSIS_MAX_CELLS_PER_TURN });

  const controller = new AbortController();
  let stopReason: "cell_limit" | "time_limit" | "client_cancelled" | null = null;
  const stop = (reason: NonNullable<typeof stopReason>) => {
    if (!stopReason) stopReason = reason;
    controller.abort(new Error(reason));
  };

  const onClientAbort = () => stop("client_cancelled");
  if (params.clientSignal?.aborted) stop("client_cancelled");
  else params.clientSignal?.addEventListener("abort", onClientAbort, { once: true });

  const remaining = () => budgetMs - (now() - params.startedAtMs);
  const timer = setTimeout(() => stop("time_limit"), Math.max(0, remaining()));
  (timer as unknown as { unref?: () => void }).unref?.();

  const result: StreamTurnResult = {
    outcome: "failed",
    failure: null,
    responseId: null,
    responseModel: null,
    usage: null,
    finalOutput: null,
    streamedText: "",
    cells: collector.cells,
    collector,
    retries: 0,
  };

  try {
    // 1) 스트림 열기. 일반 429 만 다시 연다. 잔액 소진과 만료는 다시 열지 않는다.
    let body: ReadableStream<Uint8Array> | null = null;
    for (let attempt = 0; ; attempt++) {
      if (stopReason) break;
      try {
        body = await params.open(controller.signal);
        break;
      } catch (error) {
        if (stopReason) break;
        const failure = toFailure(error, true);
        if (failure.kind === "rate_limited" && attempt < RATE_LIMIT_MAX_RETRIES) {
          const wait = rateLimitWaitMs(error instanceof OpenAIHttpError ? error.retryAfterMs : null, remaining());
          if (wait !== null) {
            result.retries += 1;
            await sleep(wait);
            continue;
          }
        }
        result.failure = failure;
        return result;
      }
    }

    if (!body) {
      result.outcome = stopReason ?? "failed";
      return result;
    }

    // 2) 이벤트 읽기.
    let writingAnnounced = false;
    try {
      for await (const sse of readSseStream(body, controller.signal)) {
        if (stopReason) break;
        let event: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(sse.data);
          if (!isRecord(parsed)) continue;
          event = parsed;
        } catch {
          continue; // [DONE] 같은 비 JSON 줄
        }
        const type = typeof event.type === "string" ? event.type : sse.event ?? "";

        if (type === "response.created" || type === "response.in_progress") {
          const response = isRecord(event.response) ? event.response : null;
          if (response && typeof response.id === "string") result.responseId = response.id;
          if (response && typeof response.model === "string") result.responseModel = response.model;
        } else if (type === "response.output_item.added") {
          const item = event.item;
          const started = collector.onItemAdded(item);
          if (started !== null) {
            if (collector.exceeded) {
              stop("cell_limit");
              break;
            }
            params.callbacks?.onCellStarted?.(started);
          } else if (isRecord(item) && item.type === "message" && !writingAnnounced) {
            writingAnnounced = true;
            params.callbacks?.onWriting?.();
          }
        } else if (type === "response.output_item.done") {
          collector.onItemDone(event.item);
        } else if (type === "response.output_text.delta") {
          if (typeof event.delta === "string" && event.delta) {
            result.streamedText += event.delta;
            params.callbacks?.onTextDelta?.(event.delta);
          }
        } else if (type === "response.completed" || type === "response.incomplete") {
          const response = isRecord(event.response) ? event.response : null;
          if (response) {
            if (typeof response.id === "string") result.responseId = response.id;
            if (typeof response.model === "string") result.responseModel = response.model;
            result.usage = extractUsageFromOpenAIResult("responses", response);
            result.finalOutput = Array.isArray(response.output) ? response.output : [];
            // 완료 응답에 셀이 다시 들어 있다. 완료 이벤트를 놓친 셀이 있으면 여기서 모은다(같은 id 는 무시).
            for (const item of result.finalOutput) collector.onItemDone(item);
          }
          result.outcome = type === "response.completed" ? "completed" : "incomplete";
        } else if (type === "response.failed") {
          const response = isRecord(event.response) ? event.response : null;
          const err = response && isRecord(response.error) ? response.error : null;
          if (response) {
            if (typeof response.id === "string") result.responseId = response.id;
            result.usage = extractUsageFromOpenAIResult("responses", response);
          }
          result.failure = failureFrom(err, "response.failed");
          result.outcome = "failed";
        } else if (type === "error") {
          result.failure = failureFrom(event, "stream error");
          result.outcome = "failed";
        }
      }
    } catch (error) {
      if (!stopReason) {
        result.failure = toFailure(error, false);
        result.outcome = "failed";
      }
    }

    if (stopReason) {
      result.outcome = stopReason;
    } else if (!result.failure && result.outcome !== "completed" && result.outcome !== "incomplete") {
      // 완료 이벤트 없이 스트림이 끝났다.
      result.failure = { kind: "upstream", message: "stream ended without response.completed", code: null, beforeStream: false };
      result.outcome = "failed";
    }
    return result;
  } finally {
    clearTimeout(timer);
    params.clientSignal?.removeEventListener("abort", onClientAbort);
    if (!controller.signal.aborted) controller.abort(new Error("turn finished"));
  }
}

function failureFrom(err: Record<string, unknown> | null, fallback: string): StreamTurnFailure {
  const message = err && typeof err.message === "string" ? err.message : fallback;
  const code = err && typeof err.code === "string" ? err.code : null;
  const type = err && typeof err.type === "string" ? err.type : null;
  return {
    kind: classifyOpenAIFailure({ status: null, code: code ?? type ?? "stream_error", type, message }),
    message: message.slice(0, 300),
    code,
    beforeStream: false,
  };
}

function toFailure(error: unknown, beforeStream: boolean): StreamTurnFailure {
  if (error instanceof OpenAIHttpError) {
    return { kind: error.kind, message: error.message, code: error.code, beforeStream };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "network", message: message.slice(0, 300), code: null, beforeStream };
}
