"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use, useMemo, useCallback } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { ExamDetailsCard } from "@/components/instructor/ExamDetailsCard";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronDown, ChevronUp, RefreshCw, Loader2, Eye, EyeOff, Download, Bot } from "lucide-react";
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
        throw new Error(data.message || "일괄 채점 상태를 불러오지 못했습니다.");
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
        throw new Error(data.message || "성적 공개 상태 변경에 실패했습니다.");
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
      ? "학생들에게 성적이 비공개됩니다. 계속하시겠습니까?"
      : "학생들에게 성적이 공개됩니다. 계속하시겠습니까?";
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
    ? "CASE AI 가채점 진행 중"
    : bulkGradingFailed
      ? "CASE AI 가채점 실패"
      : bulkGradingCommitted
        ? "CASE 채점 결과"
        : bulkGradingDone
          ? "CASE 제안 점수 생성 완료"
          : "CASE AI 가채점하기";
  const bulkCtaDescription = isBulkGrading && bulkGradeProgress && bulkGradeProgress.total > 0
    ? `백그라운드 가채점 중 · ${bulkGradeProcessed}/${bulkGradeProgress.total}명 처리`
    : bulkGradingFailed
      ? "실패 원인을 확인하고 다시 채점을 시작할 수 있습니다"
      : bulkGradingCommitted
        ? "확정된 결과와 가채점 대화 기록을 확인합니다"
        : bulkGradingDone
          ? "제안 점수를 검토한 뒤 확정해주세요"
          : "강사의 자연어 기준으로 CASE 답안을 일괄 가채점합니다";
  const bulkCtaButtonLabel = isBulkGrading
    ? "진행 상황 보기"
    : bulkGradingCommitted
      ? "결과/채팅 보기"
      : bulkGradingDone
        ? "검토/확정"
        : bulkGradingFailed
          ? "다시 보기"
          : "가채점 시작";

  const handleExcelDownload = useCallback(() => {
    if (!exam || !allStudentsManuallyGraded) return;
    window.location.href = `/api/exam/${exam.id}/export/excel`;
  }, [exam, allStudentsManuallyGraded]);

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
          <h2 className="text-xl font-semibold text-red-600 mb-2">오류 발생</h2>
          <p className="text-muted-foreground">
            {error || "시험 데이터를 불러올 수 없습니다."}
          </p>
          <Link href="/instructor" className="inline-block mt-4">
            <Button variant="outline">시험 목록으로 돌아가기</Button>
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
                        className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500"
                        onClick={handleExcelDownload}
                        disabled={!allStudentsManuallyGraded}
                      >
                        <Download className="h-4 w-4 mr-1.5" />
                        Excel 다운로드
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!allStudentsManuallyGraded && (
                    <TooltipContent side="bottom">
                      모든 학생 채점을 완료해주세요
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

          <div className="space-y-3 mt-6 mb-6">
            <div id="exam-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">시험 정보</h3>
                        <span className="text-sm text-muted-foreground">
                          {exam.duration}분 &bull; {exam.code}
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
                        description={exam.description}
                        duration={exam.duration}
                        createdAt={exam.createdAt}
                        examCode={exam.code}
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
                        <h3 className="font-semibold">문제 보기</h3>
                        <span className="text-sm text-muted-foreground">
                          {questionsCount !== null
                            ? `${questionsCount}개 문제`
                            : "문제 로딩 중..."}
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
            <h3 className="font-semibold">학생 목록</h3>

            {exam.status === "running" && (
              <LateEntryPanel examId={exam.id} examStatus={exam.status} />
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                {exam.grades_released ? (
                  <Eye className="h-4 w-4 text-green-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {exam.grades_released ? "성적 공개중" : "성적 비공개"}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {exam.grades_released
                    ? "학생들이 점수와 응시 내용을 볼 수 있습니다"
                    : "학생들은 답안만 확인할 수 있습니다"}
                </span>
              </div>
              <Button
                size="sm"
                variant={exam.grades_released ? "outline" : "default"}
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
                {exam.grades_released ? "성적 비공개" : "성적 공개"}
              </Button>
            </div>

            {showBulkCaseGradingCta && (
              <div className="flex items-center justify-between p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2">
                  {isBulkGrading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      {bulkCtaTitle}
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400 hidden sm:inline ml-2">
                      {bulkCtaDescription}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shrink-0"
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
                  placeholder="학생 이름, 이메일, 학번, 학교로 검색..."
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
                  <SelectValue placeholder="정렬 기준" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">이름순</SelectItem>
                  <SelectItem value="studentNumber">학번순</SelectItem>
                  <SelectItem value="submittedAt">제출 빠른 순</SelectItem>
                  <SelectItem value="overallStatus">채점 상태순</SelectItem>
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
                title="새로고침"
              >
                <RefreshCw className={cn("h-4 w-4", summariesFetching && "animate-spin")} />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              총 {filteredAndSortedStudents.length}명
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
                  학생 목록을 불러오지 못했습니다
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {summariesErrorDetail instanceof Error
                    ? summariesErrorDetail.message
                    : "잠시 후 다시 시도해 주세요."}
                </p>
                <Button variant="outline" onClick={() => void refetchSummaries()}>
                  다시 시도
                </Button>
              </div>
            ) : filteredAndSortedStudents.length === 0 ? (
              <div className="border rounded-lg p-12 text-center text-muted-foreground">
                <p>표시할 학생이 없습니다.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 hidden md:block">
                  <div className="grid grid-cols-[40px_minmax(160px,1fr)_72px_72px_96px_108px_140px_104px_80px] gap-3 items-center text-sm font-medium text-muted-foreground">
                    <span className="text-center">#</span>
                    <span>학생</span>
                    <span className="text-center">객관식</span>
                    <span className="text-center">O/X</span>
                    <span className="text-center">서술</span>
                    <span className="text-center">총점</span>
                    <span>제출일시</span>
                    <span>상태</span>
                    <span className="text-center">액션</span>
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
                        canOpenGrading={exam.status === "closed"}
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
