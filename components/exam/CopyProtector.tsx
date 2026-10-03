"use client";

import React, { useEffect, useRef } from "react";
import { cancelInternalDragFrom, endInternalDrag, startInternalDrag } from "@/lib/answer-drop";
import { useInternalCopyScope } from "@/components/providers/InternalCopyScopeProvider";
import {
  INTERNAL_COPY_MIME_TYPE,
  STANDALONE_INTERNAL_COPY_SCOPE,
  internalCopyMimeValue,
  wrapInternalCopy,
} from "@/lib/internal-copy";

/** 끌기를 시작한 노드가 선택 영역에 걸치는가(선택 영역을 끄는 경우). */
function isDraggingSelection(selection: Selection, target: EventTarget): boolean {
  if (!(target instanceof Node)) return false;
  for (let i = 0; i < selection.rangeCount; i++) {
    if (selection.getRangeAt(i).intersectsNode(target)) return true;
  }
  return false;
}

interface CopyProtectorProps {
  children: React.ReactNode;
  className?: string;
  metadata?: Record<string, unknown>;
}

export function CopyProtector({ children, className, metadata }: CopyProtectorProps) {
  // 표식에 시험 세션 범위를 담는다(#560). 답안 칸은 같은 범위의 표식만 내부 복사로 인정한다.
  const scope = useInternalCopyScope() ?? STANDALONE_INTERNAL_COPY_SCOPE;
  const rootRef = useRef<HTMLDivElement>(null);

  // 이 영역에서 시작한 끌기가 끝나기 전에 영역이 화면에서 빠지면(시간이 끝나 제출 화면으로 바뀌거나 문제
  // 패널을 접는 경우 등) 남긴 표시를 지운다. 서술형 문항끼리 옮길 때는 같은 요소가 그대로 남아 해당하지 않는다.
  useEffect(() => {
    const root = rootRef.current;
    return () => cancelInternalDragFrom(root);
  }, []);

  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString() ?? "";
    if (!selection) return;

    // 기본 복사 동작을 막고 마커 포함 텍스트를 강제로 주입
    e.preventDefault();
    
    // text/plain에 마커 추가 (AnswerTextarea의 handlePaste가 감지할 수 있도록)
    e.clipboardData.setData("text/plain", wrapInternalCopy(selection, scope));
    
    // 사용자 정의 형식에도 같은 범위를 싣는다(#560).
    e.clipboardData.setData(INTERNAL_COPY_MIME_TYPE, internalCopyMimeValue(scope));
    
    // Add metadata if provided
    if (metadata) {
      try {
        e.clipboardData.setData("application/x-queston-meta", JSON.stringify(metadata));
      } catch {
        // Serialization error, non-critical
      }
    }
  };

  // 여기서 끌어다 답안 칸에 놓은 글도 복사처럼 내부로 기록되게, 끌기 시작을 적어 둔다(#561).
  //
  // 끌기 글(text/plain)은 비교 기준인 선택 글로 맞춘다. 브라우저가 만드는 끌기 글은 수식(KaTeX), 이미지
  // 대체 글, 링크에서 selection.toString() 과 엔진마다 다르게 직렬화될 수 있어서, 그대로 두면 내부 끌기가
  // 외부(빨간색)로 기록될 수 있다. 선택 영역을 끄는 경우만 맞추고, 선택 밖의 이미지·링크를 끌면 브라우저가
  // 만든 데이터(주소 등)를 그대로 둔다.
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (!selection || !text || !isDraggingSelection(selection, e.target)) return;

    startInternalDrag(text, rootRef.current);
    e.dataTransfer.setData("text/plain", text);
  };

  return (
    <div
      ref={rootRef}
      onCopy={handleCopy}
      onDragStart={handleDragStart}
      onDragEnd={() => endInternalDrag()}
      className={className}
    >
      {children}
    </div>
  );
}

