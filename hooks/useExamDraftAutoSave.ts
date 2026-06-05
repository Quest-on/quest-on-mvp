"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { Question } from "@/components/instructor/QuestionEditor";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";
import type { ScoreWeights } from "@/lib/grade-utils";

const STORAGE_KEY = "quest-on:exam-draft";
const RESTORE_ACK_KEY = "quest-on:exam-draft:restore-ack";
const SAVE_INTERVAL_MS = 5000;

export interface ExamDraftData {
  title: string;
  duration: number;
  code: string;
  questions: Question[];
  chatWeight: number | null;
  scoreWeights: ScoreWeights | null;
  adjustHistory: Record<string, ChatMessage[]>;
  savedAt: string;
}

interface UseExamDraftAutoSaveOptions {
  title: string;
  duration: number;
  code: string;
  questions: Question[];
  chatWeight: number | null;
  scoreWeights: ScoreWeights | null;
  adjustHistoryRef: React.RefObject<Map<string, ChatMessage[]>>;
}

function loadDraft(): ExamDraftData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: ExamDraftData = JSON.parse(raw);
    const hasMeaningfulData =
      parsed.title?.trim() ||
      (parsed.questions?.length > 0 &&
        parsed.questions.some((q) => q.text?.trim()));
    if (hasMeaningfulData) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function getDraftFingerprint(draft: ExamDraftData): string {
  return draft.savedAt;
}

function getRestoreAck(): string | null {
  try {
    return sessionStorage.getItem(RESTORE_ACK_KEY);
  } catch {
    return null;
  }
}

function setRestoreAck(fingerprint: string): void {
  try {
    sessionStorage.setItem(RESTORE_ACK_KEY, fingerprint);
  } catch {
    // sessionStorage unavailable
  }
}

function clearRestoreAck(): void {
  try {
    sessionStorage.removeItem(RESTORE_ACK_KEY);
  } catch {
    // sessionStorage unavailable
  }
}

function shouldShowRestoreModal(draft: ExamDraftData | null): boolean {
  if (!draft) return false;
  return getRestoreAck() !== getDraftFingerprint(draft);
}

export function useExamDraftAutoSave(options: UseExamDraftAutoSaveOptions) {
  // Lazy init: read localStorage once on mount and derive modal state from the same draft snapshot.
  const [restoreState, setRestoreState] = useState<{
    savedDraft: ExamDraftData | null;
    showRestoreModal: boolean;
  }>(() => {
    const draft = loadDraft();
    return {
      savedDraft: draft,
      showRestoreModal: shouldShowRestoreModal(draft),
    };
  });
  const { savedDraft, showRestoreModal } = restoreState;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Save to localStorage
  const saveDraft = useCallback(() => {
    const opts = optionsRef.current;
    const hasMeaningfulData =
      opts.title.trim() ||
      (opts.questions.length > 0 && opts.questions.some((q) => q.text.trim()));
    if (!hasMeaningfulData) return;

    const draft: ExamDraftData = {
      title: opts.title,
      duration: opts.duration,
      code: opts.code,
      questions: opts.questions,
      chatWeight: opts.chatWeight,
      scoreWeights: opts.scoreWeights,
      adjustHistory: Object.fromEntries(opts.adjustHistoryRef.current ?? new Map()),
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage full or unavailable
    }
  }, []);

  // Auto-save interval
  useEffect(() => {
    timerRef.current = setInterval(saveDraft, SAVE_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [saveDraft]);

  // Save on beforeunload
  useEffect(() => {
    const handler = () => saveDraft();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveDraft]);

  const restoreDraft = useCallback(() => {
    if (savedDraft) {
      setRestoreAck(getDraftFingerprint(savedDraft));
    }
    setRestoreState((prev) => ({
      ...prev,
      showRestoreModal: false,
    }));
    return savedDraft;
  }, [savedDraft]);

  const discardDraft = useCallback(() => {
    clearRestoreAck();
    setRestoreState({
      savedDraft: null,
      showRestoreModal: false,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const clearDraft = useCallback(() => {
    clearRestoreAck();
    setRestoreState({
      savedDraft: null,
      showRestoreModal: false,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    showRestoreModal,
    savedDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
