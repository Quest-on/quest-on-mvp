/**
 * AI 실행 컨텍스트 (이슈 #118)
 *
 * 하나의 컨텍스트가 요청 바디·모델·SDK 요청 옵션·이벤트에 찍힐 config 버전을 모두 묶는다.
 * 이유: resolver 와 tracker 가 각각 production 라벨을 다시 읽으면 A 를 보내고 B 를 기록하는
 * 어긋남이 생긴다. 컨텍스트를 만들 때 버전을 한 번만 고정하고 그 뒤로는 재조회하지 않는다.
 *
 * 두 로더가 같은 모양을 반환한다:
 *   - current  : 관리자 설정의 현재 버전으로 해석 (상시 경로)
 *   - pinned   : 벌크 런 시작 시 고정된 full snapshot 을 검증해서 사용 (공정성 경로)
 */

import {
  type AiEndpoint,
  type AiTask,
  type AiTaskProfileSources,
  type ResolvedAiTaskProfile,
  type SparseAiConfigOverrides,
  TASK_REGISTRY,
  resolveAiTaskProfile,
  validatePinnedProfile,
} from "@/lib/ai-task-profile";
import { type AiRequestBudget, resolveAiRequestBudget } from "@/lib/ai-deadline";

export type AiExecutionContext = {
  readonly task: AiTask;
  /** 이 요청이 실제로 사용한 설정 버전. 이벤트에도 이 값이 찍힌다. */
  readonly configVersionId: string;
  readonly profile: ResolvedAiTaskProfile;
  readonly endpoint: AiEndpoint;
  readonly budget: AiRequestBudget;
  readonly sources: AiTaskProfileSources;
  readonly pinned: boolean;
};

/** 관리자 설정 저장소가 한 번 읽어 온 스냅샷. */
export type AiConfigVersionSnapshot = {
  readonly versionId: string;
  readonly overrides: SparseAiConfigOverrides;
};

/** 상시 경로 — 현재 production 버전으로 해석한다. */
export function createCurrentExecutionContext(params: {
  task: AiTask;
  version: AiConfigVersionSnapshot;
  deadlineMs: number;
  nowMs?: number;
  externalSignal?: AbortSignal;
  env?: Record<string, string | undefined>;
}): AiExecutionContext {
  const { profile, sources } = resolveAiTaskProfile({
    task: params.task,
    overrides: params.version.overrides,
    env: params.env,
  });

  return Object.freeze({
    task: params.task,
    configVersionId: params.version.versionId,
    profile,
    endpoint: TASK_REGISTRY[params.task].endpoint,
    budget: resolveAiRequestBudget({
      profile,
      deadlineMs: params.deadlineMs,
      nowMs: params.nowMs,
      externalSignal: params.externalSignal,
    }),
    sources,
    pinned: false,
  });
}

export class AiPinInvariantError extends Error {
  readonly task: AiTask;
  constructor(task: AiTask, message: string) {
    super(`AI_PIN_INVARIANT_BREACH: ${message}`);
    this.name = "AiPinInvariantError";
    this.task = task;
  }
}

/**
 * 공정성 경로 — 런 시작 시 고정된 스냅샷만 쓴다.
 * 라벨을 다시 읽지 않으므로 런 도중 관리자가 설정을 바꿔도 이 런은 흔들리지 않는다.
 */
export function createPinnedExecutionContext(params: {
  task: AiTask;
  configVersionId: string | null;
  profileSnapshot: unknown;
  deadlineMs: number;
  nowMs?: number;
  externalSignal?: AbortSignal;
}): AiExecutionContext {
  if (!params.configVersionId) {
    throw new AiPinInvariantError(
      params.task,
      `${params.task} requires a pinned config version but the run row has none`
    );
  }
  if (params.profileSnapshot === null || params.profileSnapshot === undefined) {
    throw new AiPinInvariantError(
      params.task,
      `${params.task} requires a pinned profile snapshot but the run row has none`
    );
  }

  const snapshot = params.profileSnapshot as Record<string, unknown>;
  const taskSnapshot = snapshot[params.task];
  if (taskSnapshot === undefined) {
    throw new AiPinInvariantError(
      params.task,
      `pinned snapshot does not contain a profile for ${params.task}`
    );
  }

  const profile = validatePinnedProfile(params.task, taskSnapshot);

  return Object.freeze({
    task: params.task,
    configVersionId: params.configVersionId,
    profile,
    endpoint: TASK_REGISTRY[params.task].endpoint,
    budget: resolveAiRequestBudget({
      profile,
      deadlineMs: params.deadlineMs,
      nowMs: params.nowMs,
      externalSignal: params.externalSignal,
    }),
    sources: { model: "admin" } satisfies AiTaskProfileSources,
    pinned: true,
  });
}

/** 런 시작 시 저장할 full snapshot 을 만든다(모든 태스크를 한 번에 고정). */
export function buildRunProfileSnapshot(params: {
  tasks: readonly AiTask[];
  version: AiConfigVersionSnapshot;
  env?: Record<string, string | undefined>;
}): Record<string, ResolvedAiTaskProfile> {
  const out: Record<string, ResolvedAiTaskProfile> = {};
  for (const task of params.tasks) {
    out[task] = resolveAiTaskProfile({
      task,
      overrides: params.version.overrides,
      env: params.env,
    }).profile;
  }
  return out;
}

/** 이벤트 메타데이터에 남길 재시도 예산 상세. */
export function budgetMetadata(context: AiExecutionContext): Record<string, unknown> {
  return {
    config_version: context.configVersionId,
    requested_max_retries: context.budget.requestedMaxRetries,
    effective_max_retries: context.budget.effectiveMaxRetries,
    transport_attempts_upper_bound: context.budget.transportAttemptsUpperBound,
    attempt_timeout_ms: context.budget.timeout,
    remaining_budget_ms: context.budget.remainingBudgetMs,
    profile_pinned: context.pinned,
  };
}
