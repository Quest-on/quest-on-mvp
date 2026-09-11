import { describe, expect, it } from "vitest";
import {
  calculateEstimatedCostUsdMicros,
  resolveModelPricing,
} from "@/lib/ai-pricing";

describe("ai-pricing", () => {
  it("resolves configured pricing for known models", () => {
    // OpenAI 공식 요금 (developers.openai.com/api/docs/models/gpt-5.4.md)
    expect(resolveModelPricing("gpt-5.4")).toMatchObject({
      inputUsdPer1M: 2.5,
      outputUsdPer1M: 15,
      cachedInputUsdPer1M: 0.25,
    });
  });

  it("resolves pricing for the GPT-5.6 family", () => {
    // 모델을 교체할 때 이 표가 비어 있으면 비용이 0 으로 기록되어 관측이 끊긴다.
    expect(resolveModelPricing("gpt-5.6-sol")).toMatchObject({
      inputUsdPer1M: 5,
      outputUsdPer1M: 30,
    });
    expect(resolveModelPricing("gpt-5.6-terra")).toMatchObject({
      inputUsdPer1M: 2,
      outputUsdPer1M: 12,
    });
    expect(resolveModelPricing("gpt-5.6-luna")).toMatchObject({
      inputUsdPer1M: 0.2,
      outputUsdPer1M: 1.2,
    });
  });

  it("resolves pricing for every model the app can be configured to use", () => {
    // lib/openai.ts 의 AI_MODEL / AI_MODEL_HEAVY / AI_MODEL_BULK_GRADING_WORKER 기본값과
    // 실제 운영에서 관측된 모델은 모두 가격표에 있어야 한다.
    for (const model of [
      "gpt-5.3-chat-latest",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-4o-mini",
      "text-embedding-3-small",
    ]) {
      expect(resolveModelPricing(model), `${model} 가격 누락`).not.toBeNull();
    }
  });

  it("returns zero cost for unknown models", () => {
    expect(
      calculateEstimatedCostUsdMicros("unknown-model", {
        inputTokens: 1000,
        outputTokens: 500,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 1500,
      })
    ).toBe(0);
  });

  it("calculates input, cached input, and output costs", () => {
    const cost = calculateEstimatedCostUsdMicros("gpt-5.4", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 200_000,
      reasoningTokens: 0,
      totalTokens: 1_500_000,
    });

    // 신선 입력 800k × $2.5 + 캐시 입력 200k × $0.25 + 출력 500k × $15
    // = $2.00 + $0.05 + $7.50 = $9.55
    expect(cost).toBe(9_550_000);
  });
});
