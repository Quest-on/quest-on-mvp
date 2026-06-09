"use client";

import { ReactNode } from "react";
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
  fullHeight?: boolean;
}

export function AnswerPanel({
  value,
  onChange,
  onPaste,
  isSaving,
  lastSaved,
  saveError = false,
  saveShortcut,
  fullHeight = false,
}: AnswerPanelProps) {
  return (
    <div
      className={`${fullHeight ? "h-full" : ""} overflow-y-auto hide-scrollbar bg-muted/20`}
    >
      <div
        className={`max-w-4xl mx-auto bg-background ${fullHeight ? "min-h-full" : ""}`}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Label className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
              <span className="text-muted-foreground">답안 작성</span>
            </Label>

            <SaveStatusIndicator
              isSaving={isSaving}
              lastSaved={lastSaved}
              saveError={saveError}
              saveShortcut={saveShortcut}
            />
          </div>

          <div className="w-full space-y-4 mb-6 sm:mb-8">
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-sm shadow-sm min-h-[60vh] sm:min-h-[70vh] lg:min-h-[1123px] w-full">
              <AnswerTextarea
                placeholder={
                  "여기에 상세한 답안을 작성하세요...\n\n• 문제의 핵심을 파악하여 답변하세요\n• 풀이 과정을 단계별로 명확히 작성하세요\n• AI와의 대화를 통해 필요한 정보를 얻을 수 있습니다"
                }
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
  if (saveError) {
    return (
      <div data-testid="save-status" className="flex items-center gap-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
        <span className="font-medium">저장 실패 — 네트워크를 확인하세요</span>
        <span className="hidden sm:flex items-center gap-1 text-xs">
          <span>•</span>
          {saveShortcut}
          <span>으로 재시도</span>
        </span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div data-testid="save-status" className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-primary border-t-transparent" />
        <span className="font-medium">저장 중...</span>
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
            className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 dark:text-green-400 animate-in zoom-in duration-300"
            aria-hidden="true"
          />
          <span className="font-medium text-green-600 dark:text-green-400">
            저장됨
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
      <span>자동 저장</span>
      <span className="hidden sm:flex items-center gap-1 text-xs">
        <span>•</span>
        {saveShortcut}
      </span>
    </div>
  );
}
