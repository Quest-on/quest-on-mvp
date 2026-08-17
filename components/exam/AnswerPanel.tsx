"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { Save, AlertTriangle } from "lucide-react";

interface AnswerPanelProps {
  value: string;
  onChange: (value: string) => void;
  onPaste: (data: {
    pastedText: string;
    pasteStart: number;
    pasteEnd: number;
    answerLengthBefore: number;
    answerTextBefore: string;
    isInternal: boolean;
  }) => void;
  isSaving: boolean;
  lastSaved: string | null;
  saveError?: boolean;
  saveShortcut: ReactNode;
}

export function AnswerPanel({
  value,
  onChange,
  onPaste,
  isSaving,
  lastSaved,
  saveError = false,
  saveShortcut,
}: AnswerPanelProps) {
  const t = useTranslations("exam");
  return (
    <div className="h-full overflow-y-auto hide-scrollbar bg-muted/20">
      <div className="max-w-4xl mx-auto bg-background min-h-full">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Label className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
              <span className="text-muted-foreground">{t("answerPanel.label")}</span>
            </Label>

            <SaveStatusIndicator
              isSaving={isSaving}
              lastSaved={lastSaved}
              saveError={saveError}
              saveShortcut={saveShortcut}
            />
          </div>

          <div className="w-full space-y-4 mb-6 sm:mb-8">
            <div className="bg-background border border-border rounded-sm shadow-sm min-h-[60vh] sm:min-h-[70vh] lg:min-h-[1123px] w-full">
              <AnswerTextarea
                placeholder={t("answerPanel.placeholder")}
                value={value}
                onChange={onChange}
                onPaste={onPaste}
                className="!min-h-[60vh] sm:!min-h-[70vh] lg:!min-h-[1123px] !border-0 !shadow-none !focus:ring-0 !p-4 sm:!p-6 lg:!p-8 !text-base sm:!text-lg !leading-relaxed !font-sans !resize-none !bg-transparent !w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveStatusIndicator({
  isSaving,
  lastSaved,
  saveError,
  saveShortcut,
}: {
  isSaving: boolean;
  lastSaved: string | null;
  saveError?: boolean;
  saveShortcut: ReactNode;
}) {
  const t = useTranslations("exam");

  if (saveError) {
    return (
      <div data-testid="save-status" className="flex items-center gap-2 text-xs sm:text-sm text-destructive">
        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
        <span className="font-medium">{t("answerPanel.saveError")}</span>
        <span className="hidden sm:flex items-center gap-1 text-xs">
          <span>•</span>
          {saveShortcut}
          <span>{t("answerPanel.saveRetryHint")}</span>
        </span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div data-testid="save-status" className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-primary border-t-transparent" />
        <span className="font-medium">{t("answerPanel.saving")}</span>
      </div>
    );
  }

  if (lastSaved) {
    return (
      <div
        key={lastSaved}
        data-testid="save-status"
        className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground animate-in fade-in duration-300"
      >
        <div className="flex items-center gap-1.5">
          <Save
            className="w-3 h-3 sm:w-4 sm:h-4 text-success-text animate-in zoom-in duration-300"
            aria-hidden="true"
          />
          <span className="font-medium text-success-text">
            {t("answerPanel.saved")}
          </span>
        </div>
        <span className="hidden sm:inline">•</span>
        <span className="text-xs">{lastSaved}</span>
        <span className="hidden sm:flex items-center gap-1 text-xs">
          <span>•</span>
          {saveShortcut}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="save-status" className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
      <Save className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
      <span>{t("answerPanel.autoSave")}</span>
      <span className="hidden sm:flex items-center gap-1 text-xs">
        <span>•</span>
        {saveShortcut}
      </span>
    </div>
  );
}
