"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  useExamTimer,
  formatExamTime,
  isExamTimeCritical,
  isExamTimeUrgent,
  type UseExamTimerOptions,
} from "@/hooks/useExamTimer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExamTimerProps extends UseExamTimerOptions {
  className?: string;
  /** When false, expiry dialog is not rendered (parent may handle it). Default true. */
  showExpiredDialog?: boolean;
}

export function ExamTimer({
  duration,
  sessionStartTime,
  timeRemaining: initialTimeRemaining,
  onTimeExpired,
  className,
  showExpiredDialog: renderExpiredDialog = true,
}: ExamTimerProps) {
  const t = useTranslations("exam");
  const {
    timeRemaining,
    hasExpired,
    showExpiredDialog,
    setShowExpiredDialog,
    isUnlimited,
  } = useExamTimer({
    duration,
    sessionStartTime,
    timeRemaining: initialTimeRemaining,
    onTimeExpired,
  });

  if (isUnlimited || timeRemaining === null) {
    return null;
  }

  const displaySeconds = hasExpired || timeRemaining <= 0 ? 0 : timeRemaining;
  const urgent = isExamTimeUrgent(displaySeconds);
  const critical = isExamTimeCritical(displaySeconds, duration);

  return (
    <>
      <div
        className={cn(
          "inline-flex items-center rounded-lg font-semibold transition-all",
          hasExpired || displaySeconds <= 0
            ? "px-3 py-1.5 text-sm bg-destructive/10 text-destructive dark:bg-destructive/20/30 dark:text-destructive"
            : urgent
              ? "px-4 py-2 text-base bg-destructive/20 text-destructive dark:bg-destructive/20/50 dark:text-destructive animate-pulse ring-2 ring-destructive"
              : critical
                ? "px-3 py-1.5 text-sm bg-destructive/10 text-destructive dark:bg-destructive/20/30 dark:text-destructive ring-1 ring-destructive"
                : "px-3 py-1.5 text-sm bg-info-subtle text-info-text",
          className,
        )}
        data-testid="exam-timer"
        aria-live="polite"
        aria-label={t("timer.ariaLabel", { time: formatExamTime(displaySeconds) })}
      >
        <Clock
          className={cn("mr-2 shrink-0", urgent ? "size-5" : "size-4")}
          aria-hidden="true"
        />
        {hasExpired || displaySeconds <= 0 ? "00:00" : formatExamTime(displaySeconds)}
      </div>

      {renderExpiredDialog && (
        <AlertDialog open={showExpiredDialog} onOpenChange={setShowExpiredDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                {t("timer.expiredTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("timer.expiredDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction className="min-h-[44px]">{t("timer.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
