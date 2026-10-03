/**
 * 분석 턴 스트림 처리 (이슈 #545)
 *
 * 가짜 Responses SSE 스트림으로 runStreamTurn 을 돌린다. 증명하는 것:
 *   - 정상 완료: 셀 완료 이벤트에서 셀을 모으고, 완료 응답에서 id, 모델, 사용량, output 을 읽는다.
 *   - 셀 상한: 13번째 셀이 시작되면 스트림을 닫는다(max_tool_calls 에 기대지 않는다).
 *   - 시간 상한: 예산을 넘으면 스트림을 닫는다.
 *   - 일반 429 는 retry-after 만큼 기다려 최대 2회 다시 열고, 잔액 소진은 다시 열지 않는다.
 *   - 만료(Container is expired), 스트림 중 실패, 학생 연결 끊김.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({}) }));

import { OpenAIHttpError } from "@/lib/analysis-exec/errors";
import { runStreamTurn } from "@/lib/analysis-exec/stream-turn";

const enc = new TextEncoder();

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

/** 주어진 청크를 내보내고, hang 이면 닫지 않고 기다린다(취소 신호가 오면 끝난다). */
function bodyOf(chunks: string[], opts: { hang?: boolean } = {}) {
  return (signal: AbortSignal) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        if (!opts.hang) controller.close();
        signal.addEventListener("abort", () => {
          try {
            controller.error(new DOMException("aborted", "AbortError"));
          } catch {
            // 이미 닫힘
          }
        });
      },
    });
}

const ci = (id: string, outputs: unknown[] = []) => ({ type: "code_interpreter_call", id, status: "completed", code: `print('${id}')`, outputs });

function completedTurn(cells: number) {
  const events: Array<Record<string, unknown>> = [
    { type: "response.created", response: { id: "resp_1", model: "gpt-x" } },
  ];
  for (let i = 1; i <= cells; i++) {
    events.push({ type: "response.output_item.added", item: { ...ci(`c${i}`), status: "in_progress", outputs: [] } });
    events.push({ type: "response.code_interpreter_call_code.delta", delta: "pri" });
    events.push({ type: "response.output_item.done", item: ci(`c${i}`, [{ type: "logs", logs: `${i}\n` }]) });
  }
  events.push({ type: "response.output_item.added", item: { type: "message", id: "m1" } });
  events.push({ type: "response.output_text.delta", delta: "결과" });
  events.push({ type: "response.output_text.delta", delta: "입니다." });
  events.push({
    type: "response.completed",
    response: {
      id: "resp_1",
      model: "gpt-x-2026",
      output: [...Array.from({ length: cells }, (_, i) => ci(`c${i + 1}`)), { type: "message", content: [{ type: "output_text", text: "결과입니다." }] }],
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 5 } },
    },
  });
  return events;
}

describe("runStreamTurn", () => {
  it("정상 완료: 셀과 사용량과 output 을 모으고 진행 콜백을 부른다", async () => {
    const started: number[] = [];
    const deltas: string[] = [];
    let writing = 0;
    const result = await runStreamTurn({
      open: async (signal) => bodyOf([sse(completedTurn(2))])(signal),
      startedAtMs: Date.now(),
      callbacks: { onCellStarted: (n) => started.push(n), onTextDelta: (d) => deltas.push(d), onWriting: () => (writing += 1) },
    });
    expect(result.outcome).toBe("completed");
    expect(result.failure).toBeNull();
    expect(result.responseId).toBe("resp_1");
    expect(result.responseModel).toBe("gpt-x-2026");
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedInputTokens: 10 });
    expect(result.cells.map((c) => c.logs)).toEqual(["1\n", "2\n"]);
    expect(started).toEqual([1, 2]);
    expect(writing).toBe(1);
    expect(deltas.join("")).toBe("결과입니다.");
    expect(result.streamedText).toBe("결과입니다.");
    expect(result.finalOutput).toHaveLength(3);
  });

  it("13번째 셀이 시작되면 스트림을 닫고 cell_limit 이다(그 전 셀은 남는다)", async () => {
    let aborted = false;
    const result = await runStreamTurn({
      open: async (signal) => {
        signal.addEventListener("abort", () => (aborted = true));
        return bodyOf([sse(completedTurn(13))], { hang: true })(signal);
      },
      startedAtMs: Date.now(),
    });
    expect(result.outcome).toBe("cell_limit");
    expect(result.cells).toHaveLength(12);
    expect(aborted).toBe(true);
  });

  it("시간 예산을 넘으면 스트림을 닫고 time_limit 이다", async () => {
    const result = await runStreamTurn({
      open: async (signal) =>
        bodyOf([sse([{ type: "response.created", response: { id: "r" } }, { type: "response.output_item.added", item: ci("a") }])], {
          hang: true,
        })(signal),
      startedAtMs: Date.now(),
      budgetMs: 50,
    });
    expect(result.outcome).toBe("time_limit");
    expect(result.responseId).toBe("r");
  });

  it("일반 429 는 retry-after 만큼 기다려 다시 연다(최대 2회)", async () => {
    const sleep = vi.fn(async () => undefined);
    const open = vi
      .fn()
      .mockRejectedValueOnce(new OpenAIHttpError({ message: "TPM", status: 429, code: "rate_limit_exceeded", retryAfterMs: 1800 }))
      .mockRejectedValueOnce(new OpenAIHttpError({ message: "TPM", status: 429, retryAfterMs: 100 }))
      .mockImplementationOnce(async (signal: AbortSignal) => bodyOf([sse(completedTurn(1))])(signal));
    const result = await runStreamTurn({ open, sleep, startedAtMs: Date.now() });
    expect(result.outcome).toBe("completed");
    expect(result.retries).toBe(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1800);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);
  });

  it("세 번째 429 에서는 더 기다리지 않고 rate_limited 로 끝난다", async () => {
    const sleep = vi.fn(async () => undefined);
    const err = new OpenAIHttpError({ message: "TPM", status: 429 });
    const open = vi.fn().mockRejectedValue(err);
    const result = await runStreamTurn({ open, sleep, startedAtMs: Date.now() });
    expect(open).toHaveBeenCalledTimes(3);
    expect(result.outcome).toBe("failed");
    expect(result.failure).toMatchObject({ kind: "rate_limited", beforeStream: true });
  });

  it("잔액 소진(429 credit_balance_exhausted)은 다시 열지 않는다", async () => {
    const sleep = vi.fn(async () => undefined);
    const open = vi
      .fn()
      .mockRejectedValue(new OpenAIHttpError({ message: "You have no credits", status: 429, code: "credit_balance_exhausted", type: "insufficient_quota" }));
    const result = await runStreamTurn({ open, sleep, startedAtMs: Date.now() });
    expect(open).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.failure?.kind).toBe("quota_exhausted");
  });

  it("Container is expired 는 스트림 전 실패로 돌려준다(호출부가 복구한다)", async () => {
    const open = vi.fn().mockRejectedValue(new OpenAIHttpError({ message: "Container is expired.", status: 400 }));
    const result = await runStreamTurn({ open, startedAtMs: Date.now() });
    expect(result.failure).toMatchObject({ kind: "container_expired", beforeStream: true });
    expect(result.cells).toHaveLength(0);
  });

  it("스트림 중 response.failed 와 error 이벤트를 분류한다", async () => {
    const failed = await runStreamTurn({
      open: async (signal) =>
        bodyOf([
          sse([
            { type: "response.created", response: { id: "r" } },
            { type: "response.failed", response: { id: "r", error: { code: "rate_limit_exceeded", message: "TPM" } } },
          ]),
        ])(signal),
      startedAtMs: Date.now(),
    });
    expect(failed.outcome).toBe("failed");
    expect(failed.failure).toMatchObject({ kind: "rate_limited", beforeStream: false });

    const quota = await runStreamTurn({
      open: async (signal) => bodyOf([sse([{ type: "error", code: "insufficient_quota", message: "no credits" }])])(signal),
      startedAtMs: Date.now(),
    });
    expect(quota.failure?.kind).toBe("quota_exhausted");
  });

  it("완료 이벤트 없이 끝나면 실패다", async () => {
    const result = await runStreamTurn({
      open: async (signal) => bodyOf([sse([{ type: "response.created", response: { id: "r" } }])])(signal),
      startedAtMs: Date.now(),
    });
    expect(result.outcome).toBe("failed");
    expect(result.failure?.message).toContain("without response.completed");
  });

  it("학생이 연결을 끊으면 client_cancelled 이고 모은 셀은 남는다", async () => {
    const client = new AbortController();
    const result = await runStreamTurn({
      open: async (signal) =>
        bodyOf([sse([{ type: "response.output_item.added", item: ci("a") }, { type: "response.output_item.done", item: ci("a") }])], {
          hang: true,
        })(signal),
      clientSignal: client.signal,
      startedAtMs: Date.now(),
      callbacks: { onCellStarted: () => setTimeout(() => client.abort(), 5) },
    });
    expect(result.outcome).toBe("client_cancelled");
    expect(result.cells).toHaveLength(1);
  });
});
