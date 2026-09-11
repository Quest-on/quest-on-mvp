import { beforeEach, describe, expect, it, vi } from "vitest";

// ai_events 쓰기 실패가 AI 응답 경로를 막지 않는지 DB 없이 검증한다.
const { insert, from, logError } = vi.hoisted(() => {
  const insert = vi.fn<() => Promise<{ error: { code?: string; message?: string } | null }>>(
    async () => ({ error: null })
  );
  return {
    insert,
    from: vi.fn(() => ({ insert })),
    logError: vi.fn(async () => true),
  };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({ from }),
}));
vi.mock("@/lib/logger", () => ({ logError }));
vi.mock("@/lib/openai", () => ({
  callOpenAIWithTelemetry: async <T>(fn: () => Promise<T>) => ({
    data: await fn(),
    attemptCount: 1,
    latencyMs: 1,
  }),
  isOpenAITimeoutError: () => false,
}));

import {
  callTrackedOpenAI,
  getLastAiTrackingFailure,
} from "@/lib/ai-tracking";

const context = {
  feature: "student_chat" as const,
  route: "/api/assignment-chat",
  endpoint: "chat.completions" as const,
  model: "gpt-5.6-luna",
};

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  from.mockClear();
  logError.mockClear();
});

describe("ai event tracking observability", () => {
  it("keeps the OpenAI result when a missing column rejects event persistence", async () => {
    insert.mockResolvedValueOnce({
      error: { code: "PGRST204", message: "config_version is missing" },
    });
    const response = { id: "chatcmpl_1" };

    await expect(callTrackedOpenAI(async () => response, context)).resolves.toMatchObject({
      data: response,
    });
    expect(getLastAiTrackingFailure()).toMatchObject({
      code: "PGRST204",
      schemaDrift: true,
    });
    expect(logError).toHaveBeenCalledWith(
      "AI event tracking schema drift",
      expect.objectContaining({ code: "PGRST204" }),
      expect.objectContaining({
        additionalData: expect.objectContaining({
          trackingErrorCode: "PGRST204",
          schemaDrift: true,
        }),
      })
    );
  });

  it("marks non-schema tracking failures separately", async () => {
    insert.mockResolvedValueOnce({ error: { message: "network unavailable" } });

    await callTrackedOpenAI(async () => ({ id: "chatcmpl_2" }), context);

    expect(getLastAiTrackingFailure()).toMatchObject({
      code: null,
      schemaDrift: false,
    });
    expect(logError).toHaveBeenCalledWith(
      "Failed to insert ai_events row",
      expect.anything(),
      expect.objectContaining({
        additionalData: expect.objectContaining({ schemaDrift: false }),
      })
    );
  });

  it("clears the failure state after the next successful insert", async () => {
    insert.mockResolvedValueOnce({ error: { code: "42703" } });
    await callTrackedOpenAI(async () => ({ id: "chatcmpl_3" }), context);
    expect(getLastAiTrackingFailure()).not.toBeNull();

    await callTrackedOpenAI(async () => ({ id: "chatcmpl_4" }), context);

    expect(getLastAiTrackingFailure()).toBeNull();
  });
});
