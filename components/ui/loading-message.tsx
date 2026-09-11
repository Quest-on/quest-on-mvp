"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface LoadingMessageProps {
  loading: boolean;
  messages: string[];
  interval?: number;
  timeout?: number;
  timeoutMessage?: string;
}

export function LoadingMessage({
  loading,
  messages,
  interval = 3000,
  timeout = 30000,
  timeoutMessage,
}: LoadingMessageProps) {
  const t = useTranslations("common.loadingMessage");
  const resolvedTimeoutMessage = timeoutMessage ?? t("timeout");
  const [messageIndex, setMessageIndex] = useState(0);
  const [isLongLoading, setIsLongLoading] = useState(false);

  useEffect(() => {
    if (!loading) {
      setMessageIndex(0);
      setIsLongLoading(false);
      return;
    }

    // Message rotation
    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, interval);

    // Timeout warning
    const timeoutTimer = setTimeout(() => {
      setIsLongLoading(true);
    }, timeout);

    return () => {
      clearInterval(messageTimer);
      clearTimeout(timeoutTimer);
    };
  }, [loading, messages.length, interval, timeout]);

  if (!loading) return null;

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-4">
      <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="type-field-label">
          {isLongLoading ? resolvedTimeoutMessage : messages[messageIndex]}
        </span>
      </div>
      {isLongLoading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <AlertCircle className="w-3 h-3" />
          <span>{t("networkHint")}</span>
        </div>
      )}
    </div>
  );
}

