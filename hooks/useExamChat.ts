import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { readSseStream } from "@/lib/analysis-exec/sse";
import {
  ANALYSIS_UNAVAILABLE_ERROR,
  parseAnalysisStreamEvent,
  type AnalysisErrorCode,
  type AnalysisStatusPhase,
} from "@/lib/analysis-exec/client-events";
import { ANALYSIS_CLIENT_TIMEOUT_MS } from "@/lib/analysis-exec/limits";
import type { ClientAnalysisTurn } from "@/lib/analysis-exec/metadata";

export interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
  /** 코드 실행이 붙은 분석 턴의 실행 기록(#545). 셀 블록으로 보인다. */
  analysis?: ClientAnalysisTurn;
  /** 분석 턴이 오류로 끝났을 때의 안내(#545). */
  analysisError?: AnalysisErrorCode | "timeout";
}

/** 분석 턴 진행 표시(#545). 경과 시간은 화면이 `startedAt` 으로 센다. */
export interface AnalysisProgress {
  phase: AnalysisStatusPhase;
  /** 시작된 코드 셀 수(실행 중 n 회째). */
  cell: number;
  startedAt: number;
  /** 지금까지 받은 답변 글자(정리 전). */
  preview: string;
}

interface UseExamChatOptions {
  exam: {
    id?: string;
    title?: string;
    code?: string;
    questions?: Array<{ id: string; text: string; ai_context?: string; ai_role?: string | null }>;
  } | null;
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
  /** 분석 턴이 진행 중이면 진행 상황, 아니면 null. */
  analysisProgress: AnalysisProgress | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 저장된 분석 기록과 대화 기록을 잇는 열쇠. 같은 메시지의 created_at 과 문항 번호다. */
function analysisKey(qIdx: number, timestamp: string): string {
  const ms = Date.parse(timestamp);
  return `${qIdx}|${Number.isNaN(ms) ? timestamp : ms}`;
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
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [persistedAnalysis, setPersistedAnalysis] = useState<Record<string, ClientAnalysisTurn>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  // 분석 실행 대상이 아니라고 서버가 답한 문항. 다음 메시지부터 바로 `/api/chat` 으로 보낸다.
  const analysisUnavailableRef = useRef<Set<number>>(new Set());

  // Cleanup: abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const hasAnalysisQuestions = useMemo(
    () => (exam?.questions ?? []).some((q) => q?.ai_role === "analysis_partner"),
    [exam]
  );

  // 새로고침 뒤에도 셀 블록이 보이도록 저장된 분석 기록을 한 번 읽는다(#545).
  // 세션 입장 응답(대화 기록)에는 메시지 metadata 가 없어서 따로 읽고, created_at 과 문항 번호로 붙인다.
  useEffect(() => {
    if (!sessionId || !UUID_RE.test(sessionId) || !hasAnalysisQuestions) return;
    const controller = new AbortController();
    fetch(`/api/session/${sessionId}/analysis`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { turns?: Array<ClientAnalysisTurn & { createdAt: string; qIdx: number }> } | null) => {
        if (!data?.turns) return;
        const next: Record<string, ClientAnalysisTurn> = {};
        for (const turn of data.turns) {
          const { createdAt, qIdx, ...rest } = turn;
          next[analysisKey(qIdx, createdAt)] = rest;
        }
        setPersistedAnalysis(next);
      })
      .catch(() => {
        // 기록을 못 읽어도 대화는 그대로 보인다.
      });
    return () => controller.abort();
  }, [sessionId, hasAnalysisQuestions]);

  const mergedHistory = useMemo(() => {
    if (Object.keys(persistedAnalysis).length === 0) return chatHistory;
    return chatHistory.map((msg) => {
      if (msg.type !== "assistant" || msg.analysis) return msg;
      const found = persistedAnalysis[analysisKey(msg.qIdx, msg.timestamp)];
      return found ? { ...msg, analysis: found } : msg;
    });
  }, [chatHistory, persistedAnalysis]);

  const currentQuestionChatHistory = mergedHistory.filter(
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

    const pushAssistant = (message: Omit<ChatMessage, "type" | "qIdx">) => {
      setChatHistory((prev) => [...prev, { type: "assistant", qIdx: currentQuestion, ...message }]);
    };

    // ── 분석 실행 경로 (#545) ─────────────────────────────────────────────
    // 분석 파트너 문항이고 DB 세션이 있으면 코드 실행 라우트로 먼저 보낸다. 서버가 대상이 아니라고 하면(409,
    // 저장한 것 없음) 같은 메시지를 아래 기존 경로로 보낸다.
    const isAnalysisQuestion = exam?.questions?.[currentQuestion]?.ai_role === "analysis_partner";
    if (
      isAnalysisQuestion &&
      UUID_RE.test(actualSessionId) &&
      !analysisUnavailableRef.current.has(currentQuestion)
    ) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ANALYSIS_CLIENT_TIMEOUT_MS);
      setAnalysisProgress({ phase: "preparing", cell: 0, startedAt: Date.now(), preview: "" });

      let fallBackToChat = false;
      let finished = false;
      try {
        const res = await fetch("/api/chat/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("text/event-stream") || !res.body) {
          const errorData = await res.json().catch(() => ({}) as Record<string, unknown>);
          if (res.status === 409 && errorData?.error === ANALYSIS_UNAVAILABLE_ERROR) {
            analysisUnavailableRef.current.add(currentQuestion);
            fallBackToChat = true;
          } else {
            pushAssistant({
              message: "",
              timestamp: new Date().toISOString(),
              analysisError: res.status === 429 ? "rate_limited" : "failed",
            });
            setChatMessage(currentMsg);
            finished = true;
          }
        } else {
          for await (const sse of readSseStream(res.body, controller.signal)) {
            const event = parseAnalysisStreamEvent(sse.event, sse.data);
            if (!event) continue;
            if (event.event === "status") {
              const { phase, cell } = event.data;
              setAnalysisProgress((prev) =>
                prev ? { ...prev, phase, cell: typeof cell === "number" ? cell : prev.cell } : prev
              );
            } else if (event.event === "text") {
              const { delta } = event.data;
              setAnalysisProgress((prev) => (prev ? { ...prev, phase: "writing", preview: prev.preview + delta } : prev));
            } else if (event.event === "done") {
              const { message } = event.data;
              pushAssistant({ message: message.content, timestamp: message.timestamp, analysis: message.analysis });
              finished = true;
            } else if (event.event === "error") {
              const { code, message } = event.data;
              pushAssistant({
                message: message?.content ?? "",
                timestamp: message?.timestamp ?? new Date().toISOString(),
                ...(message ? { analysis: message.analysis } : {}),
                analysisError: code,
              });
              // 실행 기록 없이 실패했으면 학생이 그대로 다시 보낼 수 있게 입력을 돌려준다.
              if (!message) setChatMessage(currentMsg);
              finished = true;
            }
          }
          if (!finished) {
            pushAssistant({ message: "", timestamp: new Date().toISOString(), analysisError: "failed" });
            finished = true;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          if (timedOut) {
            pushAssistant({ message: "", timestamp: new Date().toISOString(), analysisError: "timeout" });
            setChatMessage(currentMsg);
          }
          // 언마운트나 새 요청으로 취소된 경우는 아무것도 하지 않는다.
        } else {
          pushAssistant({ message: "", timestamp: new Date().toISOString(), analysisError: "failed" });
          setChatMessage(currentMsg);
        }
        finished = true;
      } finally {
        clearTimeout(timeoutId);
        setAnalysisProgress(null);
      }

      if (!fallBackToChat) {
        scrollToBottom();
        setIsLoading(false);
        setIsTyping(false);
        return;
      }
    }

    // ── 기존 경로 (/api/chat) ─────────────────────────────────────────────
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 60-second timeout for streaming (longer than non-streaming since first token arrives quickly)
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
        } else if (errorData.error === "QUOTA_CHECK_UNAVAILABLE") {
          // 한도 판정이 잠시 불가능한 상태다 (#326). 서버가 이 코드를 따로
          // 만든 이유가 "일반 오류와 뭉개지 말라" 는 것인데, 여기서 안 받으면
          // 학생은 "오류가 발생했습니다" 를 보고 다시 시도하지 않는다.
          errorMessage =
            "지금은 일시적으로 응답할 수 없습니다. 잠시 뒤 다시 시도해주세요.";
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
    chatHistory: mergedHistory,
    setChatHistory,
    isLoading,
    isTyping,
    sendChatMessage,
    currentQuestionChatHistory,
    analysisProgress,
  };
}
