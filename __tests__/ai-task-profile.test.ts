import { describe, expect, it } from "vitest";
import {
  AI_TASKS,
  AiProfileInvalidError,
  CODE_DEFAULTS,
  GLOBAL_EFFORT_ENV_KEY,
  REASONING_EFFORTS,
  TASK_REGISTRY,
  modelSupportsEffort,
  parseSparseOverrides,
  resolveAiTaskProfile,
  taskEffortEnvKey,
  validatePinnedProfile,
} from "@/lib/ai-task-profile";
import { AI_MODEL_HEAVY } from "@/lib/ai-models";

const CLEAN_ENV: Record<string, string | undefined> = {};

describe("resolveAiTaskProfile — exhaustiveness and defaults", () => {
  it("resolves every declared task without throwing", () => {
    for (const task of AI_TASKS) {
      const { profile } = resolveAiTaskProfile({ task, env: CLEAN_ENV });
      expect(profile.model).toBeTruthy();
      expect(profile.timeoutMs).toBeGreaterThan(0);
      expect(profile.maxRetries).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects an unknown task", () => {
    expect(() =>
      resolveAiTaskProfile({ task: "not_a_task" as never, env: CLEAN_ENV })
    ).toThrow(AiProfileInvalidError);
  });

  it("marks code as the source when nothing overrides", () => {
    const { sources } = resolveAiTaskProfile({ task: "auto_grading_summary", env: CLEAN_ENV });
    expect(sources.model).toBe("code");
    expect(sources.timeoutMs).toBe("code");
    expect(sources.maxRetries).toBe("code");
  });
});

describe("resolveAiTaskProfile — precedence", () => {
  it("lets a task env key beat the global env key", () => {
    const env = {
      [GLOBAL_EFFORT_ENV_KEY]: "low",
      [taskEffortEnvKey("auto_grading_question")]: "high",
    };
    const { profile, sources } = resolveAiTaskProfile({ task: "auto_grading_question", env });
    expect(profile.reasoningEffort).toBe("high");
    expect(sources.reasoningEffort).toBe("task_env");
  });

  it("lets an admin override beat both env layers", () => {
    const env = { [taskEffortEnvKey("auto_grading_question")]: "high" };
    const { profile, sources } = resolveAiTaskProfile({
      task: "auto_grading_question",
      overrides: { auto_grading_question: { reasoningEffort: "low" } },
      env,
    });
    expect(profile.reasoningEffort).toBe("low");
    expect(sources.reasoningEffort).toBe("admin");
  });

  it("treats a missing key as inheritance and an explicit null as removal", () => {
    const inherited = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      overrides: { bulk_grading_worker: {} },
      env: CLEAN_ENV,
    }).profile;
    expect(inherited.temperature).toBe(0);
    expect(inherited.maxTokens).toBe(1500);

    const removed = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      overrides: { bulk_grading_worker: { temperature: null, maxTokens: null } },
      env: CLEAN_ENV,
    }).profile;
    expect(removed).not.toHaveProperty("temperature");
    expect(removed).not.toHaveProperty("maxTokens");
  });

  it("keeps the requested maxRetries independent of any deadline clamping", () => {
    const { profile } = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      overrides: { bulk_grading_worker: { maxRetries: 2 } },
      env: CLEAN_ENV,
    });
    // resolver 는 요청값만 담는다. 실효값은 lib/ai-deadline.ts 가 따로 만든다.
    expect(profile.maxRetries).toBe(2);
  });
});

describe("resolveAiTaskProfile — validation", () => {
  it("refuses a model that is missing from the pricing table", () => {
    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        overrides: { auto_grading_summary: { model: "totally-unpriced-model" } },
        env: CLEAN_ENV,
      })
    ).toThrow(/pricing table/);
  });

  it("refuses an effort the model does not support, before any I/O", () => {
    expect(modelSupportsEffort("gpt-5.6-luna", "high")).toBe(true);
    expect(modelSupportsEffort("gpt-4o-mini", "high")).toBe(false);

    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        overrides: { auto_grading_summary: { model: "gpt-4o-mini", reasoningEffort: "high" } },
        env: CLEAN_ENV,
      })
    ).toThrow(/does not support reasoning effort/);
  });

  it("rejects out-of-range numbers", () => {
    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        overrides: { auto_grading_summary: { maxRetries: 5 } },
        env: CLEAN_ENV,
      })
    ).toThrow(/maxRetries/);

    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        overrides: { auto_grading_summary: { timeoutMs: 10 } },
        env: CLEAN_ENV,
      })
    ).toThrow(/timeoutMs/);
  });

  it("rejects an invalid env effort value at resolve time", () => {
    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        env: { [GLOBAL_EFFORT_ENV_KEY]: "turbo" },
      })
    ).toThrow(/AI_REASONING_EFFORT/);
  });

  it("drops fields the task capability does not support", () => {
    expect(TASK_REGISTRY.assignment_chat_stream.supports.temperature).toBe(false);
    const { profile } = resolveAiTaskProfile({
      task: "assignment_chat_stream",
      overrides: { assignment_chat_stream: { temperature: 1 } },
      env: CLEAN_ENV,
    });
    expect(profile).not.toHaveProperty("temperature");
  });
});

describe("parseSparseOverrides", () => {
  it("preserves the difference between a missing key and an explicit null", () => {
    const parsed = parseSparseOverrides({
      auto_grading_summary: { temperature: null },
      bulk_grading_worker: { maxTokens: 1200 },
    });
    expect("temperature" in (parsed.auto_grading_summary ?? {})).toBe(true);
    expect(parsed.auto_grading_summary?.temperature).toBeNull();
    expect("temperature" in (parsed.bulk_grading_worker ?? {})).toBe(false);
    expect(parsed.bulk_grading_worker?.maxTokens).toBe(1200);
  });

  it("rejects unknown tasks and non-object payloads", () => {
    expect(() => parseSparseOverrides({ nope: {} })).toThrow(/unknown task/);
    expect(() => parseSparseOverrides([])).toThrow(/JSON object/);
    expect(() => parseSparseOverrides({ auto_grading_summary: 3 })).toThrow(/must be an object/);
  });

  it("refuses null for required fields", () => {
    expect(() => parseSparseOverrides({ auto_grading_summary: { model: null } })).toThrow(
      /null is not allowed/
    );
    expect(() => parseSparseOverrides({ auto_grading_summary: { maxRetries: null } })).toThrow(
      /null is not allowed/
    );
  });

  it("accepts every documented effort value", () => {
    for (const effort of REASONING_EFFORTS) {
      const parsed = parseSparseOverrides({ auto_grading_summary: { reasoningEffort: effort } });
      expect(parsed.auto_grading_summary?.reasoningEffort).toBe(effort);
    }
  });
});

describe("validatePinnedProfile", () => {
  it("round-trips a resolved profile", () => {
    const resolved = resolveAiTaskProfile({ task: "bulk_grading_worker", env: CLEAN_ENV }).profile;
    expect(validatePinnedProfile("bulk_grading_worker", resolved)).toEqual(resolved);
  });

  it("rejects a snapshot missing required fields", () => {
    expect(() => validatePinnedProfile("bulk_grading_worker", { model: AI_MODEL_HEAVY })).toThrow(
      /missing timeoutMs/
    );
    expect(() => validatePinnedProfile("bulk_grading_worker", null)).toThrow(/must be an object/);
  });

  it("keeps the frozen defaults reachable for pinned runs", () => {
    expect(CODE_DEFAULTS.bulk_grading_worker.maxTokens).toBe(1500);
  });
});
