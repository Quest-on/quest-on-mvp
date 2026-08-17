"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

interface ChatLoadingIndicatorProps {
  isTyping: boolean;
}

export function ChatLoadingIndicator({ isTyping }: ChatLoadingIndicatorProps) {
  const t = useTranslations("exam");
  const [messageIndex, setMessageIndex] = useState(0);
  const [isLongLoading, setIsLongLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const messages = [
    t("chatLoading.analyzing"),
    t("chatLoading.writing"),
    t("chatLoading.reviewing"),
    t("chatLoading.finishing"),
  ];

  useEffect(() => {
    if (!isTyping) {
      setMessageIndex(0);
      setIsLongLoading(false);
      setProgress(0);
      return;
    }

    // Message rotation every 3 seconds
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);

    // Simulated progress bar (eases out before 90%)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + (90 - prev) * 0.05;
      });
    }, 500);

    // Timeout warning after 30 seconds
    const timeoutTimer = setTimeout(() => {
      setIsLongLoading(true);
    }, 30000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearTimeout(timeoutTimer);
    };
  }, [isTyping, messages.length]);

  if (!isTyping) return null;

  return (
    <div className="flex flex-col space-y-2 max-w-[80%]">
      <div className="bg-muted/80 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
          </div>
          <span className="text-sm text-muted-foreground animate-pulse">
            {isLongLoading
              ? t("chatLoading.longLoading")
              : messages[messageIndex]}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mt-2">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
      </div>
      {isLongLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-1 px-1">
          <AlertCircle className="w-3 h-3" />
          <span>{t("chatLoading.networkWarning")}</span>
        </div>
      )}
    </div>
  );
}

interface SubmissionOverlayProps {
  isSubmitting: boolean;
}

export function SubmissionOverlay({ isSubmitting }: SubmissionOverlayProps) {
  const t = useTranslations("exam");
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isTimeout, setIsTimeout] = useState(false);

  const messages = [
    t("submissionOverlay.saving"),
    t("submissionOverlay.preparing"),
    t("submissionOverlay.transmitting"),
    t("submissionOverlay.finishing"),
  ];

  useEffect(() => {
    if (!isSubmitting) {
      setMessageIndex(0);
      setProgress(0);
      setIsTimeout(false);
      return;
    }

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 4000);

    // Simulated progress bar (eases out before 90%)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + (90 - prev) * 0.05;
      });
    }, 500);

    // Timeout after 60s
    const timeout = setTimeout(() => {
      setIsTimeout(true);
    }, 60000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearTimeout(timeout);
    };
  }, [isSubmitting, messages.length]);

  if (!isSubmitting) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border shadow-lg rounded-lg p-8 max-w-md w-full mx-4 flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>

        <div className="space-y-3 w-full">
          <h3 className="text-xl font-bold">{t("submissionOverlay.title")}</h3>
          <p className="text-muted-foreground animate-pulse min-h-[24px]">
            {isTimeout
              ? t("submissionOverlay.timeout")
              : messages[messageIndex]}
          </p>
          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
        </div>

        <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-left">
            {t("submissionOverlay.doNotClose")}
          </span>
        </div>
      </div>
    </div>
  );
}

