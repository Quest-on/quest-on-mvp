import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REASONING_EFFORTS,
  applyProfileToChatBody,
  applyProfileToResponsesBody,
  resolveAiTaskProfile,
} from "@/lib/ai-task-profile";

/**
 * `xhigh` / `none` 호환 경계 (이슈 #118, 계획 옵션 4-A)
 *
 * 설치된 openai@5.15.0 의 ReasoningEffort 타입은 `minimal|low|medium|high|null` 이라
 * 잠긴 wire 계약(`none|low|medium|high|xhigh`)을 타입으로 표현하지 못한다.
 * 계획이 허용한 해법은 **translator 한 곳에서만** 격리 변환하는 것이다.
 * downgrade(예: xhigh→high)나 broad `any` 확산은 계약 위반이다.
 */

const CLEAN_ENV: Record<string, string | undefined> = {};

function profileWithEffort(effort: (typeof REASONING_EFFORTS)[number]) {
  return resolveAiTaskProfile({
    task: "auto_grading_summary",
    overrides: { auto_grading_summary: { reasoningEffort: effort } },
    env: CLEAN_ENV,
  }).profile;
}

describe("reasoning effort wire compatibility", () => {
  it("serializes every documented effort verbatim on Chat Completions", () => {
    for (const effort of REASONING_EFFORTS) {
      const body = applyProfileToChatBody(profileWithEffort(effort), { messages: [] });
      expect(body.reasoning_effort).toBe(effort);
    }
  });

  it("serializes every documented effort verbatim on Responses", () => {
    for (const effort of REASONING_EFFORTS) {
      const body = applyProfileToResponsesBody(profileWithEffort(effort), { input: "x" });
      expect(body.reasoning).toEqual({ effort });
    }
  });

  it("never downgrades xhigh or none", () => {
    const chat = applyProfileToChatBody(profileWithEffort("xhigh"), { messages: [] });
    expect(chat.reasoning_effort).toBe("xhigh");
    expect(chat.reasoning_effort).not.toBe("high");

    const none = applyProfileToChatBody(profileWithEffort("none"), { messages: [] });
    expect(none.reasoning_effort).toBe("none");
  });

  it("survives JSON serialization unchanged (what actually reaches the API)", () => {
    const body = applyProfileToChatBody(profileWithEffort("xhigh"), { messages: [] });
    expect(JSON.parse(JSON.stringify(body)).reasoning_effort).toBe("xhigh");
  });

  it("uses the endpoint-correct token field name", () => {
    const profile = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      env: CLEAN_ENV,
    }).profile;

    expect(applyProfileToChatBody(profile, {}).max_completion_tokens).toBe(1500);
    expect(applyProfileToResponsesBody(profile, {}).max_output_tokens).toBe(1500);
    expect(applyProfileToChatBody(profile, {})).not.toHaveProperty("max_output_tokens");
    expect(applyProfileToResponsesBody(profile, {})).not.toHaveProperty("max_completion_tokens");
  });

  it("keeps the compatibility cast confined to the translator module", () => {
    // 구조 불변식: effort 캐스트가 호출부로 번지면 계약이 조용히 깨진다.
    const source = readFileSync(
      path.join(process.cwd(), "lib", "ai-task-profile.ts"),
      "utf8"
    );
    const castSites = source.match(/as unknown/g) ?? [];
    expect(castSites.length).toBeLessThanOrEqual(1);
    expect(source).not.toMatch(/as any/);
  });
});
