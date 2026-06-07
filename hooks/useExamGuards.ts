"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface Exam {
  questions: Array<{ id: string; text: string; ai_context?: string }>;
}

interface UseExamGuardsOptions {
  sessionId: string | null;
  exam: Exam | null;
  isSubmitted: boolean;
  draftAnswers: DraftAnswer[];
  user: { id: string } | null | undefined;
  examCode: string;
  currentQuestion: number;
  isOnline: boolean;
  setShowExitConfirm: (show: boolean) => void;
}

export function useExamGuards({
  sessionId,
  exam,
  isSubmitted,
  draftAnswers,
  user,
  examCode,
  currentQuestion,
  isOnline,
  setShowExitConfirm,
}: UseExamGuardsOptions) {
  // Warn user about unsaved answers when closing/refreshing tab during exam
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    const handleUnsavedWarning = (e: BeforeUnloadEvent) => {
      const hasContent = draftAnswers.some(
        (a) => a.text && a.text.replace(/<[^>]*>/g, "").trim().length > 0
      );
      if (hasContent) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleUnsavedWarning);
    return () =>
      window.removeEventListener("beforeunload", handleUnsavedWarning);
  }, [sessionId, exam, isSubmitted, draftAnswers]);

  // Block browser back button during exam (SPA nav guard)
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      setShowExitConfirm(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sessionId, exam, isSubmitted, setShowExitConfirm]);

  // Detect tab switches (visibilitychange) for anti-cheat monitoring
  useEffect(() => {
    if (!sessionId || !user || isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: 0,
            pasted_text: "[TAB_SWITCH]",
            paste_start: 0,
            paste_end: 0,
            answer_length_before: 0,
            isInternal: false,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId,
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionId, user, isSubmitted, examCode, exam, currentQuestion]);

  // Show toast on network reconnect
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.success("네트워크 연결이 복원되었습니다. 답안을 저장하는 중...", {
        duration: 3000,
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  // 단방향 진행 정책: Alt+1~9 임의 점프 단축키는 제거됨(역행/점프 차단).
}
