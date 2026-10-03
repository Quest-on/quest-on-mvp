"use client";

import React from "react";
import { endInternalDrag, startInternalDrag } from "@/lib/answer-drop";

// 내부 복사 마커 (AnswerTextarea와 동일한 마커 사용)
const INTERNAL_COPY_MARKER_START = "\u200B\u200B\u200B";
const INTERNAL_COPY_MARKER_END = "\u200B\u200B\u200B";

interface CopyProtectorProps {
  children: React.ReactNode;
  className?: string;
  metadata?: Record<string, unknown>;
}

export function CopyProtector({ children, className, metadata }: CopyProtectorProps) {
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString() ?? "";
    if (!selection) return;

    // 기본 복사 동작을 막고 마커 포함 텍스트를 강제로 주입
    e.preventDefault();
    
    // text/plain에 마커 추가 (AnswerTextarea의 handlePaste가 감지할 수 있도록)
    const textWithMarker = INTERNAL_COPY_MARKER_START + selection + INTERNAL_COPY_MARKER_END;
    e.clipboardData.setData("text/plain", textWithMarker);
    
    // Add custom internal tag (기존 호환성 유지)
    e.clipboardData.setData("application/x-queston-internal", "true");
    
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

