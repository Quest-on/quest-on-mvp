"use client";

import { useCallback, useEffect, useRef } from "react";
import type { InputEvent as AnswerTelemetryEvent } from "@/lib/answer-integrity";

const FLUSH_INTERVAL_MS = 15_000;
const MAX_BUFFER_SIZE = 500;

interface UseFinalAnswerInputTelemetryParams {
  sessionId: string | undefined;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  enabled?: boolean;
}

export function useFinalAnswerInputTelemetry({
  sessionId,
  textareaRef,
  enabled = true,
}: UseFinalAnswerInputTelemetryParams) {
  const bufferRef = useRef<AnswerTelemetryEvent[]>([]);
  const prevLenRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (!sessionId || bufferRef.current.length === 0) return;

    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    try {
      await fetch("/api/log/final-answer-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, events: batch }),
        keepalive: true,
      });
    } catch {
      // best effort — 실패 시 버퍼 앞에 복원
      bufferRef.current = [...batch, ...bufferRef.current].slice(-MAX_BUFFER_SIZE);
    }
  }, [sessionId]);

  const recordEvent = useCallback((event: AnswerTelemetryEvent) => {
    bufferRef.current.push(event);
    if (bufferRef.current.length >= MAX_BUFFER_SIZE) {
      void flush();
    }
  }, [flush]);

  const recordPaste = useCallback(
    (params: {
      pastedText: string;
      lenAfter: number;
      isInternal: boolean;
    }) => {
      recordEvent({
        ts: Date.now(),
        kind: "paste",
        delta: params.pastedText.length,
        len: params.lenAfter,
        internal: params.isInternal,
      });
      prevLenRef.current = params.lenAfter;
    },
    [recordEvent]
  );

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    prevLenRef.current = textarea.value.length;

    const syncLen = () => {
      prevLenRef.current = textarea.value.length;
    };
    syncLen();

    const handleInput = (e: Event) => {
      const inputEvent = e as InputEvent;
      if (inputEvent.inputType === "insertFromPaste") return;

      const newLen = textarea.value.length;
      const delta = newLen - prevLenRef.current;
      prevLenRef.current = newLen;
      if (delta === 0) return;

      recordEvent({
        ts: Date.now(),
        kind: delta > 0 ? "insert" : "delete",
        delta,
        len: newLen,
      });
    };

    textarea.addEventListener("input", handleInput);
    flushTimerRef.current = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);

    return () => {
      textarea.removeEventListener("input", handleInput);
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      void flush();
    };
  }, [enabled, sessionId, textareaRef, recordEvent, flush]);

  return { flushTelemetry: flush, recordPaste };
}
