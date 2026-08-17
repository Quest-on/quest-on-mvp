"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Play, Pause } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
// ScrollArea will be replaced with div for now
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
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

interface LiveMonitoringCardProps {
  examId: string;
}

export function LiveMonitoringCard({ examId }: LiveMonitoringCardProps) {
  const t = useTranslations("grading");
  const locale = useLocale() as "ko" | "en";
  const dateFnsLocale = locale === "ko" ? ko : enUS;
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(() => {
    // 페이지를 나갔다 돌아왔을 때를 위해 localStorage에서 복원
    if (typeof window !== "undefined") {
      return localStorage.getItem(`live_monitoring_last_fetch_${examId}`);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLiveMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = `/api/exam/${examId}/live-messages${
        lastFetchTime ? `?since=${lastFetchTime}` : ""
      }`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch live messages");
      }

      const data = await response.json();
      const newMessages = data.messages || [];

      if (newMessages.length > 0) {
        // Add new messages to the list (avoid duplicates)
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueNewMessages = newMessages.filter(
            (m: LiveMessage) => !existingIds.has(m.id)
          );
          return [...uniqueNewMessages, ...prev].slice(0, 100); // Keep only latest 100
        });

        // Scroll to top when new messages arrive
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      }

      // Update last fetch time
      const newTimestamp = data.timestamp || new Date().toISOString();
      setLastFetchTime(newTimestamp);
      // localStorage에 저장하여 페이지를 나갔다 돌아와도 유지
      if (typeof window !== "undefined") {
        localStorage.setItem(`live_monitoring_last_fetch_${examId}`, newTimestamp);
      }
    } catch {
      // Fetch error handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, [examId, lastFetchTime]);

  // Page Visibility API: 탭이 비활성화되면 polling 일시 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      
      // 페이지가 다시 보이면 즉시 최신 메시지 가져오기
      if (visible && isMonitoring) {
        fetchLiveMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    setIsPageVisible(!document.hidden);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMonitoring, fetchLiveMessages]);

  // Initial fetch and polling
  useEffect(() => {
    if (!isMonitoring || !isPageVisible) return;

    // Initial fetch (페이지가 보일 때)
    fetchLiveMessages();

    // Polling: Fetch every 3 seconds when monitoring is active and page is visible
    const interval = setInterval(() => {
      if (isPageVisible) {
        fetchLiveMessages();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [isMonitoring, examId, isPageVisible, fetchLiveMessages]);

  const handleToggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
  };

  const handleRefresh = () => {
    setLastFetchTime(null);
    setMessages([]);
    fetchLiveMessages();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t("liveMonitoring.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("liveMonitoring.cardDescription")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isMonitoring && isPageVisible ? "default" : "secondary"}
              className={
                isMonitoring && isPageVisible
                  ? "bg-success-solid text-white animate-pulse"
                  : isMonitoring && !isPageVisible
                  ? "bg-warning-solid text-white"
                  : "bg-muted0"
              }
            >
              {isMonitoring
                ? isPageVisible
                  ? t("liveMonitoring.badgeActive")
                  : t("liveMonitoring.badgeBackground")
                : t("liveMonitoring.badgeStopped")}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleMonitoring}
              disabled={isLoading}
            >
              {isMonitoring ? (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  {t("liveMonitoring.stopButton")}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  {t("liveMonitoring.startButton")}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[600px] overflow-y-auto pr-2" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("liveMonitoring.emptyTitle")}</p>
              <p className="text-sm mt-2">
                {t("liveMonitoring.emptyDesc")}
              </p>
            </div>
          ) : (
              <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`border rounded-lg p-4 hover:bg-muted/50 transition-colors ${
                    message.role === "ai" ? "bg-info-surface/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">
                          {message.role === "ai" ? "AI" : message.student.name}
                        </h4>
                        {message.role === "user" && message.student.student_number && (
                          <span className="type-meta">
                            ({message.student.student_number})
                          </span>
                        )}
                        <Badge
                          variant={message.role === "ai" ? "default" : "outline"}
                          className={`text-xs ${
                            message.role === "ai"
                              ? "bg-info-solid text-white"
                              : ""
                          }`}
                        >
                          {message.role === "ai" ? t("liveMonitoring.badgeAiReply") : t("liveMonitoring.badgeStudentQuestion")}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t("liveMonitoring.questionBadge", { number: message.q_idx + 1 })}
                        </Badge>
                      </div>
                      {message.role === "user" && message.student.school && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {message.student.school}
                        </p>
                      )}
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
                        ? "bg-info-subtle/50"
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
      </CardContent>
    </Card>
  );
}
