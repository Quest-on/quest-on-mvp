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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        <div className="h-[280px] overflow-y-auto rounded-md border p-3">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              대화 불러오는 중…
            </div>
          ) : displayMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              채점에 대해 질문해 보세요. 예: &quot;이 답안의 핵심 강점과 약점은?&quot;
            </p>
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
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="채점 관련 질문을 입력하세요"
            rows={2}
            disabled={chatMutation.isPending}
            className="min-h-0 resize-none"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            aria-label="메시지 보내기"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="space-y-3 pt-2 border-t">
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
