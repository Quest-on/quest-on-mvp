"use client";

import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExamTimer } from "@/components/exam/ExamTimer";
import { cn } from "@/lib/utils";

interface ExamCenterToolbarProps {
  examTitle: string;
  duration: number;
  sessionStartTime?: string | null;
  timeRemaining?: number | null;
  onTimeExpired?: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  /** Subjective only: collapse/expand question panel */
  showQuestionToggle?: boolean;
  isQuestionVisible?: boolean;
  onToggleQuestion?: () => void;
  className?: string;
}

export function ExamCenterToolbar({
  examTitle,
  duration,
  sessionStartTime,
  timeRemaining,
  onTimeExpired,
  onSubmit,
  isSubmitting,
  showQuestionToggle = false,
  isQuestionVisible = true,
  onToggleQuestion,
  className,
}: ExamCenterToolbarProps) {
  const t = useTranslations("exam");
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border bg-background/95 backdrop-blur-sm px-3 py-2 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {showQuestionToggle && onToggleQuestion && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleQuestion}
            className="shrink-0 gap-1.5 min-h-[40px] text-info-text border-primary hover:bg-blue-50"
            aria-label={isQuestionVisible ? t("toolbar.hideQuestion") : t("toolbar.showQuestion")}
            aria-expanded={isQuestionVisible}
          >
            <FileText className="size-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">
              {isQuestionVisible ? t("toolbar.hideQuestion") : t("toolbar.showQuestion")}
            </span>
            {isQuestionVisible ? (
              <ChevronUp className="size-4 opacity-50 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 opacity-50 shrink-0" aria-hidden="true" />
            )}
          </Button>
        )}
        <h2 className="text-sm sm:text-base font-semibold text-foreground truncate min-w-0">
          {examTitle}
        </h2>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0">
        <ExamTimer
          duration={duration}
          sessionStartTime={sessionStartTime}
          timeRemaining={timeRemaining}
          onTimeExpired={onTimeExpired}
        />
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="min-h-[44px] text-sm font-semibold shadow-md hover:shadow-lg px-4 sm:px-6"
          size="lg"
          aria-label={t("toolbar.submitAriaLabel")}
          data-testid="exam-submit-btn"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent mr-2" />
              {t("toolbar.submitting")}
            </>
          ) : (
            t("toolbar.submitButton")
          )}
        </Button>
      </div>
    </div>
  );
}
