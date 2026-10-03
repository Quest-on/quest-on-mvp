"use client";

import React from "react";

// 내부 복사 마커는 답안 칸이 판정하고 지우는 값을 그대로 쓴다. 여기서 따로 정의했던 값(폭 없는 공백 3개)은
// 답안 칸이 지우지 못해 문제 본문 등에서 붙여넣을 때마다 답안에 남았다(#555).
import { INTERNAL_COPY_MARKER_END, INTERNAL_COPY_MARKER_START } from "@/components/ui/answer-textarea";

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

  return (
    <div onCopy={handleCopy} className={className}>
      {children}
    </div>
  );
}

