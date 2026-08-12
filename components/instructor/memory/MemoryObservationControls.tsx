"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Info, Loader2, PauseCircle, PlayCircle, ShieldAlert } from "lucide-react";
import { MemoryDeletionDisclosure } from "./MemoryDeletionDisclosure";

export interface MemoryObservationControlsProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  pausePending?: boolean;
  resetPending?: boolean;
}

/**
 * 일시중지와 초기화를 절대 하나의 토글로 합치지 않는다.
 *
 * 스위치 하나로 'off' 만 보여 주면 교수는 자기 데이터가 남아 있는지 사라졌는지 알 수 없다.
 * 그 모호함이 이 분리가 막으려는 실패 그 자체다.
 *   · 일시중지 → 전부 남기고, 쓰는 것만 멈춘다
 *   · 초기화   → 전부 보관 처리한다
 * 두 카드는 테두리·배경·아이콘·버튼 변형·배지까지 다르게 두어 눈으로도 구분되게 한다.
 */
export function MemoryObservationControls({
  isPaused,
  onPause,
  onResume,
  onReset,
  pausePending = false,
  resetPending = false,
}: MemoryObservationControlsProps) {
  const t = useTranslations("instructor.memory");
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <section className="space-y-4" data-testid="memory-observation-controls">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{t("controls.title")}</h2>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{t("controls.distinctionNote")}</span>
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 유지형 제어 — 중립 톤, outline 버튼 */}
        <Card data-testid="memory-pause-control" className="border-border bg-muted/30">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <PauseCircle className="size-4 text-foreground" aria-hidden="true" />
              <CardTitle className="text-base">{t("controls.pause.title")}</CardTitle>
              <Badge variant="secondary">{t("controls.pause.keepsDataBadge")}</Badge>
            </div>
            <CardDescription>{t("controls.pause.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              disabled={pausePending}
              data-testid={isPaused ? "memory-resume-button" : "memory-pause-button"}
              onClick={isPaused ? onResume : onPause}
            >
              {pausePending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : isPaused ? (
                <PlayCircle className="size-4" aria-hidden="true" />
              ) : (
                <PauseCircle className="size-4" aria-hidden="true" />
              )}
              {pausePending
                ? t("controls.pause.pending")
                : isPaused
                  ? t("controls.pause.resumeAction")
                  : t("controls.pause.action")}
            </Button>
          </CardContent>
        </Card>

        {/* 파괴형 제어 — destructive 톤, 확인 대화상자 필수 */}
        <Card
          data-testid="memory-reset-control"
          className="border-destructive/40 bg-destructive/5"
        >
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
              <CardTitle className="text-base text-destructive">
                {t("controls.reset.title")}
              </CardTitle>
              <Badge variant="destructive">{t("controls.reset.archivesAllBadge")}</Badge>
            </div>
            <CardDescription>{t("controls.reset.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              {t("controls.reset.sectionLabel")}
            </p>

            <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={resetPending}
                  data-testid="memory-reset-button"
                >
                  {resetPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="size-4" aria-hidden="true" />
                  )}
                  {resetPending ? t("controls.reset.pending") : t("controls.reset.action")}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent data-testid="memory-reset-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("controls.reset.confirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("controls.reset.confirmIntro")}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <MemoryDeletionDisclosure variant="reset" />

                <AlertDialogFooter>
                  <AlertDialogCancel>{t("controls.reset.confirmCancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="memory-reset-confirm"
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={onReset}
                  >
                    {t("controls.reset.confirmAction")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
