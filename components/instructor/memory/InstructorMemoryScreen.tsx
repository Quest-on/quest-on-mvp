"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Brain, EyeOff } from "lucide-react";
import { qk } from "@/lib/query-keys";
import {
  archiveInstructorMemory,
  fetchInstructorMemories,
  updateMemorySettings,
  type MemorySettingsAction,
} from "@/lib/instructor-memory";
import { MemoryConsentNotice } from "./MemoryConsentNotice";
import { MemoryObservationControls } from "./MemoryObservationControls";
import { MemoryRecordList } from "./MemoryRecordList";

/**
 * 교수 메모리 화면.
 *
 * 주입 스위치가 꺼져 있어도 이 화면은 동작한다. 이번 릴리스는 shadow 모드로 나가고,
 * 기록은 쌓이되 프롬프트에 들어가지 않는다. 그래도 교수는 자기에 대해 무엇이 학습됐는지
 * 보고 지울 수 있어야 하므로, 이 화면을 주입 플래그 뒤에 숨기지 않는다.
 */
export function InstructorMemoryScreen() {
  const t = useTranslations("instructor.memory");
  const queryClient = useQueryClient();
  const memoryQueryKey = qk.instructor.memory();

  const [pauseOverride, setPauseOverride] = useState<boolean | null>(null);

  const { data: records = [], status, refetch } = useQuery({
    queryKey: memoryQueryKey,
    queryFn: fetchInstructorMemories,
  });

  // 삭제 후 목록이 새로고침 없이 갱신되는 지점. 이 invalidateQueries 하나가 그것을 만든다.
  const deleteMutation = useMutation({
    mutationFn: archiveInstructorMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryQueryKey });
      toast.success(t("delete.success"));
    },
    onError: () => toast.error(t("delete.error")),
  });

  const settingsMutation = useMutation({
    mutationFn: (action: MemorySettingsAction) => updateMemorySettings(action),
    onSuccess: (_result, action) => {
      queryClient.invalidateQueries({ queryKey: memoryQueryKey });
      if (action === "pause") {
        setPauseOverride(true);
        toast.success(t("controls.pause.successPaused"));
      } else if (action === "resume") {
        setPauseOverride(false);
        toast.success(t("controls.pause.successResumed"));
      } else {
        setPauseOverride(null);
        toast.success(t("controls.reset.success"));
      }
    },
    onError: () => toast.error(t("error.settingsFailed")),
  });

  const derivedPaused =
    records.length > 0 && records.every((record) => record.status === "quarantined");
  const isPaused = pauseOverride ?? derivedPaused;

  const pendingAction = settingsMutation.isPending ? settingsMutation.variables : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Brain className="size-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("pageTitle")}
          </h1>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("pageSubtitle")}
        </p>

        {/* shadow 모드 고지 — 이 화면은 주입 플래그와 무관하게 항상 보인다. */}
        <div
          data-testid="memory-shadow-notice"
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4"
        >
          <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t("shadow.badge")}</Badge>
              <span className="text-sm font-semibold text-foreground">
                {t("shadow.title")}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("shadow.body")}
            </p>
          </div>
        </div>
      </header>

      <MemoryConsentNotice />

      <MemoryObservationControls
        isPaused={isPaused}
        onPause={() => settingsMutation.mutate("pause")}
        onResume={() => settingsMutation.mutate("resume")}
        onReset={() => settingsMutation.mutate("reset")}
        pausePending={pendingAction === "pause" || pendingAction === "resume"}
        resetPending={pendingAction === "reset"}
      />

      <MemoryRecordList
        status={status}
        records={records}
        onDelete={(memoryId) => deleteMutation.mutate(memoryId)}
        onRetry={() => void refetch()}
        deletingId={deleteMutation.isPending ? deleteMutation.variables : null}
      />
    </div>
  );
}
