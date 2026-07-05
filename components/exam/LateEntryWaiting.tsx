"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, Loader2, XCircle } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

interface LateEntryWaitingProps {
  examTitle?: string;
  examCode?: string;
  sessionId?: string;
  examId?: string;
  examDuration?: number;
  questionCount?: number;
  onGateStart?: (gateState: {
    sessionStatus?: string;
    sessionStartTime?: string | null;
    timeRemaining?: number | null;
  }) => void;
}

export function LateEntryWaiting({
  examTitle,
  examCode,
  sessionId,
  examId,
  examDuration,
  questionCount,
  onGateStart,
}: LateEntryWaitingProps) {
  const t = useTranslations("exam");
  const router = useRouter();
  const [isDenied, setIsDenied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const onGateStartRef = useRef(onGateStart);
  onGateStartRef.current = onGateStart;

  // Elapsed time counter
  useEffect(() => {
    if (isDenied) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isDenied]);

  // Supabase Realtime: 세션 상태 변경 감지 (approve → in_progress, deny → denied)
  useEffect(() => {
    if (!sessionId) return;

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
            onGateStartRef.current?.({
              sessionStatus: "in_progress",
              sessionStartTime: startedAt,
              timeRemaining: null,
            });
          } else if (newStatus === "denied") {
            setIsDenied(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  if (isDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl">{t("lateEntry.deniedTitle")}</CardTitle>
            <CardDescription className="text-base mt-2">
              {t("lateEntry.deniedDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t("lateEntry.deniedAlert")}
              </AlertDescription>
            </Alert>
            <div className="flex justify-center">
              <Button onClick={() => router.push("/student")} variant="outline">
                {t("lateEntry.deniedBack")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
              <Clock className="h-6 w-6 text-amber-500 absolute top-3 left-3" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t("lateEntry.pendingTitle")}</CardTitle>
          <CardDescription className="text-base mt-2">
            {t("lateEntry.pendingDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 시험 정보 */}
          {examTitle && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="space-y-2">
                <h3 className="font-semibold">{t("lateEntry.examInfoTitle")}</h3>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">{t("lateEntry.examName")}</span> {examTitle}</p>
                  {examCode && (
                    <p><span className="font-medium">{t("lateEntry.examCode")}</span> {examCode}</p>
                  )}
                  {examDuration != null && examDuration > 0 && (
                    <p><span className="font-medium">{t("lateEntry.examDuration")}</span> {t("lateEntry.examDurationValue", { duration: examDuration })}</p>
                  )}
                  {questionCount != null && questionCount > 0 && (
                    <p><span className="font-medium">{t("lateEntry.questionCount")}</span> {t("lateEntry.questionCountValue", { count: questionCount })}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 안내 메시지 */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold text-amber-600 dark:text-amber-400">{t("lateEntry.lateAlertTitle")}</p>
                <p className="text-sm">
                  {t("lateEntry.lateAlertDescription")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("lateEntry.doNotClose")}
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* 상태 표시 */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("lateEntry.waitingApproval")}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("lateEntry.elapsedTime", { minutes: Math.floor(elapsedSeconds / 60), seconds: (elapsedSeconds % 60).toString().padStart(2, "0") })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
