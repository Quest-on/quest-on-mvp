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

  // Realtime 이벤트를 놓쳐도 복구한다.
  //
  // 구독이 붙기 전에 교수자가 승인했거나 연결이 끊기면, 서버 타이머는 계속
  // 줄어드는데 화면은 "강사 승인 대기 중"에 영원히 남는다. 학생은 나가는
  // 버튼도 없어 갇힌다. 일반 대기실에는 이미 같은 폴백이 있다.
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        // 예전에는 POST /api/supa {action:"check_gate_status"} 를 불렀는데 그 액션은
        // 서버에 등록된 적이 없어 항상 400 이었다. 즉 이 폴백은 존재하지
        // 않았고, 아래 catch 가 조용히 삼켜서 드러나지도 않았다 (이슈 #344).
        const response = await fetch(`/api/session/${sessionId}/gate`);
        if (!response.ok) return;
        // successJson 은 봉투로 감싸지 않고 최상위에 펼친다(lib/api-response.ts).
        const gate = await response.json();
        const status = gate?.status;

        if (status === "in_progress") {
          onGateStartRef.current?.({
            sessionStatus: "in_progress",
            sessionStartTime: gate?.sessionStartTime ?? null,
            timeRemaining: gate?.timeRemaining ?? null,
          });
        } else if (status === "denied") {
          setIsDenied(true);
        }
      } catch {
        // 폴백이 실패해도 조용히 넘어간다. Realtime 이 살아 있을 수 있다.
      }
    };

    void poll();
    const timer = setInterval(poll, 15_000);
    return () => clearInterval(timer);
  }, [sessionId]);

  if (isDenied) {
    return (
      <div className="min-h-screen surface-page-gradient flex items-center justify-center p-4">
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
    <div className="min-h-screen surface-page-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 text-warning-text animate-spin" />
              <Clock className="h-6 w-6 text-warning-text absolute top-3 left-3" />
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
                <p className="font-semibold text-warning-text">{t("lateEntry.lateAlertTitle")}</p>
                <p className="text-sm">
                  {t("lateEntry.lateAlertDescription")}
                </p>
                <p className="type-hint">
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
            <div className="type-meta">
              {t("lateEntry.elapsedTime", { minutes: Math.floor(elapsedSeconds / 60), seconds: (elapsedSeconds % 60).toString().padStart(2, "0") })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
