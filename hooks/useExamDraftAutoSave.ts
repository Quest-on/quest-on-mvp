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

type DraftSource = Omit<UseExamDraftAutoSaveOptions, "adjustHistoryRef"> & {
  adjustHistory: Map<string, ChatMessage[]>;
};

/**
 * 지금 저장할 초안. 저장할 내용이 없거나 이미 출제로 확정됐으면 null.
 *
 * 출제에 성공하면 clearDraft() 로 초안을 지우는데, 성공 다이얼로그가 떠 있는 동안
 * 폼 상태는 그대로다. 확정 여부를 보지 않으면 다음 자동 저장 틱이 방금 출제한 시험을
 * 다시 초안으로 써 넣고, 다음에 새 시험 만들기를 열 때 복원을 권한다(#498).
 */
export function draftToSave(
  source: DraftSource,
  state: { committed: boolean },
  now: Date,
): ExamDraftData | null {
  if (state.committed) return null;
  const hasMeaningfulData =
    source.title.trim() ||
    (source.questions.length > 0 && source.questions.some((q) => q.text.trim()));
  if (!hasMeaningfulData) return null;

  return {
    title: source.title,
    duration: source.duration,
    code: source.code,
    questions: source.questions,
    chatWeight: source.chatWeight,
    scoreWeights: source.scoreWeights,
    adjustHistory: Object.fromEntries(source.adjustHistory),
    savedAt: now.toISOString(),
  };
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
  // clearDraft() 뒤로는 이 작업이 출제로 확정됐다 — 자동 저장을 멈춘다(#498).
  const committedRef = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Save to localStorage
  const saveDraft = useCallback(() => {
    const { adjustHistoryRef, ...opts } = optionsRef.current;
    const draft = draftToSave(
      { ...opts, adjustHistory: adjustHistoryRef.current ?? new Map() },
      { committed: committedRef.current },
      new Date(),
    );
    if (!draft) return;

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
    committedRef.current = true;
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
