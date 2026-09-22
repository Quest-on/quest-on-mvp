"use client";

import { useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
}

interface UseExamSubmissionOptions {
  exam: { id: string; code?: string; questions: Array<{ id: string }> } | null;
  examCode: string;
  sessionId: string | null;
  userId: string | undefined;
  currentQuestion: number;
  draftAnswers: DraftAnswer[];
  chatHistory: ChatMessage[];
  manualSave: () => Promise<void>;
  setIsSubmitted: (value: boolean) => void;
}

interface UseExamSubmissionReturn {
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  showSubmitConfirm: boolean;
  setShowSubmitConfirm: (value: boolean) => void;
  autoSubmitFailed: boolean;
  setAutoSubmitFailed: (value: boolean) => void;
  manualSubmitFailed: boolean;
  setManualSubmitFailed: (value: boolean) => void;
  submitErrorMessage: string | null;
  setSubmitErrorMessage: (value: string | null) => void;
  unansweredDialog: { open: boolean; indices: number[] };
  setUnansweredDialog: (value: { open: boolean; indices: number[] }) => void;
  showPreflightCancelConfirm: boolean;
  setShowPreflightCancelConfirm: (value: boolean) => void;
  handlePaste: (pasteData: {
    pastedText: string;
    pasteStart: number;
    pasteEnd: number;
    answerLengthBefore: number;
    answerTextBefore: string;
    isInternal: boolean;
  }) => Promise<void>;
  handleSubmitClick: () => void;
  handleSubmit: () => Promise<void>;
  handleTimeExpired: () => Promise<void>;
}

function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  const textContent = html.replace(/<[^>]*>/g, "").trim();
  return textContent.length === 0;
}

export function useExamSubmission({
  exam,
  examCode,
  sessionId,
  userId,
  currentQuestion,
  draftAnswers,
  chatHistory,
  manualSave,
  setIsSubmitted,
}: UseExamSubmissionOptions): UseExamSubmissionReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [manualSubmitFailed, setManualSubmitFailed] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [unansweredDialog, setUnansweredDialog] = useState<{ open: boolean; indices: number[] }>({ open: false, indices: [] });
  const [showPreflightCancelConfirm, setShowPreflightCancelConfirm] = useState(false);
  const timeExpiredCalledRef = useRef(false);

  const parseErrorMessage = useCallback(async (response: Response): Promise<string> => {
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();

        // 아는 코드는 우리 문구로 바꾼다.
        //
        // `data.message` 는 서버 원문이고 영문·개발자용이다. 한국어 화면
        // 한가운데 "Submission is temporarily unavailable…" 이 그대로 뜬다.
        // 같은 교훈이 `app/(app)/join/page.tsx` 에 적혀 있다 — 거기서는
        // "Exam not found" 가 학생 화면에 떴다.
        //
        // QUOTA_CHECK_UNAVAILABLE 은 특히 뭉개면 안 된다 (#326). 정원이 찬
        // 것도 제출이 실패한 것도 아니고, 잠시 뒤 다시 누르면 된다.
        const known: Record<string, string> = {
          QUOTA_CHECK_UNAVAILABLE:
            "지금은 제출 확인이 일시적으로 어렵습니다. 잠시 뒤 다시 시도해주세요.",
        };
        if (typeof data.error === "string" && known[data.error]) {
          return known[data.error];
        }

        return data.message || data.error || "답안 제출에 실패했습니다.";
      }
      const text = await response.text();
      return text || "답안 제출에 실패했습니다.";
    } catch {
      return "답안 제출에 실패했습니다.";
    }
  }, []);

  const checkSubmissionOnServer = useCallback(async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/student/sessions?examCode=${encodeURIComponent(code)}`);
      if (!res.ok) return false;
      const data = await res.json();
      const sessions = Array.isArray(data) ? data : data.sessions || [];
      return sessions.some(
        (s: { status?: string }) =>
          s.status === "submitted" ||
          s.status === "graded" ||
          s.status === "completed"
      );
    } catch {
      return false;
    }
  }, []);

  const handlePaste = useCallback(
    async (pasteData: {
      pastedText: string;
      pasteStart: number;
      pasteEnd: number;
      answerLengthBefore: number;
      answerTextBefore: string;
      isInternal: boolean;
    }) => {
      const {
        pastedText,
        pasteStart,
        pasteEnd,
        answerLengthBefore,
        isInternal,
      } = pasteData;

      try {
        await fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: pastedText.length,
            pasted_text: pastedText,
            paste_start: pasteStart,
            paste_end: pasteEnd,
            answer_length_before: answerLengthBefore,
            isInternal,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId,
          }),
        });
      } catch {
        // Paste logging failure is non-critical
      }
    },
    [examCode, exam, sessionId, currentQuestion]
  );

  const handleSubmitClick = useCallback(() => {
    if (!exam) return;

    const unansweredIndices = draftAnswers
      .map((answer, idx) => (isHtmlEmpty(answer.text) ? idx : -1))
      .filter((idx) => idx !== -1);
    if (unansweredIndices.length > 0) {
      setUnansweredDialog({ open: true, indices: unansweredIndices });
      return;
    }

    if (!sessionId) {
      toast.error("세션 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
      return;
    }

    setShowSubmitConfirm(true);
  }, [exam, draftAnswers, sessionId]);

  const handleSubmit = useCallback(async () => {
    if (!exam) return;

    setIsSubmitting(true);
    setShowSubmitConfirm(false);
    setSubmitErrorMessage(null);

    try {
      await manualSave();

      const sanitizedAnswers = draftAnswers.map((answer) => ({
        ...answer,
        text: answer.text?.replace(/\u0000/g, "") || "",
      }));

      const transformedChatHistory = chatHistory.map((msg) => ({
        type: msg.type === "user" ? "student" : "ai",
        content: msg.message,
        timestamp: msg.timestamp,
      }));

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers: sanitizedAnswers,
          examId: exam.id,
          sessionId,
          chatHistory: transformedChatHistory,
          studentId: userId,
        }),
      });

      if (response.ok) {
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else if (response.status === 409) {
        // Already submitted — treat as success
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else if (response.status === 400) {
        // Check if exam was force-closed — treat EXAM_CLOSED as success
        try {
          const errorData = await response.json();
          if (errorData.code === "EXAM_CLOSED") {
            const actuallySubmitted = await checkSubmissionOnServer(examCode);
            if (actuallySubmitted) {
              setIsSubmitted(true);
              setManualSubmitFailed(false);
            } else {
              // Force-end already submitted the session server-side
              setIsSubmitted(true);
              setManualSubmitFailed(false);
            }
          } else {
            setSubmitErrorMessage(errorData.message || "답안 제출에 실패했습니다.");
            setManualSubmitFailed(true);
          }
        } catch {
          setSubmitErrorMessage("답안 제출에 실패했습니다.");
          setManualSubmitFailed(true);
        }
      } else {
        const errorMsg = await parseErrorMessage(response);
        // Double-check: maybe the submission actually went through
        const actuallySubmitted = await checkSubmissionOnServer(examCode);
        if (actuallySubmitted) {
          setIsSubmitted(true);
          setManualSubmitFailed(false);
        } else {
          setSubmitErrorMessage(errorMsg);
          setManualSubmitFailed(true);
        }
      }
    } catch {
      // Network error — check if submission actually went through
      const actuallySubmitted = await checkSubmissionOnServer(examCode);
      if (actuallySubmitted) {
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else {
        setSubmitErrorMessage("네트워크 연결을 확인하고 다시 시도해주세요.");
        setManualSubmitFailed(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [exam, examCode, sessionId, userId, draftAnswers, chatHistory, manualSave, setIsSubmitted, parseErrorMessage, checkSubmissionOnServer]);

  const handleTimeExpired = useCallback(async () => {
    if (timeExpiredCalledRef.current) return;
    timeExpiredCalledRef.current = true;
    if (!sessionId || !exam || false /* isSubmitted checked by caller */) return;

    setIsSubmitting(true);
    setAutoSubmitFailed(false);

    const MAX_RETRIES = 3;
    let submitted = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt === 1) await manualSave();

        const sanitizedAnswers = draftAnswers.map((answer) => ({
          ...answer,
          text: answer.text?.replace(/\u0000/g, "") || "",
        }));

        const transformedChatHistory = chatHistory.map((msg) => ({
          type: msg.type === "user" ? "student" : "ai",
          content: msg.message,
          timestamp: msg.timestamp,
        }));

        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examCode,
            answers: sanitizedAnswers,
            examId: exam.id,
            sessionId,
            chatHistory: transformedChatHistory,
            studentId: userId,
          }),
        });

        if (response.ok) {
          setIsSubmitted(true);
          submitted = true;
          break;
        } else if (response.status === 409) {
          // Already submitted — treat as success
          setIsSubmitted(true);
          submitted = true;
          break;
        } else if (response.status === 400) {
          // Check if exam was force-closed
          try {
            const errorData = await response.json();
            if (errorData.code === "EXAM_CLOSED") {
              // Force-end already submitted the session server-side
              setIsSubmitted(true);
              submitted = true;
              break;
            }
          } catch {
            // Parse error — continue retry
          }
        }
      } catch {
        // Retry on network errors
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!submitted) {
      // Final check: maybe it actually went through despite errors
      const actuallySubmitted = await checkSubmissionOnServer(examCode);
      if (actuallySubmitted) {
        setIsSubmitted(true);
      } else {
        try { await manualSave(); } catch {}
        setAutoSubmitFailed(true);
      }
    }
    setIsSubmitting(false);
  }, [sessionId, exam, examCode, userId, draftAnswers, chatHistory, manualSave, setIsSubmitted, checkSubmissionOnServer]);

  return {
    isSubmitting,
    setIsSubmitting,
    showSubmitConfirm,
    setShowSubmitConfirm,
    autoSubmitFailed,
    setAutoSubmitFailed,
    manualSubmitFailed,
    setManualSubmitFailed,
    submitErrorMessage,
    setSubmitErrorMessage,
    unansweredDialog,
    setUnansweredDialog,
    showPreflightCancelConfirm,
    setShowPreflightCancelConfirm,
    handlePaste,
    handleSubmitClick,
    handleSubmit,
    handleTimeExpired,
  };
}
