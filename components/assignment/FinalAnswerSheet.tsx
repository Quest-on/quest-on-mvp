"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 50_000;

interface FinalAnswerSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  value: string;
  onChange: (next: string) => void;
  onFlush: () => Promise<{ ok: boolean; error?: string }>;
  isSaving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  savedValue: string;
  disabled?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * 우측에서 슬라이드되는 최종답안 작성 Sheet.
 * - 입력 시 useFinalAnswer 훅이 2.5s 디바운스 자동저장
 * - 닫힐 때 flush() 즉시 저장
 * - 글자수 카운터(50,000자) + 마지막 저장 시각 표시
 */
export function FinalAnswerSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onFlush,
  isSaving,
  lastSavedAt,
  error,
  savedValue,
  disabled,
}: FinalAnswerSheetProps) {
  const t = useTranslations("assignment");
  const dirty = value !== savedValue;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 시트가 열릴 때 textarea에 포커스
  useEffect(() => {
    if (open) {
      // 슬라이드 애니메이션이 끝난 뒤 포커스
      const t = setTimeout(() => textareaRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleOpenChange = async (next: boolean) => {
    if (!next) {
      // 닫힐 때 즉시 저장 시도 (실패해도 시트는 닫는다 — beforeunload backup이 있음)
      void onFlush();
    }
    onOpenChange(next);
  };

  const remaining = MAX_LENGTH - value.length;
  const overLimit = remaining < 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg w-full flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t("finalAnswerSheet.title")}</SheetTitle>
          <SheetDescription>
            {t("finalAnswerSheet.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-3 px-4 py-4 overflow-hidden">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={t("finalAnswerSheet.placeholder")}
            className="flex-1 min-h-[300px] resize-none text-sm leading-relaxed"
            maxLength={MAX_LENGTH + 1000 /* 약간 여유 — 서버에서 최종 검증 */}
            aria-label={t("finalAnswerSheet.ariaLabel")}
          />

          <div className="flex items-center justify-between text-xs">
            <div
              className={cn(
                "flex items-center gap-1.5",
                overLimit ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {overLimit && <AlertCircle className="w-3.5 h-3.5" />}
              <span>
                {t("finalAnswerSheet.charCount", { current: value.length.toLocaleString(), max: MAX_LENGTH.toLocaleString() })}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              {disabled ? (
                <span>{t("finalAnswerSheet.statusSubmitted")}</span>
              ) : isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("finalAnswerSheet.statusSaving")}</span>
                </>
              ) : error ? (
                <span className="text-destructive">{error}</span>
              ) : lastSavedAt ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t("finalAnswerSheet.statusLastSaved", { time: formatTime(lastSavedAt) })}</span>
                </>
              ) : dirty ? (
                <span>{t("finalAnswerSheet.statusUnsaved")}</span>
              ) : (
                <span>{t("finalAnswerSheet.statusNoChanges")}</span>
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="border-t flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            {t("finalAnswerSheet.closeButton")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
