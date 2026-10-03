"use client";

import React from "react";
import { endInternalDrag, startInternalDrag } from "@/lib/answer-drop";
import { useInternalCopyScope } from "@/components/providers/InternalCopyScopeProvider";
import {
  INTERNAL_COPY_MIME_TYPE,
  STANDALONE_INTERNAL_COPY_SCOPE,
  internalCopyMimeValue,
  wrapInternalCopy,
} from "@/lib/internal-copy";

interface CopyProtectorProps {
  children: React.ReactNode;
  className?: string;
  metadata?: Record<string, unknown>;
}

export function CopyProtector({ children, className, metadata }: CopyProtectorProps) {
  // 표식에 시험 세션 범위를 담는다(#560). 답안 칸은 같은 범위의 표식만 내부 복사로 인정한다.
  const scope = useInternalCopyScope() ?? STANDALONE_INTERNAL_COPY_SCOPE;

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
  const handleDragStart = () => {
    startInternalDrag(window.getSelection()?.toString() ?? "");
  };

  return (
    <div
      onCopy={handleCopy}
      onDragStart={handleDragStart}
      onDragEnd={endInternalDrag}
      className={className}
    >
      {children}
    </div>
  );
}

