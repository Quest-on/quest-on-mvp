/**
 * AI 태스크 프로필 — 선언형 설정 + 순수 해석 계층 (이슈 #118)
 *
 * 설계 원칙:
 *   1. 기본값 무변경 — 여기서 해석된 값은 현행 호출부가 실제로 보내던 값과 같아야 한다.
 *      "필드 부재"도 계약이다. optional 필드가 undefined 면 wire 에 키 자체가 없어야 한다.
 *   2. 한 snapshot, 한 operation — 요청 바디·모델·요청옵션·이벤트 버전이 하나의 컨텍스트에서 나온다.
 *   3. 재시도는 SDK 요청 옵션 한 층뿐. 여기서는 "요청된(requested)" 값만 정하고,
 *      deadline 예산에 따른 "실효(effective)" 값은 `lib/ai-deadline.ts` 가 따로 계산한다.
 *
 * 이 모듈은 순수하다 — I/O 없음, 전역 상태 없음.
 */

import type OpenAI from "openai";
import { resolveModelPricing } from "@/lib/ai-pricing";
import { AI_MODEL, AI_MODEL_HEAVY, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/ai-models";

// ── 태스크 / 엔드포인트 ────────────────────────────────────────────────

/** 프로필이 통제하는 태스크. 채점 6개 + SSE 보조 1개. */
export const AI_TASKS = [
  "auto_grading_question",
  "auto_grading_question_summary",
  "auto_grading_summary",
  "bulk_grading_score_cluster",
  "bulk_grading_criteria_extract",
  "bulk_grading_worker",
  "assignment_chat_stream",
] as const;

export type AiTask = (typeof AI_TASKS)[number];

export type AiEndpoint = "chat.completions" | "responses.create" | "responses.stream";

/**
 * 추론 강도. 프로바이더 문서 기준 집합이며 이슈 #118 본문의 실측 표와 같다.
 * 설치된 openai@5.15.0 의 타입은 `minimal|low|medium|high|null` 이라
 * `none` 과 `xhigh` 는 `toWireReasoningEffort` 의 격리 경계를 통과해야 한다.
 */
export const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** 설치된 SDK 타입이 그대로 받아주는 값. 나머지는 격리 어댑터를 거친다. */
const SDK_NATIVE_EFFORTS = new Set<string>(["low", "medium", "high"]);

// ── 프로필 형태 ────────────────────────────────────────────────────────

/** 해석 완료된 프로필. required 3개는 항상 존재하고 optional 3개는 부재가 유의미하다. */
export type ResolvedAiTaskProfile = {
  readonly model: string;
  readonly timeoutMs: number;
  /** 요청된 재시도 수. deadline clamp 는 이 값을 바꾸지 않는다. */
  readonly maxRetries: number;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly reasoningEffort?: ReasoningEffort;
};

/** 관리자가 저장하는 sparse override. 키 부재=상속, null=optional 명시적 제거. */
export type SparseAiTaskOverride = {
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxTokens?: number | null;
  temperature?: number | null;
  reasoningEffort?: ReasoningEffort | null;
};

export type SparseAiConfigOverrides = Partial<Record<AiTask, SparseAiTaskOverride>>;

export type AiProfileFieldSource = "code" | "global_env" | "task_env" | "admin";

export type AiTaskProfileSources = Partial<
  Record<keyof ResolvedAiTaskProfile, AiProfileFieldSource>
>;

// ── 태스크 레지스트리 ──────────────────────────────────────────────────

type TaskCapability = {
  readonly endpoint: AiEndpoint;
  /** 이 태스크가 프로필로 통제할 수 있는 optional 필드. */
  readonly supports: {
    readonly maxTokens: boolean;
    readonly temperature: boolean;
    readonly reasoningEffort: boolean;
  };
  /** 호출부가 소유하는 고정 필드 — 프로필이 절대 건드리지 않는다. */
  readonly callsiteOwnedFields: readonly string[];
};

export const TASK_REGISTRY: Readonly<Record<AiTask, TaskCapability>> = {
  auto_grading_question: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format"],
  },
  auto_grading_question_summary: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format", "seed"],
  },
  auto_grading_summary: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format"],
  },
  bulk_grading_score_cluster: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format"],
  },
  bulk_grading_criteria_extract: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format"],
  },
  bulk_grading_worker: {
    endpoint: "chat.completions",
    supports: { maxTokens: true, temperature: true, reasoningEffort: true },
    callsiteOwnedFields: ["messages", "response_format"],
  },
  assignment_chat_stream: {
    endpoint: "responses.stream",
    supports: { maxTokens: true, temperature: false, reasoningEffort: true },
    callsiteOwnedFields: [
      "instructions",
      "input",
      "previous_response_id",
      "store",
      "stream",
      "tools",
    ],
  },
};

// ── 코드 기본값 ────────────────────────────────────────────────────────

/**
 * 현행 프로덕션 동작을 그대로 옮긴 값. 바꾸면 baseline 테스트가 깨진다.
 *
 * `maxRetries` 는 이슈 #118 의 disposition 결과다:
 *   - 채점 6개 = 2 → SDK 호출 1회 + 재시도 2회 = 전송 시도 최대 3회.
 *     기존 수동 루프(MAX_GRADING_RETRIES)와 래퍼 루프의 최악값을 그대로 보존한다.
 *   - assignment_chat_stream = 0 → 유일한 의도적 예외. 현행 SSE 경로는 재시도가 없고,
 *     첫 토큰이 나간 뒤의 replay 는 안전하지 않다.
 */
export const CODE_DEFAULTS: Readonly<Record<AiTask, ResolvedAiTaskProfile>> = {
  auto_grading_question: { model: AI_MODEL_HEAVY, timeoutMs: 120_000, maxRetries: 2 },
  auto_grading_question_summary: {
    model: AI_MODEL_HEAVY,
    timeoutMs: 120_000,
    maxRetries: 2,
    temperature: 0.3,
  },
  auto_grading_summary: { model: AI_MODEL_HEAVY, timeoutMs: 120_000, maxRetries: 2 },
  bulk_grading_score_cluster: {
    model: AI_MODEL_BULK_GRADING_WORKER,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxTokens: 3000,
    temperature: 0,
  },
  bulk_grading_criteria_extract: {
    model: AI_MODEL_BULK_GRADING_WORKER,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxTokens: 800,
  },
  bulk_grading_worker: {
    model: AI_MODEL_BULK_GRADING_WORKER,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxTokens: 1500,
    temperature: 0,
  },
  assignment_chat_stream: { model: AI_MODEL, timeoutMs: 120_000, maxRetries: 0 },
};

// ── 모델 capability 레지스트리 ─────────────────────────────────────────

/**
 * 모델별 허용 effort. 미등록 모델은 effort 를 받지 못한다(fail-closed).
 * 이슈 #118: Luna 는 문서에 없는 값을 호출해야만 거부가 드러났으므로
 * 허용 목록을 코드에 명시하고 I/O 전에 막는다.
 */
const MODEL_EFFORT_SUPPORT: Readonly<Record<string, readonly ReasoningEffort[]>> = {
  "gpt-5.6-sol": REASONING_EFFORTS,
  "gpt-5.6-terra": REASONING_EFFORTS,
  "gpt-5.6-luna": REASONING_EFFORTS,
};

export function modelSupportsEffort(model: string, effort: ReasoningEffort): boolean {
  return (MODEL_EFFORT_SUPPORT[model] ?? []).includes(effort);
}

// ── 값 범위 ────────────────────────────────────────────────────────────

const BOUNDS = {
  timeoutMs: { min: 1_000, max: 120_000 },
  maxRetries: { min: 0, max: 2 },
  temperature: { min: 0, max: 2 },
} as const;

export class AiProfileInvalidError extends Error {
  readonly task: AiTask | null;
  readonly field: string;
  constructor(params: { task: AiTask | null; field: string; message: string }) {
    super(params.message);
    this.name = "AiProfileInvalidError";
    this.task = params.task;
    this.field = params.field;
  }
}

function isAiTask(value: string): value is AiTask {
  return (AI_TASKS as readonly string[]).includes(value);
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

function assertIntegerInRange(
  task: AiTask,
  field: "timeoutMs" | "maxRetries",
  value: number
): void {
  const { min, max } = BOUNDS[field];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AiProfileInvalidError({
      task,
      field,
      message: `${task}.${field} must be an integer in [${min}, ${max}] (got ${String(value)})`,
    });
  }
}

// ── sparse override 파싱 ───────────────────────────────────────────────

/**
 * 저장된 JSON 을 sparse override 로 정규화한다.
 * 키 부재와 명시적 null 을 구분해서 보존한다 — 이 구분이 상속 의미의 전부다.
 */
export function parseSparseOverrides(raw: unknown): SparseAiConfigOverrides {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AiProfileInvalidError({
      task: null,
      field: "overrides",
      message: "overrides must be a JSON object",
    });
  }

  const out: SparseAiConfigOverrides = {};
  for (const [taskKey, taskValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAiTask(taskKey)) {
      throw new AiProfileInvalidError({
        task: null,
        field: taskKey,
        message: `unknown task "${taskKey}"`,
      });
    }
    if (taskValue === null || typeof taskValue !== "object" || Array.isArray(taskValue)) {
      throw new AiProfileInvalidError({
        task: taskKey,
        field: "override",
        message: `${taskKey} override must be an object`,
      });
    }

    const src = taskValue as Record<string, unknown>;
    const override: SparseAiTaskOverride = {};

    if ("model" in src) {
      const model = src.model;
      if (typeof model !== "string" || model.trim() === "") {
        throw new AiProfileInvalidError({
          task: taskKey,
          field: "model",
          message: `${taskKey}.model must be a non-empty string (null is not allowed)`,
        });
      }
      override.model = model;
    }

    for (const field of ["timeoutMs", "maxRetries"] as const) {
      if (field in src) {
        const value = src[field];
        if (typeof value !== "number") {
          throw new AiProfileInvalidError({
            task: taskKey,
            field,
            message: `${taskKey}.${field} must be a number (null is not allowed)`,
          });
        }
        assertIntegerInRange(taskKey, field, value);
        override[field] = value;
      }
    }

    if ("maxTokens" in src) {
      const value = src.maxTokens;
      if (value !== null && (!Number.isInteger(value) || (value as number) <= 0)) {
        throw new AiProfileInvalidError({
          task: taskKey,
          field: "maxTokens",
          message: `${taskKey}.maxTokens must be a positive integer or null`,
        });
      }
      override.maxTokens = value as number | null;
    }

    if ("temperature" in src) {
      const value = src.temperature;
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < BOUNDS.temperature.min ||
          value > BOUNDS.temperature.max)
      ) {
        throw new AiProfileInvalidError({
          task: taskKey,
          field: "temperature",
          message: `${taskKey}.temperature must be a finite number in [0, 2] or null`,
        });
      }
      override.temperature = value as number | null;
    }

    if ("reasoningEffort" in src) {
      const value = src.reasoningEffort;
      if (value !== null && !isReasoningEffort(value)) {
        throw new AiProfileInvalidError({
          task: taskKey,
          field: "reasoningEffort",
          message: `${taskKey}.reasoningEffort must be one of ${REASONING_EFFORTS.join("|")} or null`,
        });
      }
      override.reasoningEffort = value as ReasoningEffort | null;
    }

    out[taskKey] = override;
  }
  return out;
}

// ── env 레이어 ─────────────────────────────────────────────────────────

export function taskEffortEnvKey(task: AiTask): string {
  return `AI_REASONING_EFFORT_${task.toUpperCase()}`;
}

export const GLOBAL_EFFORT_ENV_KEY = "AI_REASONING_EFFORT";

function readEffortFromEnv(
  env: Record<string, string | undefined>,
  key: string
): ReasoningEffort | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (!isReasoningEffort(value)) {
    throw new AiProfileInvalidError({
      task: null,
      field: key,
      message: `${key} must be one of ${REASONING_EFFORTS.join("|")} (got "${value}")`,
    });
  }
  return value;
}

// ── 해석 ───────────────────────────────────────────────────────────────

export type ResolveAiTaskProfileInput = {
  task: AiTask;
  overrides?: SparseAiConfigOverrides;
  env?: Record<string, string | undefined>;
};

export type ResolveAiTaskProfileResult = {
  profile: ResolvedAiTaskProfile;
  sources: AiTaskProfileSources;
};

/**
 * 우선순위: code default < global env < task env < admin sparse override.
 * optional 필드의 명시적 null 은 "상위 값을 끈다"는 뜻이라 결과에서 키가 사라진다.
 */
export function resolveAiTaskProfile(
  input: ResolveAiTaskProfileInput
): ResolveAiTaskProfileResult {
  const { task } = input;
  if (!isAiTask(task)) {
    throw new AiProfileInvalidError({ task: null, field: "task", message: `unknown task "${task}"` });
  }

  const env = input.env ?? process.env;
  const base = CODE_DEFAULTS[task];
  const capability = TASK_REGISTRY[task];

  let model = base.model;
  let timeoutMs = base.timeoutMs;
  let maxRetries = base.maxRetries;
  let maxTokens = base.maxTokens;
  let temperature = base.temperature;
  let reasoningEffort = base.reasoningEffort;

  const sources: AiTaskProfileSources = {
    model: "code",
    timeoutMs: "code",
    maxRetries: "code",
    ...(base.maxTokens !== undefined ? { maxTokens: "code" as const } : {}),
    ...(base.temperature !== undefined ? { temperature: "code" as const } : {}),
  };

  const globalEffort = readEffortFromEnv(env, GLOBAL_EFFORT_ENV_KEY);
  if (globalEffort !== undefined) {
    reasoningEffort = globalEffort;
    sources.reasoningEffort = "global_env";
  }

  const taskEffort = readEffortFromEnv(env, taskEffortEnvKey(task));
  if (taskEffort !== undefined) {
    reasoningEffort = taskEffort;
    sources.reasoningEffort = "task_env";
  }

  const override = input.overrides?.[task];
  if (override) {
    if (override.model !== undefined) {
      model = override.model;
      sources.model = "admin";
    }
    if (override.timeoutMs !== undefined) {
      timeoutMs = override.timeoutMs;
      sources.timeoutMs = "admin";
    }
    if (override.maxRetries !== undefined) {
      maxRetries = override.maxRetries;
      sources.maxRetries = "admin";
    }
    if ("maxTokens" in override) {
      maxTokens = override.maxTokens === null ? undefined : override.maxTokens;
      if (override.maxTokens === null) delete sources.maxTokens;
      else sources.maxTokens = "admin";
    }
    if ("temperature" in override) {
      temperature = override.temperature === null ? undefined : override.temperature;
      if (override.temperature === null) delete sources.temperature;
      else sources.temperature = "admin";
    }
    if ("reasoningEffort" in override) {
      reasoningEffort =
        override.reasoningEffort === null ? undefined : override.reasoningEffort;
      if (override.reasoningEffort === null) delete sources.reasoningEffort;
      else sources.reasoningEffort = "admin";
    }
  }

  // 태스크가 지원하지 않는 필드는 프로필에 실리지 않는다.
  if (!capability.supports.maxTokens) maxTokens = undefined;
  if (!capability.supports.temperature) temperature = undefined;
  if (!capability.supports.reasoningEffort) reasoningEffort = undefined;

  assertIntegerInRange(task, "timeoutMs", timeoutMs);
  assertIntegerInRange(task, "maxRetries", maxRetries);

  if (!resolveModelPricing(model)) {
    throw new AiProfileInvalidError({
      task,
      field: "model",
      message: `${task}.model "${model}" is not present in the pricing table; refusing to run an uncosted model`,
    });
  }

  if (reasoningEffort !== undefined && !modelSupportsEffort(model, reasoningEffort)) {
    throw new AiProfileInvalidError({
      task,
      field: "reasoningEffort",
      message: `model "${model}" does not support reasoning effort "${reasoningEffort}"`,
    });
  }

  const profile: ResolvedAiTaskProfile = Object.freeze({
    model,
    timeoutMs,
    maxRetries,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
  });

  return { profile, sources };
}

/** 저장된 full snapshot 이 지금도 유효한 프로필인지 검증한다(런 핀 경로). */
export function validatePinnedProfile(task: AiTask, raw: unknown): ResolvedAiTaskProfile {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AiProfileInvalidError({
      task,
      field: "snapshot",
      message: `${task} pinned snapshot must be an object`,
    });
  }
  const src = raw as Record<string, unknown>;

  if (typeof src.model !== "string" || src.model.trim() === "") {
    throw new AiProfileInvalidError({
      task,
      field: "model",
      message: `${task} pinned snapshot is missing model`,
    });
  }
  for (const field of ["timeoutMs", "maxRetries"] as const) {
    if (typeof src[field] !== "number") {
      throw new AiProfileInvalidError({
        task,
        field,
        message: `${task} pinned snapshot is missing ${field}`,
      });
    }
    assertIntegerInRange(task, field, src[field] as number);
  }
  if (src.reasoningEffort !== undefined && !isReasoningEffort(src.reasoningEffort)) {
    throw new AiProfileInvalidError({
      task,
      field: "reasoningEffort",
      message: `${task} pinned snapshot has an invalid reasoningEffort`,
    });
  }

  return Object.freeze({
    model: src.model,
    timeoutMs: src.timeoutMs as number,
    maxRetries: src.maxRetries as number,
    ...(typeof src.maxTokens === "number" ? { maxTokens: src.maxTokens } : {}),
    ...(typeof src.temperature === "number" ? { temperature: src.temperature } : {}),
    ...(src.reasoningEffort !== undefined
      ? { reasoningEffort: src.reasoningEffort as ReasoningEffort }
      : {}),
  });
}

// ── wire 변환 ──────────────────────────────────────────────────────────

/**
 * 격리된 호환 경계. **이 함수가 저장소에서 유일한 effort 캐스트 지점이다.**
 *
 * 설치된 openai@5.15.0 의 `ReasoningEffort` 는 `minimal|low|medium|high|null` 이라
 * 잠긴 wire 계약의 `none`/`xhigh` 를 타입으로 표현할 수 없다. 값 자체는 프로바이더가
 * 받으므로 downgrade 하지 않고 `unknown` 을 경유해 직렬화한다.
 * 레지스트리 검증(`modelSupportsEffort`)을 통과한 값만 여기 도달한다.
 */
function toWireReasoningEffort(effort: ReasoningEffort): unknown {
  if (SDK_NATIVE_EFFORTS.has(effort)) return effort;
  return effort as unknown;
}

/**
 * 변환기가 얹는 필드. `Record<string, unknown>` 을 반환하면 호출부마다 SDK 파라미터
 * 타입으로 캐스팅해야 하고, 그러면 격리하려던 캐스트가 저장소 전체로 번진다.
 * 그래서 얹는 필드를 정확히 선언해 호출부가 캐스트 없이 쓸 수 있게 한다.
 */
type ChatProfileFields = {
  model: string;
  max_completion_tokens?: number;
  temperature?: number;
  /**
   * 선언 타입은 SDK 의 좁은 union 을 쓰지만 런타임 값은 잠긴 wire 계약
   * (`none|low|medium|high|xhigh`)을 그대로 싣는다. 이 불일치를 **이 선언 한 곳에**
   * 가둬 두는 것이 목적이다 — 호출부마다 캐스팅하면 격리가 무너진다.
   */
  reasoning_effort?: OpenAI.ReasoningEffort;
};

type ResponsesProfileFields = {
  model: string;
  max_output_tokens?: number;
  temperature?: number;
  reasoning?: { effort: OpenAI.ReasoningEffort };
};

/** Chat Completions 바디에 프로필 소유 필드만 얹는다. 부재는 키 자체를 만들지 않는다. */
export function applyProfileToChatBody<T extends Record<string, unknown>>(
  profile: ResolvedAiTaskProfile,
  body: T
): T & ChatProfileFields {
  const out: Record<string, unknown> = { ...body, model: profile.model };
  if (profile.maxTokens !== undefined) out.max_completion_tokens = profile.maxTokens;
  if (profile.temperature !== undefined) out.temperature = profile.temperature;
  if (profile.reasoningEffort !== undefined) {
    out.reasoning_effort = toWireReasoningEffort(profile.reasoningEffort);
  }
  return out as T & ChatProfileFields;
}

/** Responses(create/stream) 바디. 토큰 필드 이름과 reasoning 모양이 Chat 과 다르다. */
export function applyProfileToResponsesBody<T extends Record<string, unknown>>(
  profile: ResolvedAiTaskProfile,
  body: T
): T & ResponsesProfileFields {
  const out: Record<string, unknown> = { ...body, model: profile.model };
  if (profile.maxTokens !== undefined) out.max_output_tokens = profile.maxTokens;
  if (profile.temperature !== undefined) out.temperature = profile.temperature;
  if (profile.reasoningEffort !== undefined) {
    out.reasoning = { effort: toWireReasoningEffort(profile.reasoningEffort) };
  }
  return out as T & ResponsesProfileFields;
}

/** 엔드포인트에 맞는 변환기를 고른다. */
export function applyProfileToBody<T extends Record<string, unknown>>(
  task: AiTask,
  profile: ResolvedAiTaskProfile,
  body: T
): T & ChatProfileFields & ResponsesProfileFields {
  return (
    TASK_REGISTRY[task].endpoint === "chat.completions"
      ? applyProfileToChatBody(profile, body)
      : applyProfileToResponsesBody(profile, body)
  ) as T & ChatProfileFields & ResponsesProfileFields;
}
