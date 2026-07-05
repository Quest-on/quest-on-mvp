"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { createSupabaseClient } from "@/lib/supabase-client";
import { decompressData } from "@/lib/compression";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useTranslations, useLocale } from "next-intl";

interface LiveMessage {
  id: string;
  session_id: string;
  q_idx: number;
  role: "user" | "ai"; // "user" for student questions, "ai" for AI responses
  content: string;
  created_at: string;
  student: {
    id: string;
    name: string;
    email: string;
    student_number?: string;
    school?: string;
  };
}

interface StudentLiveMonitoringProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  studentName: string;
  studentNumber?: string;
  school?: string;
}

export function StudentLiveMonitoring({
  open,
  onOpenChange,
  sessionId,
  studentName,
  studentNumber,
  school,
}: StudentLiveMonitoringProps) {
  const t = useTranslations("grading");
  const locale = useLocale() as "ko" | "en";
  const dateFnsLocale = locale === "ko" ? ko : enUS;
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const messagesMapRef = useRef<Map<string, LiveMessage>>(new Map());
  const isUserScrolledRef = useRef(false);

  // localStorage에서 메시지 복원
  const storageKey = `live_messages_${sessionId}`;

  // 초기 메시지 로드 및 localStorage에서 복원
  const loadInitialMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      // localStorage에서 이전 메시지 복원
      const savedMessages = localStorage.getItem(storageKey);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
          parsed.forEach((msg: LiveMessage) => {
            messagesMapRef.current.set(msg.id, msg);
          });
        } catch (e) {
          // Ignore parse errors
        }
      }

      // API에서 최신 메시지 가져오기
      const response = await fetch(`/api/session/${sessionId}/live-messages`);
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        
        // 중복 제거하면서 추가
        newMessages.forEach((msg: LiveMessage) => {
          if (!messagesMapRef.current.has(msg.id)) {
            messagesMapRef.current.set(msg.id, msg);
          }
        });

        const allMessages = Array.from(messagesMapRef.current.values())
          .sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
          .slice(-100);

        setMessages(allMessages);

        // localStorage에 저장
        localStorage.setItem(storageKey, JSON.stringify(allMessages));

        // 초기 로드 후 하단으로 스크롤
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 0);
      }
    } catch (error) {
      // Ignore load errors
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, storageKey]);

  // Supabase Realtime 구독
  useEffect(() => {
    if (!open || !sessionId) return;

    loadInitialMessages();

    // Supabase 클라이언트 생성
    const supabase = createSupabaseClient();

    // messages 테이블에 대한 실시간 구독
    const channel = supabase
      .channel(`student-messages:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            session_id: string;
            q_idx: number;
            role: string;
            content: string;
            compressed_content?: string;
            created_at: string;
          };

          // user와 ai 메시지 모두 표시

          // 이미 있는 메시지면 스킵
          if (messagesMapRef.current.has(newMessage.id)) return;

          // 압축된 내용이 있으면 압축 해제
          let content = newMessage.content;
          if (newMessage.compressed_content) {
            try {
              const decompressed = decompressData(newMessage.compressed_content);
              content = typeof decompressed === "string" ? decompressed : content;
            } catch (error) {
              // Use original content on decompression failure
            }
          }

          const liveMessage: LiveMessage = {
            id: newMessage.id,
            session_id: newMessage.session_id,
            q_idx: newMessage.q_idx,
            role: newMessage.role === "ai" ? "ai" : "user",
            content: content.substring(0, 500),
            created_at: newMessage.created_at,
            student: {
              id: sessionId,
              name: studentName,
              email: "",
              student_number: studentNumber,
              school: school,
            },
          };

          // 메시지 추가
          messagesMapRef.current.set(liveMessage.id, liveMessage);
          
          setMessages((prev) => {
            const updated = [...prev, liveMessage]
              .filter((msg, index, self) =>
                index === self.findIndex((m) => m.id === msg.id)
              )
              .slice(-100);

            // localStorage에 저장
            localStorage.setItem(storageKey, JSON.stringify(updated));

            return updated;
          });

          // 사용자가 스크롤을 올리지 않았으면 하단으로 자동 스크롤
          if (scrollRef.current && !isUserScrolledRef.current) {
            setTimeout(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }, 0);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      // 구독 해제
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [open, sessionId, studentName, studentNumber, school, storageKey, loadInitialMessages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {t("studentLiveMonitoring.dialogTitle", { studentName })}
          </DialogTitle>
          <DialogDescription>
            {studentNumber && t("studentLiveMonitoring.dialogDescNumber", { number: studentNumber })}
            {school && t("studentLiveMonitoring.dialogDescSchool", { school })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div
            className="h-[600px] overflow-y-auto pr-2"
            ref={scrollRef}
            onScroll={() => {
              if (!scrollRef.current) return;
              const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
              const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
              isUserScrolledRef.current = !isAtBottom;
            }}
          >
            {isLoading && messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
                <p>{t("studentLiveMonitoring.loading")}</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t("studentLiveMonitoring.empty")}</p>
                <p className="text-sm mt-2">
                  {t("studentLiveMonitoring.emptyDesc")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`border rounded-lg p-4 hover:bg-muted/50 transition-colors ${
                      message.role === "ai" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={message.role === "ai" ? "default" : "outline"}
                            className={`text-xs ${
                              message.role === "ai"
                                ? "bg-blue-500 text-white"
                                : ""
                            }`}
                          >
                            {message.role === "ai" ? t("studentLiveMonitoring.badgeAiReply") : t("studentLiveMonitoring.badgeStudentQuestion")}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {t("studentLiveMonitoring.questionBadge", { number: message.q_idx + 1 })}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatDistanceToNow(new Date(message.created_at), {
                          addSuffix: true,
                          locale: dateFnsLocale,
                        })}
                      </span>
                    </div>
                    <div
                      className={`rounded-md p-3 ${
                        message.role === "ai"
                          ? "bg-blue-100/50 dark:bg-blue-900/30"
                          : "bg-muted/50"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                        {message.content.length >= 500 && "..."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
