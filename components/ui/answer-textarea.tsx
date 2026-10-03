"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  cancelInternalDragFrom,
  endInternalDrag,
  isInternalDrag,
  locateInsertedText,
  startInternalDrag,
} from "@/lib/answer-drop";
import { useInternalCopyScope } from "@/components/providers/InternalCopyScopeProvider";
import {
  INTERNAL_COPY_MIME_TYPE,
  STANDALONE_INTERNAL_COPY_SCOPE,
  internalCopyMimeValue,
  isInternalCopyFor,
  stripInternalCopyMarkers,
  wrapInternalCopy,
} from "@/lib/internal-copy";

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

/**
 * input 이벤트 처리 중에 textarea 값을 바꾼다. React 가 값 변화를 감시하는 setter 를 거치지 않으므로, 이어서 도는
 * React 의 onChange 가 바뀐 값을 받는다. `textarea.value = ...` 로 바꾸면 React 가 변화를 못 봐서 onChange 가
 * 불리지 않고, 다음 렌더에서 상태에 있던 값으로 돌아간다.
 */
function setValueForReact(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
}

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
  // 표식에 시험 세션 범위를 담고, 같은 범위의 표식만 내부 복사로 인정한다(#560).
  const scope = useInternalCopyScope() ?? STANDALONE_INTERNAL_COPY_SCOPE;

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
        e.clipboardData.setData("text/plain", wrapInternalCopy(selectedText, scope));
        // More robust internal copy signal than zero-width markers alone.
        e.clipboardData.setData(INTERNAL_COPY_MIME_TYPE, internalCopyMimeValue(scope));
      }
    },
    [scope]
  );

  // Cut 이벤트 핸들러 - 복사와 같은 내부 표식을 붙이고 선택 영역을 직접 지운다.
  // 표식이 없으면 자기 답안 안에서 잘라내 옮긴 글이 외부 붙여넣기로 기록된다(#554).
  const handleCut = useCallback(
    (e: ClipboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea || !e.clipboardData) return;

      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      if (selectionStart === selectionEnd) return;

      const selectedText = textarea.value.substring(selectionStart, selectionEnd);
      if (!selectedText) return;

      // 기본 잘라내기를 막았으므로 선택 영역 삭제도 여기서 한다.
      e.preventDefault();
      e.clipboardData.setData("text/plain", wrapInternalCopy(selectedText, scope));
      e.clipboardData.setData(INTERNAL_COPY_MIME_TYPE, internalCopyMimeValue(scope));

      const currentValue = textarea.value;
      onChange(currentValue.substring(0, selectionStart) + currentValue.substring(selectionEnd));
      setTimeout(() => {
        textarea.setSelectionRange(selectionStart, selectionStart);
      }, 0);
    },
    [onChange, scope]
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

      const pastedData = clipboard.getData("text/plain");
      if (!pastedData) return;

      // 내부 복사 표식 확인 — 이 시험 세션(범위)에서 복사한 것만 내부다(#560).
      const isInternal = isInternalCopyFor(clipboard, scope);

      // 마커 제거 (실제 텍스트만 저장). 범위가 다른 표식도 지운다.
      const cleanText = stripInternalCopyMarkers(pastedData);

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
    [onChange, onPaste, scope]
  );

  // 끌어다 놓기(drop)도 붙여넣기와 같은 onPaste 로 기록한다(#561). paste 만 기록하면 다른 창의 글을
  // 끌어다 놓는 경로가 기록 없이 열려 있다.
  //
  // 놓는 위치를 스크립트로 알 수 없어서 넣기는 브라우저에 맡기고(기본 동작을 막지 않으므로 답안 안에서
  // 끌어 옮기기도 그대로 동작한다), 넣은 직후의 input(insertFromDrop)에서 넣기 직전 값과 비교해 들어온
  // 구간을 찾는다. 답안 안에서 옮기면 브라우저가 지우기(deleteByDrag) 뒤에 넣기를 하므로, 기준값은
  // drop 시점이 아니라 넣기 직전(beforeinput insertFromDrop)의 값이다.
  const pendingDropRef = useRef<{
    isInternal: boolean;
    valueBefore: string;
    hint: string;
  } | null>(null);

  // 답안 칸에서 시작한 끌기 — 자기 글을 옮기는 것이므로 내부로 본다(잘라내 붙이기와 같은 기준, #554).
  const handleDragStart = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    startInternalDrag(textarea.value.substring(textarea.selectionStart, textarea.selectionEnd), textarea);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    const textarea = textareaRef.current;
    if (!textarea || !e.dataTransfer) return;

    const droppedText = e.dataTransfer.getData("text/plain");
    const pending = {
      isInternal: isInternalDrag(droppedText) || isInternalCopyFor(e.dataTransfer, scope),
      valueBefore: textarea.value,
      hint: droppedText,
    };
    pendingDropRef.current = pending;
    endInternalDrag();

    // 브라우저가 놓기를 거절해 input 이 오지 않으면 비운다. 놓기의 input 은 이 타이머보다 먼저 온다
    // (Chromium·Firefox·WebKit 확인).
    setTimeout(() => {
      if (pendingDropRef.current === pending) pendingDropRef.current = null;
    }, 0);
  }, [scope]);

  const handleBeforeInput = useCallback((e: Event) => {
    const textarea = textareaRef.current;
    const pending = pendingDropRef.current;
    if (!textarea || !pending || (e as InputEvent).inputType !== "insertFromDrop") return;

    pending.valueBefore = textarea.value;
    const data = (e as InputEvent).data;
    if (data) pending.hint = data;
  }, []);

  const handleInput = useCallback(
    (e: Event) => {
      const textarea = textareaRef.current;
      const pending = pendingDropRef.current;
      if (!textarea || !pending || (e as InputEvent).inputType !== "insertFromDrop") return;
      pendingDropRef.current = null;

      const after = textarea.value;
      const range = locateInsertedText(pending.valueBefore, after, textarea.selectionEnd, pending.hint);
      if (!range) return;

      // 놓인 글에 표식 문자가 섞여 있으면(표식이 든 채팅 글을 끌어온 경우 등) 붙여넣기처럼 지운다(#555).
      // 들어온 구간만 고치고 그 밖의 답안 글은 건드리지 않는다.
      //
      // 이 리스너는 같은 input 이벤트에서 React 의 onChange 보다 먼저 돈다. 여기서 값을 바로 고치면 React 가
      // 고친 값을 onChange 로 받는다. 타이머로 미루면 그 사이 학생이 친 글자를 놓을 때의 값으로 덮어쓸 수 있다.
      const inserted = after.substring(range.start, range.end);
      const cleaned = stripInternalCopyMarkers(inserted);
      if (cleaned !== inserted) {
        setValueForReact(textarea, after.substring(0, range.start) + cleaned + after.substring(range.end));
        const caret = range.start + cleaned.length;
        textarea.setSelectionRange(caret, caret);
      }
      if (!onPaste) return;

      onPaste({
        pastedText: cleaned,
        pasteStart: range.start,
        pasteEnd: range.start + cleaned.length,
        answerLengthBefore: pending.valueBefore.length,
        answerTextBefore: pending.valueBefore,
        isInternal: pending.isInternal,
      });
    },
    [onPaste]
  );

  // Copy 이벤트 리스너 등록
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // textarea에서 복사 이벤트 감지
    textarea.addEventListener("copy", handleCopy);
    textarea.addEventListener("cut", handleCut);
    return () => {
      textarea.removeEventListener("copy", handleCopy);
      textarea.removeEventListener("cut", handleCut);
    };
  }, [handleCopy, handleCut]);

  // Paste 이벤트 리스너 등록
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => {
      textarea.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  // 끌어다 놓기 이벤트 리스너 등록
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("dragstart", handleDragStart);
    textarea.addEventListener("dragend", endInternalDrag);
    textarea.addEventListener("drop", handleDrop);
    textarea.addEventListener("beforeinput", handleBeforeInput);
    textarea.addEventListener("input", handleInput);
    return () => {
      textarea.removeEventListener("dragstart", handleDragStart);
      textarea.removeEventListener("dragend", endInternalDrag);
      textarea.removeEventListener("drop", handleDrop);
      textarea.removeEventListener("beforeinput", handleBeforeInput);
      textarea.removeEventListener("input", handleInput);
    };
  }, [handleDragStart, handleDrop, handleBeforeInput, handleInput]);

  // 답안 칸에서 시작한 끌기 도중 답안 칸이 다시 그려지거나 화면에서 빠지면(시간이 끝나 제출 화면으로 바뀔 때,
  // 문제 패널을 접거나 펼 때 등) 남긴 표시를 지운다. 문제 패널을 접은 채 다른 문항으로 옮기면 패널이 다시
  // 펼쳐지면서(setCurrentQuestionWithReveal) 답안 칸도 다시 그려진다.
  useEffect(() => {
    const textarea = textareaRef.current;
    return () => cancelInternalDragFrom(textarea);
  }, []);

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

