"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, MessageSquare } from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { AnalysisTurnBlock } from "@/components/chat/AnalysisTurnBlock";
import type { ClientAnalysisTurn } from "@/lib/analysis-exec/metadata";
import { CopyMessageButton } from "@/components/chat/CopyMessageButton";
import { useTranslations } from "next-intl";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}

interface AIConversationsCardProps {
  messages: Conversation[];
  /**
   * 메시지 id 별 분석 턴 실행 기록(#545). 있으면 AI 답변 아래에 코드(접힘), 결과, 그림을 읽기 전용으로 보인다.
   */
  analysisByMessageId?: Record<string, ClientAnalysisTurn>;
  /**
   * 실행 기록을 불러오지 못했다(속도 제한, 네트워크 등). 빈 기록과 구분해 안내한다. 빈 기록으로 보이면 학생이 코드를
   * 실행하지 않은 것으로 읽힌다.
   */
  analysisLoadFailed?: boolean;
  /** 실행 기록을 다시 불러온다. */
  onRetryAnalysis?: () => void;
}

export function AIConversationsCard({
  messages,
  analysisByMessageId,
  analysisLoadFailed,
  onRetryAnalysis,
}: AIConversationsCardProps) {
  const t = useTranslations("grading");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-info-text" />
          {t("aiConversations.title")}
        </CardTitle>
        <CardDescription>{t("aiConversations.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {analysisLoadFailed && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("aiConversations.analysisLoadFailed")}</span>
            {onRetryAnalysis && (
              <button
                type="button"
                onClick={onRetryAnalysis}
                className="ml-auto min-h-[32px] rounded px-2 font-medium underline underline-offset-2 hover:no-underline"
              >
                {t("aiConversations.analysisRetry")}
              </button>
            )}
          </div>
        )}
        {messages.length > 0 ? (
          <div className="space-y-4 sm:space-y-6 max-h-96 overflow-y-auto p-2 sm:p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {message.role === "user" ? (
                  <div className="group bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 sm:px-5 py-3 sm:py-3.5 max-w-[85%] sm:max-w-[70%] shadow-lg shadow-primary/20 relative transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
                    <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-2 sm:mt-2.5">
                      <CopyMessageButton text={message.content} className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" />
                      <p className="text-xs opacity-80 font-medium">
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <AIMessageRenderer
                    content={message.content}
                    timestamp={message.created_at}
                    attachment={
                      analysisByMessageId?.[message.id] ? (
                        <AnalysisTurnBlock analysis={analysisByMessageId[message.id]} viewer="instructor" />
                      ) : undefined
                    }
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t("aiConversations.empty")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

