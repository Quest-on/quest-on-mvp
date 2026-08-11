import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn(async () => ({ error: null }));
  return { insert, from: vi.fn(() => ({ insert })) };
});
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ from }) }));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(async () => {}),
  logWarn: vi.fn(async () => {}),
  logInfo: vi.fn(async () => {}),
}));

import { recordAiStreamEvent } from "@/lib/ai-tracking";

/**
 * SSE 추적 복구 (이슈 #118, AC-13/AC-20)
 *
 * 인터뷰 f4: `app/api/assignment-chat` 은 responses.stream 을 직접 써서 tracked
 * 래퍼를 우회했고, 그 결과 학생 채팅 트래픽 전체가 ai_events 에 남지 않았다.
 * 비용·지연 관측에 구멍이 있었다는 뜻이다.
 */

const ROUTE_SOURCE = readFileSync(
  path.join(process.cwd(), "app", "api", "assignment-chat", "route.ts"),
  "utf8"
);

const BASE_CONTEXT = {
  feature: "assignment_chat" as const,
  route: "/api/assignment-chat",
  model: "gpt-5.6-luna",
  userId: "user-1",
  sessionId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  insert.mockClear();
  from.mockClear();
});

describe("recordAiStreamEvent", () => {
  it("records a successful stream with the real usage from response.completed", async () => {
    await recordAiStreamEvent({
      context: BASE_CONTEXT,
      status: "success",
      latencyMs: 1234,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cachedInputTokens: 5,
        reasoningTokens: 0,
        totalTokens: 30,
      },
      responseId: "resp_1",
      configVersion: "22222222-2222-4222-8222-222222222222",
    });

    expect(from).toHaveBeenCalledWith("ai_events");
    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.status).toBe("success");
    expect(row.endpoint).toBe("responses");
    expect(row.input_tokens).toBe(10);
    expect(row.output_tokens).toBe(20);
    expect(row.total_tokens).toBe(30);
    expect(row.response_id).toBe("resp_1");
    expect(row.latency_ms).toBe(1234);
    // 논리적 SDK 호출 수 — wire 시도 횟수를 주장하지 않는다.
    expect(row.attempt_count).toBe(1);
    expect(row.config_version).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("distinguishes a client cancel from a failure", async () => {
    await recordAiStreamEvent({
      context: BASE_CONTEXT,
      status: "client_cancelled",
      latencyMs: 42,
    });

    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    // 학생이 탭을 닫는 건 실패가 아니다. 에러율 지표를 오염시키면 안 된다.
    expect(row.status).toBe("client_cancelled");
    expect(row.error_code).toBeNull();
  });

  it("records an error with its code and no invented usage", async () => {
    const err = new Error("stream blew up");
    err.name = "APIConnectionError";

    await recordAiStreamEvent({
      context: BASE_CONTEXT,
      status: "error",
      latencyMs: 7,
      error: err,
    });

    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.status).toBe("error");
    expect(row.error_code).toBe("APIConnectionError");
    // usage 를 못 받았으면 0 이 아니라 null 이어야 한다 — 추정하지 않는다.
    expect(row.input_tokens).toBeNull();
    expect(row.total_tokens).toBeNull();
  });

  it("still writes a row when the stream never completed", async () => {
    await recordAiStreamEvent({
      context: BASE_CONTEXT,
      status: "error",
      latencyMs: 99,
      error: new Error("stream ended without response.completed"),
    });

    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("route wires every terminal path exactly once", () => {
  it("guards the finalizer with a settled flag", () => {
    expect(ROUTE_SOURCE).toMatch(/let streamSettled = false/);
    expect(ROUTE_SOURCE).toMatch(/if \(streamSettled\) return;/);
    expect(ROUTE_SOURCE).toMatch(/streamSettled = true;/);
  });

  it("finalizes on success, on error, and on client cancel", () => {
    const calls = ROUTE_SOURCE.match(/await finalizeStreamEvent\(/g) ?? [];
    // 성공/비완료 분기 1회 + 예외 1회 + 취소 1회.
    expect(calls.length).toBe(3);
    expect(ROUTE_SOURCE).toMatch(/status: "client_cancelled"/);
  });

  it("treats a stream that ended without response.completed as a failure", () => {
    expect(ROUTE_SOURCE).toMatch(/stream ended without response\.completed/);
  });

  it("bridges client cancellation into the SDK stream", () => {
    // 끊지 않으면 아무도 읽지 않는 응답에 계속 과금된다.
    expect(ROUTE_SOURCE).toMatch(/async cancel\(\)/);
    expect(ROUTE_SOURCE).toMatch(/stream\.abort\(\)/);
  });

  it("captures usage only from the completed event", () => {
    expect(ROUTE_SOURCE).toMatch(/extractUsageFromOpenAIResult\("responses", event\.response\)/);
  });

  it("keeps message persistence independent of AI event recording", () => {
    // 하나가 실패해도 다른 하나는 남아야 한다.
    // AI 응답 저장은 이벤트 기록 뒤에 온다 — 저장이 실패해도 관측은 남는다.
    const finalizeIdx = ROUTE_SOURCE.indexOf("await finalizeStreamEvent(");
    const aiMessageInsertIdx = ROUTE_SOURCE.indexOf('role: "ai"');
    expect(finalizeIdx).toBeGreaterThan(-1);
    expect(aiMessageInsertIdx).toBeGreaterThan(finalizeIdx);
  });
});
