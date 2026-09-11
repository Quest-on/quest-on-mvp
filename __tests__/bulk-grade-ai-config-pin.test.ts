import { describe, expect, it } from "vitest";
import { bulkGradeWorkerSchema } from "@/lib/validations";
import {
  AiPinInvariantError,
  buildRunProfileSnapshot,
  createPinnedExecutionContext,
} from "@/lib/ai-execution-context";
import type { AiConfigVersionSnapshot } from "@/lib/ai-execution-context";
import type { AiTask } from "@/lib/ai-task-profile";

/**
 * 런 핀 불변식 (이슈 #118, AC-17/AC-21)
 *
 * 핵심 위험: `/bulk-grade/start` 가 학생 N 명을 팬아웃하고 워커가 몇 분에 걸쳐 돈다.
 * 그 사이 관리자가 설정을 바꾸면 같은 시험 학생들이 다른 설정으로 채점된다.
 * 런 시작 시 고정한 스냅샷만 쓰고, 핀이 깨지면 채점하지 않는 것으로 막는다.
 */

const VERSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PINNED_TASKS: readonly AiTask[] = [
  "bulk_grading_criteria_extract",
  "bulk_grading_worker",
  "bulk_grading_score_cluster",
];

const CLEAN_ENV: Record<string, string | undefined> = {};

function versionSnapshot(versionId: string, temperature: number): AiConfigVersionSnapshot {
  return {
    versionId,
    overrides: { bulk_grading_worker: { temperature } },
  };
}

const FAR_DEADLINE = 10_000_000;

describe("run pin — deterministic A-read / B-publish barrier (AC-21)", () => {
  it("keeps the whole run on version A even after B is published mid-run", () => {
    // 1) 런 시작: 버전 A 를 한 번 읽고 스냅샷을 고정한다.
    const versionA = versionSnapshot(VERSION_A, 0);
    const pinnedSnapshot = buildRunProfileSnapshot({
      tasks: PINNED_TASKS,
      version: versionA,
      env: CLEAN_ENV,
    });

    // 2) 런 도중 관리자가 B 를 발행한다(= 라벨이 옮겨진다).
    const versionB = versionSnapshot(VERSION_B, 1.5);
    expect(versionB.overrides.bulk_grading_worker?.temperature).toBe(1.5);

    // 3) 워커는 라벨을 다시 읽지 않고 고정된 스냅샷만 본다.
    const context = createPinnedExecutionContext({
      task: "bulk_grading_worker",
      configVersionId: VERSION_A,
      profileSnapshot: pinnedSnapshot,
      deadlineMs: FAR_DEADLINE,
      nowMs: 0,
    });

    expect(context.configVersionId).toBe(VERSION_A);
    expect(context.profile.temperature).toBe(0);
    expect(context.pinned).toBe(true);
  });

  it("pins every task the run can execute, not just the worker", () => {
    const snapshot = buildRunProfileSnapshot({
      tasks: PINNED_TASKS,
      version: versionSnapshot(VERSION_A, 0),
      env: CLEAN_ENV,
    });

    for (const task of PINNED_TASKS) {
      expect(snapshot[task]).toBeDefined();
      expect(snapshot[task].model).toBeTruthy();
    }
  });

  it("binds the request profile and the event version to one context", () => {
    const snapshot = buildRunProfileSnapshot({
      tasks: PINNED_TASKS,
      version: versionSnapshot(VERSION_A, 0),
      env: CLEAN_ENV,
    });
    const context = createPinnedExecutionContext({
      task: "bulk_grading_worker",
      configVersionId: VERSION_A,
      profileSnapshot: snapshot,
      deadlineMs: FAR_DEADLINE,
      nowMs: 0,
    });

    // 요청에 쓰는 모델과 이벤트에 찍히는 버전이 같은 객체에서 나온다.
    expect(context.profile.model).toBe(snapshot.bulk_grading_worker.model);
    expect(context.configVersionId).toBe(VERSION_A);
  });
});

describe("run pin — invariant breach never reaches OpenAI", () => {
  it("refuses when the run row has no pinned version", () => {
    expect(() =>
      createPinnedExecutionContext({
        task: "bulk_grading_worker",
        configVersionId: null,
        profileSnapshot: { bulk_grading_worker: {} },
        deadlineMs: FAR_DEADLINE,
      })
    ).toThrow(AiPinInvariantError);
  });

  it("refuses when the snapshot is missing entirely", () => {
    expect(() =>
      createPinnedExecutionContext({
        task: "bulk_grading_worker",
        configVersionId: VERSION_A,
        profileSnapshot: null,
        deadlineMs: FAR_DEADLINE,
      })
    ).toThrow(/AI_PIN_INVARIANT_BREACH/);
  });

  it("refuses when the snapshot has no profile for this task", () => {
    expect(() =>
      createPinnedExecutionContext({
        task: "bulk_grading_worker",
        configVersionId: VERSION_A,
        profileSnapshot: { bulk_grading_criteria_extract: {} },
        deadlineMs: FAR_DEADLINE,
      })
    ).toThrow(/does not contain a profile/);
  });

  it("refuses a structurally invalid pinned profile", () => {
    expect(() =>
      createPinnedExecutionContext({
        task: "bulk_grading_worker",
        configVersionId: VERSION_A,
        profileSnapshot: { bulk_grading_worker: { model: "x" } },
        deadlineMs: FAR_DEADLINE,
      })
    ).toThrow(/missing timeoutMs/);
  });
});

describe("QStash cutover sentinel", () => {
  const base = {
    gradingSessionId: "11111111-1111-4111-8111-111111111111",
    studentSessionId: "22222222-2222-4222-8222-222222222222",
    examId: "33333333-3333-4333-8333-333333333333",
    attemptId: "44444444-4444-4444-8444-444444444444",
  };

  it("accepts a legacy payload with no sentinel (pre-deploy queue drain)", () => {
    const parsed = bulkGradeWorkerSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.pinRequired).toBeUndefined();
  });

  it("accepts a new payload carrying both sentinel fields", () => {
    const parsed = bulkGradeWorkerSchema.safeParse({
      ...base,
      pinRequired: true,
      configVersionId: VERSION_A,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.configVersionId).toBe(VERSION_A);
  });

  it("rejects a sentinel without a config version — that combination is unenforceable", () => {
    const parsed = bulkGradeWorkerSchema.safeParse({ ...base, pinRequired: true });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-uuid config version", () => {
    const parsed = bulkGradeWorkerSchema.safeParse({
      ...base,
      pinRequired: true,
      configVersionId: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects pinRequired:false — the flag is a one-way cutover marker", () => {
    const parsed = bulkGradeWorkerSchema.safeParse({
      ...base,
      pinRequired: false,
      configVersionId: VERSION_A,
    });
    expect(parsed.success).toBe(false);
  });
});
