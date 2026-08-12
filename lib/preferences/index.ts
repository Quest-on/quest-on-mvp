import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import type { OwnerId } from "@/lib/preferences/owner";
import {
  DEFAULT_MEMORY_BUDGET_TOKENS,
  MEMORY_RENDERER_VERSION,
  render,
} from "@/lib/preferences/render";
import {
  MEMORY_SELECTOR_VERSION,
  select,
  type SelectMemoryInput,
} from "@/lib/preferences/select";
import { recordMemoryApplication } from "@/lib/preferences/snapshot";

type PreferenceScope = Omit<SelectMemoryInput, "instructorId">;

type SnapshotDraft = {
  instructorId: OwnerId;
  examId: string | null;
  appliedMemoryIds: readonly string[];
  appliedVersions: readonly number[];
  renderedBlock: string;
  renderedHash: string;
  rendererVersion: string;
  selectorVersion: string;
  estimatedTokens: number;
};

type ModelCallRef = {
  feature: string;
  sessionId?: string | null;
  qIdx?: number | null;
  promptHash?: string | null;
};

export async function preparePreferences(owner: OwnerId, scope: PreferenceScope) {
  const selected = await select({ instructorId: owner, ...scope });
  const rendered = render(
    selected.map((record) => ({
      id: record.id,
      version: record.version,
      predicate: record.predicate,
      scope: record.scope,
      valueText: record.value_text,
    })),
    DEFAULT_MEMORY_BUDGET_TOKENS
  );

  const snapshotDraft: SnapshotDraft = Object.freeze({
    instructorId: owner,
    examId: scope.examId ?? null,
    appliedMemoryIds: Object.freeze([...rendered.usedIds]),
    appliedVersions: Object.freeze([...rendered.usedVersions]),
    renderedBlock: rendered.text,
    renderedHash: rendered.hash,
    rendererVersion: MEMORY_RENDERER_VERSION,
    selectorVersion: MEMORY_SELECTOR_VERSION,
    estimatedTokens: rendered.estimatedTokens,
  });

  return { text: rendered.text, snapshotDraft };
}

/**
 * Persist only after the model call succeeds. This function deliberately opens
 * no transaction, so no connection or user-facing write is held across the
 * model call.
 *
 * Streaming callers must await this before closing their stream. In particular,
 * generate-questions-stream closes its SSE controller in `finally`; writing
 * after `controller.close()` can be frozen by the deployment runtime and lost.
 */
export async function persistSnapshot(
  draft: SnapshotDraft,
  callRef: ModelCallRef
): Promise<void> {
  try {
    if (!callRef) {
      throw new Error("memory application snapshot: callRef is required");
    }

    await recordMemoryApplication({
      instructorId: draft.instructorId,
      examId: draft.examId,
      sessionId: callRef.sessionId ?? null,
      qIdx: callRef.qIdx ?? null,
      feature: callRef.feature,
      promptHash: callRef.promptHash ?? null,
      appliedMemoryIds: [...draft.appliedMemoryIds],
      appliedVersions: [...draft.appliedVersions],
      renderedBlock: draft.renderedBlock,
      rendererVersion: draft.rendererVersion,
      selectorVersion: draft.selectorVersion,
      estimatedTokens: draft.estimatedTokens,
    });
  } catch (error) {
    const details = {
      event: "memory_snapshot_failure",
      examId: draft.examId,
      sessionId: callRef?.sessionId ?? null,
      feature: callRef?.feature ?? null,
      renderedHash: draft.renderedHash,
      appliedMemoryIds: [...draft.appliedMemoryIds],
    };

    await Promise.allSettled([
      logError("Failed to persist memory application snapshot", error, {
        path: "lib/preferences/index.ts",
        user_id: draft.instructorId,
        additionalData: details,
      }),
      auditLog({
        action: "memory_snapshot_failure",
        userId: draft.instructorId,
        targetId: callRef?.sessionId ?? draft.examId ?? draft.instructorId,
        details: {
          ...details,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    ]);
  }
}
