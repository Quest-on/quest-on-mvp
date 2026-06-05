"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Bot, Loader2, Send, User } from "lucide-react";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error-messages";
import { createClientMessageId } from "@/lib/client-message-id";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";

export type CaseGradingChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at?: string;
};

interface CaseGradingChatProps {
  sessionId: string;
  qIdx: number;
  questionNumber: number;
  initialScore?: number;
  initialComment?: string;
  onCommitPendingChange?: (pending: boolean) => void;
}

/** Parse optional suggested score from assistant text (e.g. "추천 점수: 85"). */
export function parseSuggestedScoreFromText(text: string): number | null {
  const patterns = [
    /(?:추천\s*)?점수\s*[:：]\s*(\d{1,3})\s*(?:\/\s*100)?/i,
    /suggested\s+score\s*[:：]\s*(\d{1,3})\s*(?:\/\s*100)?/i,
    /(\d{1,3})\s*\/\s*100\s*점?/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const n = parseInt(match[1], 10);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

export function CaseGradingChat({
  sessionId,
  qIdx,
  questionNumber,
  initialScore,
  initialComment = "",
  onCommitPendingChange,
}: CaseGradingChatProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const sendInFlightRef = useRef(false);
  const [input, setInput] = useState("");
  const [score, setScore] = useState<string>(
    initialScore !== undefined ? String(initialScore) : "",
  );
  const [comment, setComment] = useState(initialComment);

  const { data, isLoading: historyLoading } = useQuery({
    queryKey: qk.instructor.caseGradeChat(sessionId, qIdx),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/session/${sessionId}/case-grade/chat?qIdx=${qIdx}`,
        { signal },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "채점 대화를 불러오지 못했습니다");
      }
      const json = (await res.json()) as { messages: CaseGradingChatMessage[] };
      return json.messages ?? [];
    },
    enabled: !!sessionId,
  });

  const messages = useMemo(() => data ?? [], [data]);

  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      clientMessageId,
    }: {
      message: string;
      clientMessageId: string;
    }) => {
      const res = await fetch(`/api/session/${sessionId}/case-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qIdx, message, clientMessageId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          extractErrorMessage(err, "AI 응답을 받지 못했습니다", res.status),
        );
      }
      return res.json() as Promise<{
        assistantMessage: { id: string; role: string; content: string };
      }>;
    },
    onSuccess: (result) => {
      setInput("");
      const suggested = parseSuggestedScoreFromText(
        result.assistantMessage.content,
      );
      if (suggested !== null) {
        setScore(String(suggested));
      }
      queryClient.invalidateQueries({
        queryKey: qk.instructor.caseGradeChat(sessionId, qIdx),
      });
      // 연속 질문을 위해 전송 후 입력란으로 포커스를 되돌린다.
      // onSuccess 시점엔 아직 isPending=true(=disabled)라, 리렌더로 disabled가
      // 풀린 다음 프레임에 focus 해야 실제로 포커스가 들어간다.
      requestAnimationFrame(() => chatInputRef.current?.focus());
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      sendInFlightRef.current = false;
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const scoreNum = parseInt(score, 10);
      if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
        throw new Error("0~100 사이의 점수를 입력해주세요");
      }
      const res = await fetch(`/api/session/${sessionId}/case-grade/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qIdx,
          score: scoreNum,
          comment: comment.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          extractErrorMessage(err, "채점 저장에 실패했습니다", res.status),
        );
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("채점이 저장되었습니다.");
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(sessionId),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    onCommitPendingChange?.(commitMutation.isPending);
  }, [commitMutation.isPending, onCommitPendingChange]);

  // 메시지 영역 '내부'에서만 스크롤한다. block:"nearest"가 없으면 가장 가까운
  // 스크롤 조상(=페이지 문서)까지 끌려가 답변 도착 시 화면 전체가 점프한다.
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    chatMutation.mutate({
      message: trimmed,
      clientMessageId: createClientMessageId(),
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayMessages = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 채점 대화</CardTitle>
        <CardDescription>
          {questionNumber}번 문항 — 답안·대화 맥락을 바탕으로 AI와 채점을 논의합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={historyLoading}
          className="h-[clamp(280px,42vh,460px)] overflow-y-auto rounded-md border bg-muted/30 p-3"
        >
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              대화 불러오는 중…
            </div>
          ) : displayMessages.length === 0 && !chatMutation.isPending ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                AI와 채점을 논의해 보세요
              </p>
              <p className="text-xs text-muted-foreground">
                예: &quot;이 답안의 핵심 강점과 약점은?&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <AIMessageRenderer
                        content={msg.content}
                        timestamp={msg.created_at ?? new Date().toISOString()}
                        variant="plain"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    AI가 답변을 작성 중…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/40 p-2">
          <Label htmlFor={`case-grade-chat-${qIdx}`} className="sr-only">
            AI에게 보낼 채점 질문
          </Label>
          <div className="flex items-end gap-2">
            <Textarea
              id={`case-grade-chat-${qIdx}`}
              ref={chatInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="AI에게 채점 질문하기…"
              rows={2}
              disabled={chatMutation.isPending}
              className="min-h-0 resize-none bg-background"
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              aria-busy={chatMutation.isPending}
              aria-label="메시지 보내기"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 px-0.5 text-xs text-muted-foreground">
            Enter 전송 · Shift+Enter 줄바꿈
          </p>
        </div>

        <div className="space-y-3 rounded-md border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">채점 입력</p>
          <div className="space-y-2">
            <Label htmlFor={`case-grade-score-${qIdx}`}>점수 (0–100)</Label>
            <Input
              id={`case-grade-score-${qIdx}`}
              data-testid="grade-score-input"
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`case-grade-comment-${qIdx}`}>코멘트</Label>
            <Textarea
              id={`case-grade-comment-${qIdx}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="학생에게 전달할 피드백"
            />
          </div>
          <Button
            type="button"
            className="w-full"
            data-testid="grade-save-btn"
            onClick={() => commitMutation.mutate()}
            disabled={commitMutation.isPending}
          >
            {commitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                저장 중…
              </>
            ) : (
              "채점 저장"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
