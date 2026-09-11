import { describe, expect, it } from "vitest";
import { resolveModelPricing } from "@/lib/ai-pricing";

/**
 * 모델 상수 회귀 테스트.
 *
 * 과거에 `gpt-5.4-nano` 가 가격표 없이 운영에 투입돼 552회 호출이 전부 $0 으로 집계된 적이 있다.
 * 모델을 바꿀 때 가격표를 같이 갱신하지 않으면 비용 관측이 조용히 끊기므로, 그 조합을 여기서 막는다.
 */
describe("AI 모델 상수", () => {
  const load = async () => {
    const mod = await import("@/lib/openai");
    return {
      AI_MODEL: mod.AI_MODEL,
      AI_MODEL_HEAVY: mod.AI_MODEL_HEAVY,
      AI_MODEL_BULK_GRADING_WORKER: mod.AI_MODEL_BULK_GRADING_WORKER,
    };
  };

  it("설정된 모든 모델이 가격표에 존재한다", async () => {
    const models = await load();
    for (const [name, model] of Object.entries(models)) {
      expect(
        resolveModelPricing(model),
        `${name}="${model}" 가 lib/ai-pricing.ts 에 없다. 비용이 0 으로 기록된다.`
      ).not.toBeNull();
    }
  });

  it("폐기된 모델을 기본값으로 쓰지 않는다", async () => {
    // OpenAI 공식 문서가 deprecated 로 표시한 모델. GPT-5.6 이전을 권고한다.
    const DEPRECATED = ["gpt-5.3-chat-latest", "gpt-4o-mini", "gpt-4o", "gpt-4-turbo"];
    const models = await load();
    for (const [name, model] of Object.entries(models)) {
      expect(DEPRECATED, `${name} 이 폐기 모델 "${model}" 을 가리킨다`).not.toContain(model);
    }
  });

  it("세대가 섞이지 않는다", async () => {
    // 채점 워커만 4o 세대를 쓰던 시기가 있었다. 같은 세대로 묶어 둔다.
    const models = await load();
    const generations = new Set(
      Object.values(models).map((m) => m.match(/^gpt-(\d+\.\d+)/)?.[1] ?? m)
    );
    expect(
      generations.size,
      `서로 다른 세대가 섞였다: ${Object.values(models).join(", ")}`
    ).toBe(1);
  });
});
