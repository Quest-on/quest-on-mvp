import { describe, expect, it } from "vitest";
import {
  AI_TASKS,
  CODE_DEFAULTS,
  type AiTask,
  applyProfileToBody,
  resolveAiTaskProfile,
} from "@/lib/ai-task-profile";
import { AI_MODEL, AI_MODEL_HEAVY, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/ai-models";

/**
 * Baseline 동결 (이슈 #118 Phase 0)
 *
 * 이 파일은 구현보다 먼저 작성됐다. 여기 적힌 값은 리팩터링 이전에 각 호출부가
 * OpenAI 로 **실제로 보내던 바디**를 코드에서 그대로 읽어 옮긴 것이다.
 * (검증 시점 HEAD: origin/staging @ 2cdf58d)
 *
 *   lib/grading.ts:338-348          auto_grading_question
 *   lib/grading.ts:616-628          auto_grading_question_summary
 *   lib/grading.ts:1691-1698        auto_grading_summary
 *   lib/bulk-grade-score-cluster.ts:250-256   bulk_grading_score_cluster
 *   lib/bulk-grading-criteria.ts:169-177      bulk_grading_criteria_extract
 *   app/api/internal/bulk-grade-worker/route.ts:160-166  bulk_grading_worker
 *   app/api/assignment-chat/route.ts:140-148  assignment_chat_stream
 *
 * 이 테스트가 깨지면 스냅샷을 고치기 전에 **왜 프로덕션 요청이 바뀌었는지** 먼저 답해야 한다.
 * 계획의 risk gate: "baseline mismatch is a risk gate, not an invitation to update snapshots blindly."
 */

const NO_OVERRIDES = {};
const CLEAN_ENV: Record<string, string | undefined> = {};

function profileFor(task: AiTask) {
  return resolveAiTaskProfile({ task, overrides: NO_OVERRIDES, env: CLEAN_ENV }).profile;
}

describe("ai task profile — production baseline freeze", () => {
  it("covers every task exactly once", () => {
    expect(AI_TASKS).toHaveLength(7);
    expect(new Set(AI_TASKS).size).toBe(7);
    for (const task of AI_TASKS) {
      expect(CODE_DEFAULTS[task]).toBeDefined();
    }
  });

  it("auto_grading_question keeps model only — no token cap, no temperature", () => {
    const body = applyProfileToBody("auto_grading_question", profileFor("auto_grading_question"), {
      messages: [],
      response_format: { type: "json_object" },
    });

    expect(body.model).toBe(AI_MODEL_HEAVY);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("reasoning_effort");
    // 호출부 소유 필드는 그대로 통과한다.
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("auto_grading_question_summary keeps temperature 0.3 and leaves seed to the callsite", () => {
    const body = applyProfileToBody(
      "auto_grading_question_summary",
      profileFor("auto_grading_question_summary"),
      { messages: [], response_format: { type: "json_object" }, seed: 12345 }
    );

    expect(body.model).toBe(AI_MODEL_HEAVY);
    expect(body.temperature).toBe(0.3);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body.seed).toBe(12345);
  });

  it("auto_grading_summary keeps model only", () => {
    const body = applyProfileToBody("auto_grading_summary", profileFor("auto_grading_summary"), {
      messages: [],
      response_format: { type: "json_object" },
    });

    expect(body.model).toBe(AI_MODEL_HEAVY);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("bulk_grading_score_cluster keeps max 3000 and temperature 0", () => {
    const body = applyProfileToBody(
      "bulk_grading_score_cluster",
      profileFor("bulk_grading_score_cluster"),
      { messages: [], response_format: { type: "json_object" } }
    );

    expect(body.model).toBe(AI_MODEL_BULK_GRADING_WORKER);
    expect(body.max_completion_tokens).toBe(3000);
    expect(body.temperature).toBe(0);
  });

  it("bulk_grading_criteria_extract keeps max 800 with no temperature", () => {
    const body = applyProfileToBody(
      "bulk_grading_criteria_extract",
      profileFor("bulk_grading_criteria_extract"),
      { messages: [], response_format: { type: "json_object" } }
    );

    expect(body.model).toBe(AI_MODEL_BULK_GRADING_WORKER);
    expect(body.max_completion_tokens).toBe(800);
    expect(body).not.toHaveProperty("temperature");
  });

  it("bulk_grading_worker keeps max 1500 and temperature 0", () => {
    const body = applyProfileToBody("bulk_grading_worker", profileFor("bulk_grading_worker"), {
      messages: [],
      response_format: { type: "json_object" },
    });

    expect(body.model).toBe(AI_MODEL_BULK_GRADING_WORKER);
    expect(body.max_completion_tokens).toBe(1500);
    expect(body.temperature).toBe(0);
  });

  it("assignment_chat_stream preserves the Responses static body and adds no token cap", () => {
    const body = applyProfileToBody("assignment_chat_stream", profileFor("assignment_chat_stream"), {
      instructions: "sys",
      input: "hello",
      previous_response_id: undefined,
      store: true,
      stream: true,
      tools: [{ type: "web_search_preview" }],
    });

    expect(body.model).toBe(AI_MODEL);
    // Responses 는 max_output_tokens 를 쓰지만 현행 호출은 토큰 상한이 없다.
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("temperature");
    expect(body.store).toBe(true);
    expect(body.stream).toBe(true);
    expect(body.tools).toEqual([{ type: "web_search_preview" }]);
  });

  it("freezes the requested retry defaults agreed in the plan", () => {
    // 채점 6개는 전송 시도 최대 3회(1 + 2)를 보존한다.
    expect(CODE_DEFAULTS.auto_grading_question.maxRetries).toBe(2);
    expect(CODE_DEFAULTS.auto_grading_question_summary.maxRetries).toBe(2);
    expect(CODE_DEFAULTS.auto_grading_summary.maxRetries).toBe(2);
    expect(CODE_DEFAULTS.bulk_grading_score_cluster.maxRetries).toBe(2);
    expect(CODE_DEFAULTS.bulk_grading_criteria_extract.maxRetries).toBe(2);
    expect(CODE_DEFAULTS.bulk_grading_worker.maxRetries).toBe(2);
    // SSE 만 의도적 예외 — 현행 무재시도 동작을 그대로 둔다.
    expect(CODE_DEFAULTS.assignment_chat_stream.maxRetries).toBe(0);
  });

  it("never emits a wire key for an absent optional field", () => {
    for (const task of AI_TASKS) {
      const profile = profileFor(task);
      const body = applyProfileToBody(task, profile, {});
      if (profile.maxTokens === undefined) {
        expect(body).not.toHaveProperty("max_completion_tokens");
        expect(body).not.toHaveProperty("max_output_tokens");
      }
      if (profile.temperature === undefined) {
        expect(body).not.toHaveProperty("temperature");
      }
      if (profile.reasoningEffort === undefined) {
        expect(body).not.toHaveProperty("reasoning_effort");
        expect(body).not.toHaveProperty("reasoning");
      }
    }
  });
});
