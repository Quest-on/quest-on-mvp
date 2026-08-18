"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use, useMemo, useCallback } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { resolveCodeGate } from "@/components/instructor/ExamCode";
import { ExamDetailsCard } from "@/components/instructor/ExamDetailsCard";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
import { ExamControlButtons } from "@/components/instructor/ExamControlButtons";
import { LateEntryPanel } from "@/components/instructor/LateEntryPanel";
import { ExamStudentRow } from "@/components/instructor/ExamStudentRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronDown, ChevronUp, RefreshCw, Loader2, Eye, EyeOff, Download, Bot } from "lucide-react";
import toast from "react-hot-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentLiveMonitoring } from "@/components/instructor/StudentLiveMonitoring";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useExamStudentSummaries } from "@/hooks/useExamStudentSummaries";
import {
  useStudentFiltering,
  type StudentFilterSortOption,
} from "@/hooks/useStudentFiltering";
import { qk } from "@/lib/query-keys";
import { shouldShowStudentListSkeleton } from "@/lib/instructor-utils";
import { cn } from "@/lib/utils";
import type { InstructorExam } from "@/lib/types/exam";
import type { ExamStudentSummary } from "@/lib/types/student-summary";
import { BulkGradingPanel } from "@/components/instructor/BulkGradingPanel";
import { useTranslations } from "next-intl";
// 학생 페이지(exam/[code]/page.tsx)가 채팅 노출을 판정할 때 쓰는 것과 **동일한 헬퍼**를
// 쓴다. 식을 복제하면 한쪽만 고쳐졌을 때 공지문과 실제 화면이 어긋난다.
import { hasAiChatQuestions } from "@/lib/grading-helpers";

function isCaseGradingQuestionType(type?: string): boolean {
  return type === "case" || type === "essay" || type === "short-answer";
}

type BulkGradeProgress = {
  total: number;
  completed: number;
  failed: number;
};

type BulkGradeStatusData = {
  session: {
    status: string;
    grading_scope?: string;
    progress?: BulkGradeProgress;
  } | null;
  studentCount: number;
};

export default function ExamDetail({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const t = useTranslations("instructor");

  const [monitoringStudent, setMonitoringStudent] = useState<ExamStudentSummary | null>(null);
  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [bulkGradingOpen, setBulkGradingOpen] = useState(false);

  const {
    exam,
    setExam,
    examDetailData,
    examDetailLoading,
    loading,
    error,
  } = useExamDetail({
    examId: resolvedParams.examId,
    isLoaded,
    isSignedIn,
    userId: user?.id,
  });

  const isDemoExam = exam?.is_demo === true;

  // 발행 한도. 교수자가 **코드를 건네기 전에** 알아야 한다 — 최종 강제는
  // 세션 생성 시 DB 가 하지만, 그때는 이미 코드를 배포한 뒤다.
  // 데모는 한도를 소모하지 않으므로 조회하지 않는다.
  const { data: quotaData } = useQuery<{ publishesRemaining: number | null }>({
    queryKey: qk.instructor.quota(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/quota", { signal });
      if (!response.ok) throw new Error("Failed to fetch quota");
      return response.json() as Promise<{ publishesRemaining: number | null }>;
    },
    enabled: !!user?.id && !isDemoExam,
  });
  const {
    data: demoStatus,
    isLoading: demoStatusLoading,
    isError: demoStatusError,
  } = useQuery<{ completed: boolean; aiRegenerationUnlocked: boolean }>({
    queryKey: qk.instructor.onboardingDemoStatus(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/onboarding/demo/status", { signal });
      if (!response.ok) {
        throw new Error("Failed to fetch demo status");
      }
      return response.json() as Promise<{ completed: boolean; aiRegenerationUnlocked: boolean }>;
    },
    enabled: isDemoExam && isLoaded && !!isSignedIn,
  });

  // 데모 완주는 학생 시점 채점 결과를 열어야 기록된다. 여기까지 닫아 두면
  // 데모를 끝낼 수 없으므로 데모만 종료 상태와 관계없이 채점 결과를 연다.
  const canOpenGrading = exam?.status === "closed" || isDemoExam;

  const hasGradingInProgress = useMemo(
    () => exam?.status === "closed",
    [exam?.status]
  );

  const {
    data: students = [],
    isLoading: summariesLoading,
    isFetching: summariesFetching,
    isError: summariesError,
    error: summariesErrorDetail,
    refetch: refetchSummaries,
  } = useExamStudentSummaries({
    examId: resolvedParams.examId,
    enabled: !!exam && isLoaded && !!isSignedIn,
    refetchInterval: hasGradingInProgress ? 10000 : false,
  });

  const {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    filteredAndSortedStudents,
  } = useStudentFiltering({
    students,
    defaultSort: "name",
  });

  const queryClient = useQueryClient();

  const { data: bulkGradeStatus } = useQuery<BulkGradeStatusData>({
    queryKey: qk.instructor.bulkGradeSession(resolvedParams.examId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/exam/${resolvedParams.examId}/bulk-grade`, { signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t("examDetail.bulkGradeLoadFail"));
      }
      return response.json() as Promise<BulkGradeStatusData>;
    },
    enabled: !!exam && exam.status === "closed" && isLoaded && !!isSignedIn,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.session?.status;
      return status === "grading" ? 3000 : false;
    },
  });

  const releaseGradesMutation = useMutation({
    mutationFn: async (release: boolean) => {
      const url = `/api/exam/${resolvedParams.examId}/release-grades`;
      const response = await fetch(url, {
        method: release ? "POST" : "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "성적 공개 상태 변경에 실패했습니다."); // 별도 ns 처리
      }
      return response.json();
    },
    onSuccess: (_data, release) => {
      setExam((prev) => (prev ? { ...prev, grades_released: release } : prev));
      queryClient.invalidateQueries({
        queryKey: qk.instructor.examDetail(resolvedParams.examId),
      });
    },
  });

  const handleToggleGradesRelease = () => {
    const currentlyReleased = exam?.grades_released === true;
    const msg = currentlyReleased
      ? t("examDetail.gradeConfirmHidden")
      : t("examDetail.gradeConfirmPublic");
    if (window.confirm(msg)) {
      releaseGradesMutation.mutate(!currentlyReleased);
    }
  };

  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, profile?.role]);

  const questionsCount = examDetailData?.questionsCount ?? null;
  const questionsLoading = examDetailLoading;
  const questions = useMemo(
    () => (questionsOpen ? examDetailData?.questionsRaw ?? [] : []),
    [examDetailData?.questionsRaw, questionsOpen],
  );

  const handleLiveMonitoring = (student: ExamStudentSummary) => {
    setMonitoringStudent(student);
  };

  const handleCloseMonitoring = () => {
    setMonitoringStudent(null);
  };

  // 제출한 학생 전원의 채점 확정 여부
  // - manually_graded: 강사 직접 확정 (Case 있는 시험)
  // - ai_graded: 자동 채점 완료 (MCQ/OX 전용 시험 또는 전원 AI 일괄채점 확정)
  const allStudentsManuallyGraded = useMemo(() => {
    const submitted = students.filter((s) => s.status === "submitted");
    if (submitted.length === 0) return false;
    return submitted.every(
      (s) => s.overallStatus === "manually_graded" || s.overallStatus === "ai_graded"
    );
  }, [students]);

  const hasCaseQuestions = useMemo(() => {
    const detailQuestions = Array.isArray(examDetailData?.questionsRaw)
      ? examDetailData.questionsRaw
      : [];
    return (
      detailQuestions.some((q) => isCaseGradingQuestionType(q.type)) ||
      students.some((s) => s.caseProgress.total > 0)
    );
  }, [examDetailData, students]);

  // 학생 화면에 AI 채팅이 실제로 뜨는 시험인가(= 서술형/CASE 문항 존재).
  // 문항 정보를 아직 못 받았으면 false — 확인 못 한 것을 공지문에 사실처럼 적지 않는다.
  const aiChatAvailable = useMemo(
    () => hasAiChatQuestions(examDetailData?.questionsRaw),
    [examDetailData]
  );

  const hasSubmittedCaseStudents = useMemo(() => {
    return students.some(
      (s) => s.status === "submitted" && s.caseProgress.total > 0,
    );
  }, [students]);

  const bulkGradeSessionStatus = bulkGradeStatus?.session?.status ?? null;

  const showBulkCaseGradingCta = useMemo(
    () =>
      exam?.status === "closed" &&
      hasCaseQuestions &&
      (hasSubmittedCaseStudents ||
        (bulkGradeStatus?.studentCount ?? 0) > 0 ||
        !!bulkGradeSessionStatus),
    [
      exam?.status,
      hasCaseQuestions,
      hasSubmittedCaseStudents,
      bulkGradeStatus?.studentCount,
      bulkGradeSessionStatus,
    ],
  );

  const bulkGradeProgress = bulkGradeStatus?.session?.progress;
  const bulkGradeProcessed =
    bulkGradeProgress
      ? Math.min(bulkGradeProgress.total, bulkGradeProgress.completed + bulkGradeProgress.failed)
      : 0;
  const isBulkGrading = bulkGradeSessionStatus === "grading";
  const bulkGradingFailed = bulkGradeSessionStatus === "grading_failed";
  const bulkGradingDone = bulkGradeSessionStatus === "grading_done";
  const bulkGradingCommitted = bulkGradeSessionStatus === "committed";
  const bulkCtaTitle = isBulkGrading
    ? t("examDetail.bulkGradeStatus.inProgress")
    : bulkGradingFailed
      ? t("examDetail.bulkGradeStatus.failed")
      : bulkGradingCommitted
        ? t("examDetail.bulkGradeStatus.committed")
        : bulkGradingDone
          ? t("examDetail.bulkGradeStatus.done")
          : t("examDetail.bulkGradeStatus.idle");
  const bulkCtaDescription = isBulkGrading && bulkGradeProgress && bulkGradeProgress.total > 0
    ? t("examDetail.bulkGradeStatus.descInProgress", { processed: bulkGradeProcessed, total: bulkGradeProgress.total })
    : bulkGradingFailed
      ? t("examDetail.bulkGradeStatus.descFailed")
      : bulkGradingCommitted
        ? t("examDetail.bulkGradeStatus.descCommitted")
        : bulkGradingDone
          ? t("examDetail.bulkGradeStatus.descDone")
          : t("examDetail.bulkGradeStatus.descIdle");
  const bulkCtaButtonLabel = isBulkGrading
    ? t("examDetail.bulkGradeStatus.btnInProgress")
    : bulkGradingCommitted
      ? t("examDetail.bulkGradeStatus.btnCommitted")
      : bulkGradingDone
        ? t("examDetail.bulkGradeStatus.btnDone")
        : bulkGradingFailed
          ? t("examDetail.bulkGradeStatus.btnFailed")
          : t("examDetail.bulkGradeStatus.btnIdle");

  const [isExporting, setIsExporting] = useState<"excel" | "csv" | null>(null);

  const handleDownload = useCallback(
    async (format: "excel" | "csv") => {
      if (!exam || !allStudentsManuallyGraded || isExporting) return;
      setIsExporting(format);
      try {
        const res = await fetch(`/api/exam/${exam.id}/export/${format}`);
        if (!res.ok) {
          let message = t("examDetail.exportFail");
          try {
            const body = await res.json();
            message = body.message || body.error || message;
          } catch {
            // 비-JSON(에러 외) 응답은 기본 메시지 사용
          }
          toast.error(message);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
        link.download = match
          ? decodeURIComponent(match[1])
          : `exam-results.${format === "excel" ? "xlsx" : "csv"}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t("examDetail.exportError"));
      } finally {
        setIsExporting(null);
      }
    },
    [exam, allStudentsManuallyGraded, isExporting]
  );

  // 스켈레톤은 최초 로드에서만. summariesFetching(10초 폴링 재요청)을 넣으면
  // 매 폴링마다 목록이 스켈레톤으로 교체돼 스크롤이 맨 위로 튀고 깜빡인다.
  const studentsLoading = shouldShowStudentListSkeleton({
    examLoading: loading,
    summariesLoading,
  });

  if (!isLoaded || loading) {
    return <PageSpinner />;
  }

  if (!isSignedIn || (profile?.role as string) !== "instructor") {
    return null;
  }

  if (error || !exam) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-destructive mb-2">{t("examDetail.error")}</h2>
          <p className="text-muted-foreground">
            {error || t("examDetail.loadFail")}
          </p>
          <Link href="/instructor" className="inline-block mt-4">
            <Button variant="outline">{t("examDetail.backToList")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <SidebarInset
        className={cn(
          "transition-[padding] duration-300 ease-in-out",
          bulkGradingOpen && "lg:pr-[500px]",
        )}
      >
        <div className="container mx-auto p-4 sm:p-6">
          <ExamDetailHeader
            title={exam.title}
            code={exam.code}
            examId={exam.id}
            isDemo={isDemoExam}
            quota={{
              isDemo: isDemoExam,
              alreadyPublished: !!exam.first_published_at,
              publishesRemaining: quotaData?.publishesRemaining ?? null,
            }}
            demoPreviewLabel={t("examDetail.tryAsStudent")}
            // 완주한 데모는 이미 제출본이 있어 그냥 들어가면 읽기 전용 화면만
            // 뜬다. 연습용이므로 다시 풀 수 있어야 한다 — 라벨이 있으면 CTA 가
            // 재응시를 요청한다.
            demoRestartLabel={
              demoStatus?.completed ? t("examDetail.retryAsStudent") : undefined
            }
            demoRestartHint={
              demoStatus?.completed
                ? t("examDetail.retryAsStudentHint")
                : undefined
            }
            extraActions={
              <>
                {process.env.NODE_ENV === "development" && (
                  <div className="text-xs text-muted-foreground mr-2">
                    Status: {exam.status || "undefined"} |
                    Gate: {!!(exam.open_at || exam.close_at) ? "true" : "false"}
                  </div>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={!allStudentsManuallyGraded ? "cursor-not-allowed" : undefined}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload("excel")}
                        disabled={!allStudentsManuallyGraded || isExporting !== null}
                      >
                        {isExporting === "excel" ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1.5" />
                        )}
                        Excel
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!allStudentsManuallyGraded && (
                    <TooltipContent side="bottom">
                      {t("examDetail.allGradedRequired")}
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={!allStudentsManuallyGraded ? "cursor-not-allowed" : undefined}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload("csv")}
                        disabled={!allStudentsManuallyGraded || isExporting !== null}
                      >
                        {isExporting === "csv" ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1.5" />
                        )}
                        CSV
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!allStudentsManuallyGraded && (
                    <TooltipContent side="bottom">
                      {t("examDetail.allGradedRequired")}
                    </TooltipContent>
                  )}
                </Tooltip>
                <ExamControlButtons
                  examId={exam.id}
                  examStatus={exam.status || "draft"}
                  hasGateFields={!!(exam.open_at || exam.close_at)}
                  onStatusChange={(newStatus, startedAt) => {
                    setExam((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        status: newStatus as InstructorExam["status"],
                        started_at: startedAt || prev.started_at,
                      };
                    });
                    queryClient.invalidateQueries({
                      queryKey: qk.instructor.examDetail(resolvedParams.examId),
                    });
                    queryClient.invalidateQueries({
                      queryKey: qk.instructor.studentSummaries(resolvedParams.examId),
                    });
                  }}
                />
              </>
            }
          />

          {isDemoExam && (
            <Alert className="mb-6 border-primary/30 bg-primary/5">
              <Bot aria-hidden="true" />
              <AlertTitle>
                {demoStatus?.aiRegenerationUnlocked
                  ? t("examDetail.demoAiRegenerationUnlockedTitle")
                  : t("examDetail.demoAiRegenerationLockedTitle")}
              </AlertTitle>
              <AlertDescription>
                {demoStatusLoading
                  ? t("examDetail.demoAiRegenerationLoading")
                  : demoStatusError
                    ? t("examDetail.demoAiRegenerationUnavailable")
                    : demoStatus?.aiRegenerationUnlocked
                      ? t("examDetail.demoAiRegenerationUnlockedDescription")
                      : t("examDetail.demoAiRegenerationLockedDescription")}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3 mt-6 mb-6">
            <div id="exam-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{t("examDetail.examInfo")}</h3>
                        <span className="type-hint">
                          {/* 코드는 헤더의 ExamCode 가 이미 내보낸다. 여기서
                              한 번 더 그리면 게이트를 우회하는 두 번째 표면이
                              된다 — 소요 시간만 남긴다. */}
                          {exam.duration}분
                        </span>
                      </div>
                      {examInfoOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <ExamDetailsCard
                        // 발행 한도에 걸린 미발행 시험은 이 카드에서도 코드를
                        // 반출하면 안 된다. 헤더만 막으면 카드가 우회로가 된다.
                        codeGateBlocked={
                          resolveCodeGate({
                            isDemo: isDemoExam,
                            alreadyPublished: !!exam.first_published_at,
                            publishesRemaining: quotaData?.publishesRemaining ?? null,
                          }) === "blocked"
                        }
                        description={exam.description}
                        duration={exam.duration}
                        createdAt={exam.createdAt}
                        examCode={exam.code}
                        examTitle={exam.title}
                        aiChatAvailable={aiChatAvailable}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            <div id="questions-section">
              <Collapsible open={questionsOpen} onOpenChange={setQuestionsOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{t("examDetail.viewQuestions")}</h3>
                        <span className="type-hint">
                          {questionsCount !== null
                            ? t("examDetail.questionsCountLabel", { count: questionsCount })
                            : t("examDetail.questionsLoading")}
                        </span>
                      </div>
                      {questionsOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      {questionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                      ) : (
                        <QuestionsListCard questions={questions} />
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">{t("examDetail.studentList")}</h3>

            {exam.status === "running" && (
              <LateEntryPanel examId={exam.id} examStatus={exam.status} />
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                {exam.grades_released ? (
                  <Eye className="h-4 w-4 text-success-text" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="type-field-label">
                  {exam.grades_released ? t("examDetail.gradesPublic") : t("examDetail.gradesHidden")}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {exam.grades_released
                    ? t("examDetail.gradesPublicDesc")
                    : t("examDetail.gradesHiddenDesc")}
                </span>
              </div>
              <Button
                size="sm"
                variant={
                  // 공개할 성적이 없으면 다음 행동이 아니다.
                  //
                  // 갓 만든 데모에는 응시자가 0명이다. 그런데도 이 버튼이 강조돼서
                  // 착지 화면에 강조 CTA 가 셋(학생 시점 / 시험 시작 / 성적 공개)이나
                  // 떴다. 온보딩 직후 첫 걸음은 학생 시점 하나다 - 데모를 겪어 보는
                  // 게 목적이고 나머지 둘은 그 뒤 행동이다.
                  exam.grades_released ||
                  showBulkCaseGradingCta ||
                  (bulkGradeStatus?.studentCount ?? 0) === 0
                    ? "outline"
                    : "default"
                  }
                disabled={releaseGradesMutation.isPending}
                onClick={handleToggleGradesRelease}
              >
                {releaseGradesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : exam.grades_released ? (
                  <EyeOff className="h-4 w-4 mr-1.5" />
                ) : (
                  <Eye className="h-4 w-4 mr-1.5" />
                )}
                {exam.grades_released ? t("examDetail.makeHidden") : t("examDetail.makePublic")}
              </Button>
            </div>

            {showBulkCaseGradingCta && (
              <div className="flex items-center justify-between p-3 border border-info-border rounded-lg bg-info-surface">
                <div className="flex items-center gap-2">
                  {isBulkGrading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-info-text shrink-0" aria-hidden="true" />
                  ) : (
                    <Bot className="h-4 w-4 text-info-text shrink-0" aria-hidden="true" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-info-text">
                      {bulkCtaTitle}
                    </span>
                    <span className="text-xs text-info-text hidden sm:inline ml-2">
                      {bulkCtaDescription}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => setBulkGradingOpen(true)}
                >
                  {bulkCtaButtonLabel}
                </Button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={t("examDetail.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={sortOption}
                onValueChange={(v) => setSortOption(v as StudentFilterSortOption)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t("examDetail.sortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t("examDetail.sortByName")}</SelectItem>
                  <SelectItem value="studentNumber">{t("examDetail.sortByStudentNumber")}</SelectItem>
                  <SelectItem value="submittedAt">{t("examDetail.sortBySubmittedAt")}</SelectItem>
                  <SelectItem value="overallStatus">{t("examDetail.sortByStatus")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: qk.instructor.lateStudents(resolvedParams.examId),
                  });
                  queryClient.invalidateQueries({
                    queryKey: qk.instructor.examDetail(resolvedParams.examId),
                  });
                  void refetchSummaries();
                }}
                title={t("examDetail.refresh")}
              >
                <RefreshCw className={cn("h-4 w-4", summariesFetching && "animate-spin")} />
              </Button>
            </div>

            <p className="type-hint">
              {t("examDetail.totalStudents", { count: filteredAndSortedStudents.length })}
            </p>

            {studentsLoading ? (
              <div className="border rounded-lg overflow-hidden p-4 space-y-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : summariesError ? (
              <div className="border border-destructive/30 rounded-lg p-12 text-center">
                <p className="text-destructive font-medium mb-2">
                  {t("examDetail.loadStudentsFail")}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {summariesErrorDetail instanceof Error
                    ? summariesErrorDetail.message
                    : t("examDetail.retryLater")}
                </p>
                <Button variant="outline" onClick={() => void refetchSummaries()}>
                  {t("examDetail.retry")}
                </Button>
              </div>
            ) : filteredAndSortedStudents.length === 0 ? (
              <div className="border rounded-lg p-12 text-center text-muted-foreground">
                <p>{t("examDetail.noStudents")}</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 hidden md:block">
                  <div className="grid grid-cols-[40px_minmax(160px,1fr)_72px_72px_96px_108px_140px_104px_80px] gap-3 items-center text-sm font-medium text-muted-foreground">
                    <span className="text-center">#</span>
                    <span>{t("examDetail.tableColStudent")}</span>
                    <span className="text-center">{t("examDetail.tableColMCQ")}</span>
                    <span className="text-center">{t("examDetail.tableColOX")}</span>
                    <span className="text-center">{t("examDetail.tableColEssay")}</span>
                    <span className="text-center">{t("examDetail.tableColTotal")}</span>
                    <span>{t("examDetail.tableColSubmittedAt")}</span>
                    <span>{t("examDetail.tableColStatus")}</span>
                    <span className="text-center">{t("examDetail.tableColAction")}</span>
                  </div>
                </div>
                <div className="divide-y">
                  {(filteredAndSortedStudents as ExamStudentSummary[]).map(
                    (student, index) => (
                      <ExamStudentRow
                        key={student.sessionId}
                        student={student}
                        rowNumber={index + 1}
                        examId={exam.id}
                        canOpenGrading={canOpenGrading}
                        onLiveMonitoring={handleLiveMonitoring}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>

          {monitoringStudent && (
            <StudentLiveMonitoring
              open={monitoringStudent !== null}
              onOpenChange={(open: boolean) => {
                if (!open) handleCloseMonitoring();
              }}
              sessionId={monitoringStudent.sessionId}
              studentName={monitoringStudent.name}
              studentNumber={monitoringStudent.studentNumber}
              school={monitoringStudent.school}
            />
          )}
        </div>
      </SidebarInset>

      <BulkGradingPanel
        examId={exam.id}
        open={bulkGradingOpen}
        onOpenChange={setBulkGradingOpen}
        onCommitted={() => void refetchSummaries()}
      />
    </SidebarProvider>
  );
}

function PageSpinner() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </div>
  );
}
