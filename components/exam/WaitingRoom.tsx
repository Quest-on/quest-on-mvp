"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Users, Loader2 } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase-client";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";

interface WaitingRoomProps {
  examTitle?: string;
  examCode?: string;
  allowDraftInWaiting?: boolean;
  allowChatInWaiting?: boolean;
  onGateStart?: (gateState: {
    sessionStatus?: string;
    sessionStartTime?: string | null;
    timeRemaining?: number | null;
  }) => void;
  sessionId?: string;
  examId?: string;
  studentId?: string;
  examDuration?: number;
  questionCount?: number;
  examHasEssay: boolean;
}

export function WaitingRoom({
  examTitle,
  examCode,
  allowDraftInWaiting = false,
  allowChatInWaiting = false,
  onGateStart,
  sessionId,
  examId,
  examDuration,
  questionCount,
  examHasEssay,
}: WaitingRoomProps) {
  const t = useTranslations("exam");
  const [isWaiting, setIsWaiting] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const onGateStartRef = useRef(onGateStart);
  onGateStartRef.current = onGateStart;

  // Elapsed time counter
  useEffect(() => {
    if (!isWaiting) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isWaiting]);

  // Lightweight status check (used for fallback polling only)
  const checkExamStatus = useCallback(async () => {
    if (!examId || !sessionId) return;
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_exam_gate_status",
          data: { examId, sessionId },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.gateStarted && result.sessionStatus === "in_progress") {
          setIsWaiting(false);
          onGateStartRef.current?.({
            sessionStatus: result.sessionStatus,
            sessionStartTime: result.sessionStartTime ?? null,
            timeRemaining: result.timeRemaining ?? null,
          });
        }
      }
    } catch {
      // Non-critical polling error
    }
  }, [examId, sessionId]);

  // Supabase Realtime subscription for exam status changes
  useEffect(() => {
    if (!examId || !isWaiting) return;

    const supabase = createSupabaseClient();

    const channel = supabase
      .channel(`exam_gate_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          // When exam status changes to "running", trigger gate start check
          // Add random jitter (0-3s) to spread concurrent requests from all waiting students
          const newStatus = payload.new?.status;
          if (newStatus === "running") {
            const delay = Math.random() * 3000;
            setTimeout(checkExamStatus, delay);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, isWaiting, checkExamStatus]);

  // Supabase Realtime subscription for session status changes (direct detection)
  useEffect(() => {
    if (!sessionId || !isWaiting) return;

    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`session_gate_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus === "in_progress") {
            const startedAt =
              payload.new?.attempt_timer_started_at ||
              payload.new?.started_at ||
              null;
            setIsWaiting(false);
            onGateStartRef.current?.({
              sessionStatus: "in_progress",
              sessionStartTime: startedAt,
              timeRemaining: null,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isWaiting]);

  // Fallback polling: 10-second interval for faster exam start detection
  useEffect(() => {
    if (!sessionId || !examId || !isWaiting) return;

    // Initial check with small jitter to avoid synchronized requests on mount
    const initialDelay = Math.random() * 2000;
    const initialTimer = setTimeout(checkExamStatus, initialDelay);

    // Fallback polling: randomized 10-20s interval to avoid synchronized thundering herd
    const pollInterval = 10000 + Math.random() * 10000;
    const interval = setInterval(checkExamStatus, pollInterval);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [sessionId, examId, isWaiting, checkExamStatus]);

  return (
    <CenteredViewportShell
      className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900"
      contentClassName="max-w-2xl"
    >
      <Card className="w-full" data-testid="waiting-room">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <Clock className="h-6 w-6 text-primary absolute top-3 left-3" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t("waitingRoom.title")}</CardTitle>
          <CardDescription className="text-base mt-2">
            {t("waitingRoom.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 시험 정보 */}
          {examTitle && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t("waitingRoom.examInfoTitle")}
                </h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="font-medium">{t("waitingRoom.examName")}</span> {examTitle}
                  </p>
                  {examCode && (
                    <p>
                      <span className="font-medium">{t("waitingRoom.examCode")}</span> {examCode}
                    </p>
                  )}
                  {examDuration != null && examDuration > 0 && (
                    <p>
                      <span className="font-medium">{t("waitingRoom.examDuration")}</span> {t("waitingRoom.examDurationValue", { duration: examDuration })}
                    </p>
                  )}
                  {examDuration === 0 && (
                    <p>
                      <span className="font-medium">{t("waitingRoom.examDuration")}</span> {t("waitingRoom.examDurationUnlimited")}
                    </p>
                  )}
                  {questionCount != null && questionCount > 0 && (
                    <p>
                      <span className="font-medium">{t("waitingRoom.questionCount")}</span> {t("waitingRoom.questionCountValue", { count: questionCount })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 안내 메시지 */}
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">{t("waitingRoom.waitingTitle")}</p>
                <p className="text-sm">
                  {t("waitingRoom.waitingDescription")}
                </p>
                {!allowDraftInWaiting && !allowChatInWaiting && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {examHasEssay
                      ? t("waitingRoom.noAccessEssay")
                      : t("waitingRoom.noAccessObjective")}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* Drafting 허용 안내 */}
          {allowDraftInWaiting && (
            <Alert variant="default">
              <AlertDescription>
                <p className="text-sm">
                  <span className="font-semibold">{t("waitingRoom.draftAllowedNote")}</span> {t("waitingRoom.draftAllowedDescription")}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* 상태 표시 */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("waitingRoom.waitingSignal")}</span>
            </div>
            <div className="type-meta">
              {t("waitingRoom.elapsedTime", { minutes: Math.floor(elapsedSeconds / 60), seconds: (elapsedSeconds % 60).toString().padStart(2, "0") })}
            </div>
          </div>
        </CardContent>
      </Card>
    </CenteredViewportShell>
  );
}
