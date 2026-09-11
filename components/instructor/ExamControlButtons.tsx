"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, Square, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseClient } from "@/lib/supabase-client";
import { qk } from "@/lib/query-keys";
import { useTranslations } from "next-intl";

interface ExamControlButtonsProps {
  examId: string;
  examStatus: string;
  hasGateFields?: boolean; // Gate 필드(open_at, close_at)가 있는지 여부
  /**
   * 데모 시험인가.
   *
   * 데모의 주 행동은 "학생 시점으로 해보기" 하나다. 시작 버튼까지 primary 로
   * 두면 막 온보딩을 마친 사람 눈에 파란 버튼이 둘 들어온다. 게다가 데모는
   * 발행 대상이 아니고(is_demo 는 발행 카운트에서 제외), 채점도 시작·종료 없이
   * 열린다(isGradingOpen 의 is_demo 예외). 시작은 할 수 있되 권하지는 않는다.
   */
  isDemo?: boolean;
  onStatusChange?: (newStatus: string, startedAt?: string | null) => void;
}

export function ExamControlButtons({
  examId,
  examStatus,
  hasGateFields = false,
  isDemo = false,
  onStatusChange,
}: ExamControlButtonsProps) {
  const t = useTranslations("authoring");
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [closeAt, setCloseAt] = useState<string>("");
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => qk.instructor.waitingStudents(examId), [examId]);

  // 대기 중인 학생 목록을 가져오는 함수
  const fetchWaitingStudents = async () => {
    const response = await fetch(`/api/exam/${examId}/sessions`);
    if (!response.ok) {
      throw new Error("Failed to fetch waiting students");
    }
    const data = await response.json();
    
    // Show ALL students with waiting status — dead sessions get cleaned up on exam start
    // (they transition to in_progress and time out if the student is gone)
    interface SessionRecord {
      student_id: string;
      status?: string;
      submitted_at?: string | null;
      student_name?: string;
      student_email?: string;
      student_number?: string;
      student_school?: string;
    }

    const waiting = (data.sessions || []).filter((session: SessionRecord) => {
      return session.status === "waiting" || (!session.status && !session.submitted_at);
    });

    // 학생 정보 추출 (중복 제거)
    const studentMap = new Map<string, {
      student_id: string;
      name: string;
      student_number?: string;
      school?: string;
    }>();

    waiting.forEach((session: SessionRecord) => {
      if (!studentMap.has(session.student_id)) {
        studentMap.set(session.student_id, {
          student_id: session.student_id,
          name: session.student_name || session.student_email || t("examControlButtons.studentNameFallback"),
          student_number: session.student_number,
          school: session.student_school,
        });
      }
    });
    
    return Array.from(studentMap.values());
  };

  // TanStack Query로 대기 중인 학생 목록 가져오기
  const { data: waitingStudents = [], isLoading: loadingWaitingStudents, isError: isWaitingError } = useQuery({
    queryKey,
    queryFn: fetchWaitingStudents,
    enabled: showStartDialog, // 모달이 열렸을 때만 쿼리 활성화
    refetchInterval: 5000, // 5초마다 강제 동기화 (Realtime 누락 안전망)
    staleTime: 0, // invalidation 즉시 refetch 보장
  });

  // Supabase Realtime 구독 설정
  useEffect(() => {
    if (!showStartDialog) return; // 모달이 닫혀있으면 구독하지 않음

    const supabase = createSupabaseClient();
    
    // sessions 테이블의 변경사항을 실시간으로 구독
    const channel = supabase
      .channel(`waiting_room_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE 모두 감지
          schema: "public",
          table: "sessions",
          filter: `exam_id=eq.${examId}`, // 해당 시험의 세션만 필터링
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    // cleanup: 컴포넌트 언마운트 또는 모달이 닫힐 때 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, [showStartDialog, examId, queryClient, queryKey]);

  const handleStartExam = async () => {
    setIsStarting(true);
    try {
      const response = await fetch(`/api/exam/${examId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          close_at: closeAt || null,
        }),
      });

      if (response.ok) {
        toast.success(t("examControlButtons.toastStarted"));
        setShowStartDialog(false);
        const now = new Date().toISOString();
        if (onStatusChange) {
          onStatusChange("running", now);
        } else {
          router.refresh();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(
          errorData.message || t("examControlButtons.toastStartFailed")
        );
      }
    } catch {
      toast.error(t("examControlButtons.toastStartError"));
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndExam = async () => {
    setIsEnding(true);
    try {
      const response = await fetch(`/api/exam/${examId}/end`, {
        method: "POST",
      });

      if (response.ok) {
        setShowEndDialog(false);
        toast.success(t("examControlButtons.toastEnded"));
        router.push("/instructor");
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(
          errorData.message || t("examControlButtons.toastEndFailed")
        );
      }
    } catch {
      toast.error(t("examControlButtons.toastEndError"));
    } finally {
      setIsEnding(false);
    }
  };

  // 상태별 배너 및 버튼 표시
  const getStatusDisplay = () => {
    switch (examStatus) {
      case "scheduled":
        return {
          badge: (
            <Badge variant="secondary" className="bg-warning-subtle text-warning-text">
              {t("examControlButtons.statusScheduled")}
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              variant={isDemo ? "outline" : "default"}
              size={isDemo ? "sm" : "default"}
              className={isDemo ? undefined : "bg-primary hover:bg-primary/90"}
            >
              <Play className="h-4 w-4 mr-2" />
              {t("examControlButtons.buttonStart")}
            </Button>
          ),
        };
      case "draft":
        // 기본적으로 항상 "시험 시작" 버튼 표시
        return {
          badge: (
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
              {t("examControlButtons.statusDraft")}
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              variant={isDemo ? "outline" : "default"}
              size={isDemo ? "sm" : "default"}
              className={isDemo ? undefined : "bg-primary hover:bg-primary/90"}
            >
              <Play className="h-4 w-4 mr-2" />
              {t("examControlButtons.buttonStart")}
            </Button>
          ),
        };
      case "joinable":
        return {
          badge: (
            <Badge variant="secondary" className="bg-info-subtle text-info-text">
              {t("examControlButtons.statusJoinable")}
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              variant={isDemo ? "outline" : "default"}
              size={isDemo ? "sm" : "default"}
              className={isDemo ? undefined : "bg-primary hover:bg-primary/90"}
            >
              <Play className="h-4 w-4 mr-2" />
              {t("examControlButtons.buttonStart")}
            </Button>
          ),
        };
      case "running":
        return {
          badge: (
            <Badge variant="secondary" className="bg-success-subtle text-success-text">
              {t("examControlButtons.statusRunning")}
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowEndDialog(true)}
              disabled={isEnding}
              variant="destructive"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("examControlButtons.buttonEnding")}
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  {t("examControlButtons.buttonEnd")}
                </>
              )}
            </Button>
          ),
        };
      case "entry_closed":
        return {
          badge: (
            <Badge variant="secondary" className="bg-warning-subtle text-warning-text">
              {t("examControlButtons.statusEntryClosed")}
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowEndDialog(true)}
              disabled={isEnding}
              variant="destructive"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("examControlButtons.buttonEnding")}
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  {t("examControlButtons.buttonEnd")}
                </>
              )}
            </Button>
          ),
        };
      case "closed":
        return {
          badge: (
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
              {t("examControlButtons.statusClosed")}
            </Badge>
          ),
          button: null,
        };
      default:
        return {
          badge: (
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
              {examStatus || t("examControlButtons.statusUnknown")}
            </Badge>
          ),
          button: null,
        };
    }
  };

  const { badge, button } = getStatusDisplay();

  return (
    <>
      <div className="flex items-center gap-3">
        {badge}
        {button}
      </div>

      {/* 시험 시작 확인 모달 */}
      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("examControlButtons.startDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("examControlButtons.startDialogDescription")}
            </AlertDialogDescription>
            <div className="mt-4 space-y-4">
              {/* 대기 중인 학생 목록 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <strong className="type-field-label">
                    {t("examControlButtons.waitingStudentsLabel", { count: waitingStudents?.length ?? 0 })}
                  </strong>
                </div>
                {loadingWaitingStudents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {t("examControlButtons.loadingStudents")}
                    </span>
                  </div>
                ) : isWaitingError ? (
                  <div className="text-sm text-destructive py-2 px-3 border border-destructive/20 rounded-md bg-destructive/5">
                    {t("examControlButtons.errorLoadingStudents")}
                  </div>
                ) : (waitingStudents?.length ?? 0) > 0 ? (
                  <div className="max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/30">
                    <ul className="space-y-1.5">
                      {waitingStudents.map((student) => (
                        <li
                          key={student.student_id}
                          className="text-sm flex items-center justify-between py-1"
                        >
                          <span className="font-medium">
                            {student.name}
                            {student.student_number && (
                              <span className="text-muted-foreground ml-2">
                                ({student.student_number})
                              </span>
                            )}
                          </span>
                          {student.school && (
                            <span className="type-meta">
                              {student.school}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-2 px-3 border rounded-md bg-muted/30">
                    {t("examControlButtons.noWaitingStudents")}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="close_at" className="type-field-label">
                  {t("examControlButtons.closeAtLabel")}
                </Label>
                <Input
                  id="close_at"
                  type="datetime-local"
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
                  className="mt-1"
                  placeholder={t("examControlButtons.closeAtPlaceholder")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("examControlButtons.closeAtHint")}
                </p>
              </div>
              <div>
                <strong className="text-sm">{t("examControlButtons.warningTitle")}</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>{t("examControlButtons.warningCannotUndo")}</li>
                  <li>{t("examControlButtons.warningAllStudents")}</li>
                  <li>{t("examControlButtons.warningIndividualTimer")}</li>
                </ul>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStarting}>{t("examControlButtons.buttonCancelStart")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartExam}
              disabled={isStarting}
              className="bg-primary hover:bg-primary/90"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("examControlButtons.buttonStarting")}
                </>
              ) : (
                t("examControlButtons.buttonConfirmStart")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 시험 종료 확인 모달 */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("examControlButtons.endDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("examControlButtons.endDialogDescription")}
            </AlertDialogDescription>
            <div className="mt-4">
              <strong className="text-sm text-destructive">{t("examControlButtons.endWarningTitle")}</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                <li><strong className="text-destructive">{t("examControlButtons.endWarningForceSubmit")}</strong></li>
                <li>{t("examControlButtons.endWarningCannotRestart")}</li>
                <li>{t("examControlButtons.endWarningAnswerSaved")}</li>
                <li><strong className="text-destructive">{t("examControlButtons.endWarningCannotUndo")}</strong></li>
              </ul>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEnding}>{t("examControlButtons.buttonCancelEnd")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndExam}
              disabled={isEnding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("examControlButtons.buttonEnding")}
                </>
              ) : (
                t("examControlButtons.buttonConfirmEnd")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
