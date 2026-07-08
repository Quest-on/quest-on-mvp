"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface AnswerTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onPaste?: (e: {
    pastedText: string;
    pasteStart: number;
    pasteEnd: number;
    answerLengthBefore: number;
    answerTextBefore: string;
    isInternal: boolean;
  }) => void;
}

// 내부 복사 마커 (Zero-width space 앞뒤로 추가하여 감지 용이)
const INTERNAL_COPY_MARKER_START = "\u200B\u{E0001}\u200B";
const INTERNAL_COPY_MARKER_END = "\u200B\u{E0002}\u200B";
const INTERNAL_COPY_MIME_TYPE = "application/x-queston-internal";

export function AnswerTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  onFocus,
  onPaste,
}: AnswerTextareaProps) {
  const t = useTranslations("common.answerTextarea");
  const resolvedPlaceholder = placeholder ?? t("placeholder");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Copy 이벤트 핸들러 - 내부 복사 마커 추가
  const handleCopy = useCallback(
    (e: ClipboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // textarea에서 선택된 텍스트 확인
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // 선택된 텍스트가 있는지 확인
      if (selectionStart === selectionEnd) return;

      const selectedText = textarea.value.substring(selectionStart, selectionEnd);
      if (!selectedText) return;

      // 기본 복사 동작을 막고 마커 포함 텍스트를 강제로 주입
      if (e.clipboardData) {
        e.preventDefault(); // 먼저 기본 동작 차단
        e.clipboardData.setData(
          "text/plain",
          INTERNAL_COPY_MARKER_START + selectedText + INTERNAL_COPY_MARKER_END
        );
        // More robust internal copy signal than zero-width markers alone.
        e.clipboardData.setData(INTERNAL_COPY_MIME_TYPE, "1");
      }
    },
    []
  );

  // Paste 이벤트 핸들러
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // 중요: 브라우저가 마커를 textarea에 넣지 못하게 즉시 차단
      e.preventDefault();

      const clipboard = e.clipboardData;
      if (!clipboard) return;

      const isInternalByMime = clipboard.types.includes(INTERNAL_COPY_MIME_TYPE);
      const pastedData = clipboard.getData("text/plain");
      if (!pastedData) return;

      // 내부 복사 마커 확인
      const isInternalByMarker =
        pastedData.includes("\u200B\u{E0001}\u200B") ||
        pastedData.includes("\u200B\u{E0002}\u200B");
      const isInternal = isInternalByMime || isInternalByMarker;

      // 마커 제거 (실제 텍스트만 저장)
      const cleanText = pastedData
        .replace(/\u200B\u{E0001}\u200B/gu, "")
        .replace(/\u200B\u{E0002}\u200B/gu, "");

      // 붙여넣기 전 상태 저장
      const answerLengthBefore = textarea.value.length;
      const cursorPosition = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const answerTextBefore = textarea.value;

      // 수동으로 textarea 값 업데이트
      const currentValue = textarea.value;
      const newValue =
        currentValue.substring(0, cursorPosition) +
        cleanText +
        currentValue.substring(selectionEnd);

      // React state 업데이트
      onChange(newValue);

      // 커서 위치 수동 조정 (비동기로 처리하여 DOM 업데이트 후 실행)
      setTimeout(() => {
        const newCursorPosition = cursorPosition + cleanText.length;
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);

      // 붙여넣기 후 위치 계산
      const pasteStart = cursorPosition;
      const pasteEnd = cursorPosition + cleanText.length;

      // onPaste 콜백 호출
      if (onPaste) {
        onPaste({
          pastedText: cleanText,
          pasteStart,
          pasteEnd,
          answerLengthBefore,
          answerTextBefore,
          isInternal,
        });
      }
    },
    [onChange, onPaste]
  );

  // Copy 이벤트 리스너 등록
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // textarea에서 복사 이벤트 감지
    textarea.addEventListener("copy", handleCopy);
    return () => {
      textarea.removeEventListener("copy", handleCopy);
    };
  }, [handleCopy]);

  // Paste 이벤트 리스너 등록
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => {
      textarea.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={resolvedPlaceholder}
      className={cn(
        "w-full min-h-[300px] sm:min-h-[400px] p-4",
        "border rounded-md bg-background",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "resize-y",
        "font-mono text-sm leading-relaxed",
        className
      )}
    />
  );
}

