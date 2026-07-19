import { useState, useCallback, useRef, useEffect } from "react";

interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
}

interface UseExamChatOptions {
  exam: { id?: string; title?: string; code?: string; questions?: Array<{ id: string; text: string; ai_context?: string }> } | null;
  userId?: string;
  sessionId: string | null;
  currentQuestion: number;
  scrollToBottom: () => void;
}

interface UseExamChatReturn {
  chatMessage: string;
  setChatMessage: (msg: string) => void;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  isTyping: boolean;
  sendChatMessage: () => Promise<void>;
  currentQuestionChatHistory: ChatMessage[];
}


export function useExamChat({
  exam,
  userId,
  sessionId,
  currentQuestion,
  scrollToBottom,
}: UseExamChatOptions): UseExamChatReturn {
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const currentQuestionChatHistory = chatHistory.filter(
    (msg) => msg.qIdx === currentQuestion
  );

  const sendChatMessage = useCallback(async () => {
    if (!chatMessage.trim()) return;

    const actualSessionId =
      sessionId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const userMessage: ChatMessage = {
      type: "user",
      message: chatMessage,
      timestamp: new Date().toISOString(),
      qIdx: currentQuestion,
    };
    setChatHistory((prev) => [...prev, userMessage]);
    const currentMsg = chatMessage;
    setChatMessage("");
    setIsLoading(true);
    setIsTyping(true);
    scrollToBottom();

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 60-second timeout for streaming (longer than non-streaming since first token arrives quickly)
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const requestBody = {
      message: currentMsg,
      sessionId: actualSessionId,
      questionIdx: currentQuestion,
      questionId: exam?.questions?.[currentQuestion]?.id,
      examTitle: exam?.title,
      examCode: exam?.code,
      examId: exam?.id,
      studentId: userId,
      currentQuestionText: exam?.questions?.[currentQuestion]?.text,
      // currentQuestionAiContext 는 보내지 않는다: 강사 채점 컨텍스트는 학생 응답에서
      // 스트립되므로 서버가 원본 exam 에서 직접 파생한다(민감 필드 신뢰 경계 정리).
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const data = await res.json();
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", message: data.response, timestamp: new Date().toISOString(), qIdx: currentQuestion },
        ]);
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to parse error" }));
        let errorMessage = "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.";
        if (errorData.error === "Invalid session" || errorData.error === "Session not found") {
          errorMessage = "세션에 문제가 있습니다. 페이지를 새로고침하고 다시 시도해주세요.";
        } else if (errorData.error === "Missing required fields") {
          errorMessage = "필수 정보가 누락되었습니다. 다시 시도해주세요.";
        }
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", message: errorMessage, timestamp: new Date().toISOString(), qIdx: currentQuestion },
        ]);
      }
      scrollToBottom();
    } catch (err) {
      // Don't show error for intentional abort (unmount or new request)
      if (err instanceof DOMException && err.name === "AbortError") {
        // Distinguish timeout abort from intentional abort (unmount/new request)
        if (controller.signal.aborted) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "assistant",
              message: "응답 시간이 초과되었습니다. 다시 시도해주세요.",
              timestamp: new Date().toISOString(),
              qIdx: currentQuestion,
            },
          ]);
          // Restore user input on timeout
          setChatMessage(currentMsg);
          scrollToBottom();
        }
        return;
      }
      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant",
          message: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
          timestamp: new Date().toISOString(),
          qIdx: currentQuestion,
        },
      ]);
      scrollToBottom();
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [chatMessage, sessionId, currentQuestion, exam, userId, scrollToBottom]);

  return {
    chatMessage,
    setChatMessage,
    chatHistory,
    setChatHistory,
    isLoading,
    isTyping,
    sendChatMessage,
    currentQuestionChatHistory,
  };
}
