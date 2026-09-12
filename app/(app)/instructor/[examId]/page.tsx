"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use, useMemo, useCallback } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { type InstructorQuotaResponse } from "@/components/instructor/ExamCode";
import { StudentHandoffCard } from "@/components/instructor/StudentHandoffCard";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
import { ExamControlButtons } from "@/components/instructor/ExamControlButtons";
import { LateEntryPanel } from "@/components/instructor/LateEntryPanel";
import { ExamStudentRow } from "@/components/instructor/ExamStudentRow";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
import { StudentLiveMonitoring } from "@/components/instructor/StudentLiveMonitoring";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useExamStudentSummaries } from "@/hooks/useExamStudentSummaries";
import {
  useStudentFiltering,
  type StudentFilterSortOption,
} from "@/hooks/useStudentFiltering";
import { qk } from "@/lib/query-keys";
import { resolveExamDetailPhase } from "@/lib/exam-detail-phase";
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
  // 문항 개폐 기본값은 단계가 정한다(아래 questionsOpen). null 이면 아직
  // 교수자가 손대지 않았다는 뜻 — 손대면 그 선택이 단계보다 우선한다.
  const [questionsOverride, setQuestionsOverride] = useState<boolean | null>(null);
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
  const { data: quotaData } = useQuery<InstructorQuotaResponse>({
    queryKey: qk.instructor.quota(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/quota", { signal });
      if (!response.ok) throw new Error("Failed to fetch quota");
      return response.json() as Promise<InstructorQuotaResponse>;
    },
    enabled: !!user?.id && !isDemoExam,
  });
  const {
    data: demoStatus,
  } = useQuery<{ completed: boolean }>({
    queryKey: qk.instructor.onboardingDemoStatus(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/onboarding/demo/status", { signal });
      if (!response.ok) {
        throw new Error("Failed to fetch demo status");
      }
      return response.json() as Promise<{ completed: boolean }>;
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
  // 개폐 상태에 걸지 않는다. 문항은 examDetailData 에 이미 들어 있는데
  // 여는 순간에야 넘기면 펼칠 때마다 스피너부터 뜬다 — 클릭하고 기다렸다
  // 읽는다. 스스로 만든 대기였다.
  const questions = useMemo(
    () => examDetailData?.questionsRaw ?? [],
    [examDetailData?.questionsRaw],
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

  /**
   * 이 화면이 지금 어느 단계인가 — 배포(setup) / 감독(live) / 검수(review).
   *
   * 한 벌짜리 레이아웃이 세 가지 일을 다 맡고 있었다. 판정은 순수 함수에 있고
   * (`lib/exam-detail-phase.ts`) 여기서는 결과만 쓴다. 화면 안에서 다시 계산하면
   * "학생이 있는데 목록 도구가 사라지는" 회귀를 테스트가 못 막는다.
   */
  const phase = resolveExamDetailPhase({
    status: exam?.status,
    studentCount: students.length,
    // 오류로 못 받은 것과 "0명"은 다르다. 모르면 숨기지 않는다.
    studentsLoaded: !summariesLoading && !summariesError,
  });

  // 배포 단계에서는 문항 본문이 이 화면의 주인공이다. 갓 만든 시험에서 교수자가
  // 제일 먼저 확인할 것을 접어 두고 클릭을 요구할 이유가 없다(NN/g: 대부분의
  // 패널을 열 것 같으면 아코디언을 쓰지 않는다). 감독·검수 단계에서는 보조 정보라
  // 접어 둔다. 교수자가 직접 연/닫은 뒤에는 그 선택이 단계보다 우선한다.
  const questionsOpen = questionsOverride ?? phase === "setup";

  // 공개할 성적이 없는 화면에 성적 공개 줄을 띄우지 않는다.
  const showGradesReleaseRow = phase !== "setup";

  /**
   * 코드 반출 한도 상태.
   *
   * 표면마다 따로 조립하면 한쪽만 고쳐졌을 때 게이트가 새므로 여기 한 번만
   * 만들어 `StudentHandoffCard` 에 넘긴다. 카드 안에서 `resolveCodeGate` 로
   * 판정하고, 차단이면 코드도 공지문도 만들지 않는다.
   */
  const codeQuota = {
    isDemo: isDemoExam,
    alreadyPublished: !!exam?.first_published_at,
    publishesRemaining: quotaData?.publishesRemaining ?? null,
    // 이 시험이 실제로 몇 명을 받았는지 알고 있으므로 잔여를 계산해 넘긴다.
    // 상한을 모르면 null 이고, 그러면 안 막는다.
    studentsRemaining:
      quotaData?.studentsRemaining === null ||
      quotaData?.studentsRemaining === undefined
        ? null
        : Math.max(
            0,
            quotaData.studentsRemaining - (bulkGradeStatus?.studentCount ?? 0)
          ),
  };

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
            status={exam.status || "draft"}
            durationMinutes={exam.duration}
            questionsCount={questionsCount}
            description={exam.description}
            isDemo={isDemoExam}
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
            primaryActions={
              <ExamControlButtons
                examId={exam.id}
                examStatus={exam.status || "draft"}
                hasGateFields={!!(exam.open_at || exam.close_at)}
                isDemo={isDemoExam}
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
            }
            menuActions={
              // 내보내기는 채점이 끝난 시험에서만 할 일이다. 예전에는 학생이
              // 0명인 화면에도 Excel/CSV 가 비활성 상태로 헤더에 떠 있어서,
              // 방금 시험을 만든 사람에게 "여기서 뭔가 해야 하나"만 남겼다.
              phase === "review" ? (
                <>
                  <DropdownMenuItem
                    disabled={!allStudentsManuallyGraded || isExporting !== null}
                    onSelect={() => void handleDownload("excel")}
                  >
                    {isExporting === "excel" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {t("examDetail.exportExcel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!allStudentsManuallyGraded || isExporting !== null}
                    onSelect={() => void handleDownload("csv")}
                  >
                    {isExporting === "csv" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {t("examDetail.exportCsv")}
                  </DropdownMenuItem>
                  {/* 비활성만 해 두면 왜 못 누르는지 알 수 없다. 이유를 같은
                      자리에 적는다 — 예전에는 툴팁이라 hover 해야 보였다. */}
                  {!allStudentsManuallyGraded && (
                    <DropdownMenuLabel className="type-meta font-normal">
                      {t("examDetail.allGradedRequired")}
                    </DropdownMenuLabel>
                  )}
                </>
              ) : null
            }
          />

          {/*
            학생에게 건네는 자리. 종료된 시험에서는 띄우지 않는다 — 그 코드로는
            아무도 들어올 수 없으므로 "알리기"가 거짓말이 된다.
            시험이 돌고 있으면 지각 입장자 때문에 코드는 여전히 필요하지만
            화면의 주인공은 학생 목록이어야 하므로 한 줄로 접는다.
          */}
          {phase !== "review" && (
            <StudentHandoffCard
              examCode={exam.code}
              examTitle={exam.title}
              aiChatAvailable={aiChatAvailable}
              quota={codeQuota}
              variant={phase === "setup" ? "full" : "compact"}
              className="mb-6"
            />
          )}

          <div id="questions-section" className="mb-6">
            <Collapsible
              open={questionsOpen}
              onOpenChange={(open) => setQuestionsOverride(open)}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    {/* 문항 수를 여기서 되풀이하지 않는다. 바로 위 제목 아래
                        메타 줄이 이미 말했고, 같은 사실을 "문제 1개" 와
                        "1개 문제" 로 다르게 두 번 적고 있었다. */}
                    <h2 className="font-semibold">{t("examDetail.questionsSection")}</h2>
                    {questionsOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    {questionsLoading && questions.length === 0 ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </div>
                    ) : (
                      <QuestionsListCard questions={questions} />
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold">{t("examDetail.studentList")}</h2>

            {exam.status === "running" && (
              <LateEntryPanel examId={exam.id} examStatus={exam.status} />
            )}

            {/* 응시자가 0명인 화면에 성적 공개 버튼을 띄우지 않는다. 공개할
                성적이 없으면 그건 다음 행동이 아니다. */}
            {showGradesReleaseRow && (
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
            )}

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

            {/* 0행 위에 검색창·정렬·새로고침을 띄워 두지 않는다. 다룰 것이
                없는 도구는 화면을 채우기만 하고 아무 질문에도 답하지 않는다. */}
            {phase !== "setup" && (
              <>
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
              </>
            )}

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
              <div className="border rounded-lg p-12 text-center">
                {/*
                  빈 화면도 기능의 일부다. "표시할 학생이 없습니다"는 상태만
                  말하고 다음 행동을 말하지 않는다 — 방금 시험을 만든 사람은
                  그게 정상인지 고장인지 구분할 수 없다.
                */}
                <p className="font-medium">
                  {phase === "setup"
                    ? t("examDetail.noStudentsYetTitle")
                    : t("examDetail.noStudents")}
                </p>
                {phase === "setup" && (
                  <p className="type-hint mt-1">{t("examDetail.noStudentsYetHint")}</p>
                )}
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
