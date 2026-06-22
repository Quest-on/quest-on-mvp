"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FINAL_ANSWER_LOG_ID } from "@/lib/answer-integrity";
import { useFinalAnswerInputTelemetry } from "@/hooks/useFinalAnswerInputTelemetry";

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
  sessionId?: string;
  examCode?: string;
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
 * - 외부 붙여넣기 로그 + 입력 타임라인 수집
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
  sessionId,
  examCode,
}: FinalAnswerSheetProps) {
  const dirty = value !== savedValue;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { flushTelemetry, recordPaste } = useFinalAnswerInputTelemetry({
    sessionId,
    textareaRef,
    enabled: open && !disabled,
  });

  const handlePasteLog = useCallback(
    async (pasteData: {
      pastedText: string;
      pasteStart: number;
      pasteEnd: number;
      answerLengthBefore: number;
      isInternal: boolean;
    }) => {
      recordPaste({
        pastedText: pasteData.pastedText,
        lenAfter: pasteData.pasteEnd,
        isInternal: pasteData.isInternal,
      });

      if (!sessionId) return;

      try {
        await fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: pasteData.pastedText.length,
            pasted_text: pasteData.pastedText,
            paste_start: pasteData.pasteStart,
            paste_end: pasteData.pasteEnd,
            answer_length_before: pasteData.answerLengthBefore,
            isInternal: pasteData.isInternal,
            ts: Date.now(),
            examCode,
            questionId: FINAL_ANSWER_LOG_ID,
            sessionId,
          }),
        });
      } catch {
        // non-critical
      }
    },
    [sessionId, examCode, recordPaste]
  );

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleOpenChange = async (next: boolean) => {
    if (!next) {
      await flushTelemetry();
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
          <SheetTitle>최종답안 작성</SheetTitle>
          <SheetDescription>
            리서치 내용을 자신의 언어로 정리하세요. 채팅 기록과 함께 채점에 사용됩니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-3 px-4 py-4 overflow-hidden">
          <AnswerTextarea
            textareaRef={textareaRef}
            value={value}
            onChange={onChange}
            onPaste={handlePasteLog}
            disabled={disabled}
            maxLength={MAX_LENGTH + 1000}
            placeholder="여기에 최종답안을 작성하세요..."
            className={cn(
              "flex-1 min-h-[300px] resize-none text-sm leading-relaxed",
              "border-input rounded-md bg-background shadow-xs",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            )}
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
                {value.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}자
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              {disabled ? (
                <span>제출됨 — 수정 불가</span>
              ) : isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>저장 중...</span>
                </>
              ) : error ? (
                <span className="text-destructive">{error}</span>
              ) : lastSavedAt ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>마지막 저장: {formatTime(lastSavedAt)}</span>
                </>
              ) : dirty ? (
                <span>저장되지 않음</span>
              ) : (
                <span>변경사항 없음</span>
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
            닫기
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
