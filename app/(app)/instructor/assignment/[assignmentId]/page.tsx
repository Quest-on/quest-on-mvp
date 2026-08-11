"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExamCode } from "@/components/instructor/ExamCode";
import Link from "next/link";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FileText,
  Pencil,
  Bot,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BulkGradingPanel } from "@/components/instructor/BulkGradingPanel";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useStudentFiltering } from "@/hooks/useStudentFiltering";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/lib/grading-utils";
import type { InstructorStudent } from "@/lib/types/exam";
import type { StudentFilterSortOption } from "@/hooks/useStudentFiltering";
import { useTranslations, useLocale } from "next-intl";
import { formatDate, formatDateTime } from "@/lib/i18n/format";

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

function getStatusBadge(
  status: string,
  t: (key: string) => string,
  submittedAt?: string,
  isGraded?: boolean,
  autoSubmitted?: boolean
) {
  if (isGraded) {
    return <Badge className="bg-blue-100 text-blue-800 text-xs">{t("assignmentDetail.statusGraded")}</Badge>;
  }
  if (status === "completed" && submittedAt && autoSubmitted) {
    return (
      <Badge className="bg-amber-100 text-amber-800 text-xs">{t("assignmentDetail.statusAutoSubmitted")}</Badge>
    );
  }
  if (status === "completed" && submittedAt) {
    return <Badge className="bg-green-100 text-green-800 text-xs">{t("assignmentDetail.statusSubmitted")}</Badge>;
  }
  if (status === "in-progress") {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 text-xs">
        <span className="relative flex h-2 w-2 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-600"></span>
        </span>
        {t("assignmentDetail.statusInProgress")}
      </Badge>
    );
  }
  return <Badge className="bg-gray-100 text-gray-800 text-xs">{t("assignmentDetail.statusNotSubmitted")}</Badge>;
}

export default function AssignmentDashboard({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const t = useTranslations("instructor");
  const locale = useLocale() as "ko" | "en";

  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [bulkGradingOpen, setBulkGradingOpen] = useState(false);

  const {
    exam,
    examDetailData,
    examDetailLoading,
    loading,
    error,
  } = useExamDetail({
    examId: resolvedParams.assignmentId,
    isLoaded,
    isSignedIn,
    userId: user?.id,
  });

  const {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    gradedStudents,
    nonGradedStudents,
  } = useStudentFiltering({
    students: exam?.students ?? [],
    defaultSort: "submittedAt",
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: qk.instructor.examAnalytics(resolvedParams.assignmentId),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/analytics/exam/${resolvedParams.assignmentId}/overview`,
        { signal }
      );
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
    enabled: !!exam && exam.students.length > 0,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  const isPastDeadline = !!exam?.deadline && new Date() > new Date(exam.deadline);

  const { data: bulkGradeStatus } = useQuery<BulkGradeStatusData>({
    queryKey: qk.instructor.bulkGradeSession(resolvedParams.assignmentId),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/exam/${resolvedParams.assignmentId}/bulk-grade`,
        { signal }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t("assignmentDetail.bulkGradeLoadFail"));
      }
      return response.json() as Promise<BulkGradeStatusData>;
    },
    enabled: !!exam && isPastDeadline && isLoaded && !!isSignedIn,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.session?.status;
      return status === "grading" ? 3000 : false;
    },
  });

  const bulkGradeSessionStatus = bulkGradeStatus?.session?.status ?? null;

  // Only submitted students are gradable. `exam.students` also includes
  // in-progress sessions, so gate on submitted count (status === "completed")
  // plus the authoritative submitted count from the bulk-grade status endpoint.
  const submittedStudentCount =
    exam?.students.filter((s) => s.status === "completed").length ?? 0;

  const showBulkGradingCta =
    isPastDeadline &&
    (submittedStudentCount > 0 ||
      (bulkGradeStatus?.studentCount ?? 0) > 0 ||
      !!bulkGradeSessionStatus);

  const bulkGradeProgress = bulkGradeStatus?.session?.progress;
  const bulkGradeProcessed = bulkGradeProgress
    ? Math.min(
        bulkGradeProgress.total,
        bulkGradeProgress.completed + bulkGradeProgress.failed
      )
    : 0;
  const isBulkGrading = bulkGradeSessionStatus === "grading";
  const bulkGradingFailed = bulkGradeSessionStatus === "grading_failed";
  const bulkGradingDone = bulkGradeSessionStatus === "grading_done";
  const bulkGradingCommitted = bulkGradeSessionStatus === "committed";
  const bulkCtaTitle = isBulkGrading
    ? t("assignmentDetail.bulkGradeStatus.inProgress")
    : bulkGradingFailed
      ? t("assignmentDetail.bulkGradeStatus.failed")
      : bulkGradingCommitted
        ? t("assignmentDetail.bulkGradeStatus.committed")
        : bulkGradingDone
          ? t("assignmentDetail.bulkGradeStatus.done")
          : t("assignmentDetail.bulkGradeStatus.idle");
  const bulkCtaDescription =
    isBulkGrading && bulkGradeProgress && bulkGradeProgress.total > 0
      ? t("assignmentDetail.bulkGradeStatus.descInProgress", { processed: bulkGradeProcessed, total: bulkGradeProgress.total })
      : bulkGradingFailed
        ? t("assignmentDetail.bulkGradeStatus.descFailed")
        : bulkGradingCommitted
          ? t("assignmentDetail.bulkGradeStatus.descCommitted")
          : bulkGradingDone
            ? t("assignmentDetail.bulkGradeStatus.descDone")
            : t("assignmentDetail.bulkGradeStatus.descIdle");
  const bulkCtaButtonLabel = isBulkGrading
    ? t("assignmentDetail.bulkGradeStatus.btnInProgress")
    : bulkGradingCommitted
      ? t("assignmentDetail.bulkGradeStatus.btnCommitted")
      : bulkGradingDone
        ? t("assignmentDetail.bulkGradeStatus.btnDone")
        : bulkGradingFailed
          ? t("assignmentDetail.bulkGradeStatus.btnFailed")
          : t("assignmentDetail.bulkGradeStatus.btnIdle");

  useEffect(() => {
    if (sortOption === "score") {
      setSortOption("submittedAt");
    }
  }, [sortOption, setSortOption]);

  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  const questionsCount = examDetailData?.questionsCount ?? null;
  const questionsLoading = examDetailLoading;
  const questions = (questionsOpen ? examDetailData?.questionsRaw : null) ?? [];

  // --- Early returns ---

  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isSignedIn || (profile?.role as string) !== "instructor") {
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">{t("assignmentDetail.error")}</h2>
          <p className="text-muted-foreground">
            {error || t("assignmentDetail.loadFail")}
          </p>
          <Link href="/instructor" className="inline-block mt-4">
            <Button variant="outline">{t("assignmentDetail.backToList")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const allStudents = [...gradedStudents, ...nonGradedStudents];

  const assignmentStatusBadge = (() => {
    // Determine assignment status from dates
    const now = new Date();
    const start = exam.open_at ? new Date(exam.open_at) : null;
    const deadline = exam.deadline ? new Date(exam.deadline) : null;

    if (deadline && now > deadline) {
      return (
        <Badge variant="outline" className="border-gray-500 text-gray-700">
          {t("assignmentDetail.statusClosed")}
        </Badge>
      );
    }
    if (start && now >= start) {
      return (
        <Badge variant="outline" className="border-green-500 text-green-700">
          {t("assignmentDetail.statusActive")}
        </Badge>
      );
    }
    if (start && now < start) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          {t("assignmentDetail.statusScheduled")}
        </Badge>
      );
    }
    return null;
  })();

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <SidebarInset
        className={cn(
          "transition-[padding] duration-300 ease-in-out",
          bulkGradingOpen && "lg:pr-[500px]",
        )}
      >
        <div className="container mx-auto p-4 sm:p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold">{exam.title}</h1>
                <ExamCode code={exam.code} className="mt-1" />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {assignmentStatusBadge}
                {/* 편집 게이트: exam.students(in_progress/submitted/auto_submitted)는 best-effort UX 신호.
                    실제 권위 잠금은 편집 페이지 self-guard + 서버 update_assignment의 has_sessions(모든 세션) 검사다.
                    이 버튼을 has_sessions 기준으로 "통일"하지 말 것 — students⊂has_sessions라 의미가 어긋남. */}
                {exam.students.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button variant="outline" size="sm" disabled>
                          <Pencil className="h-4 w-4 mr-1" />
                          {t("assignmentDetail.edit")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("assignmentDetail.editDisabledTip")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Link href={`/instructor/assignment/${resolvedParams.assignmentId}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="h-4 w-4 mr-1" />
                      {t("assignmentDetail.edit")}
                    </Button>
                  </Link>
                )}
                <Link href="/instructor">
                  <Button variant="outline" size="sm">
                    <span className="sm:hidden">{t("assignmentDetail.backToDashboardShort")}</span>
                    <span className="hidden sm:inline">{t("assignmentDetail.backToDashboard")}</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Collapsible sections */}
          <div className="space-y-3 mb-6">
            <div id="assignment-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{t("assignmentDetail.assignmentInfo")}</h3>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            // 과제 코드도 같은 게이트를 탄다. 코드 렌더는 ExamCode 가 맡는다.
                            navigator.clipboard.writeText(exam.code ?? "");
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          }}
                          className={`text-sm cursor-pointer border-b border-dashed transition-colors ${codeCopied ? "text-green-600 border-green-500" : "text-muted-foreground border-muted-foreground/50 hover:text-foreground hover:border-foreground"}`}
                          title={t("assignmentDetail.copyCode")}
                        >
                          {codeCopied ? t("assignmentDetail.codeCopied") : exam.code}
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
                    <div className="px-4 pb-4 space-y-3">
                      {exam.assignment_prompt && (
                        <div className="flex items-start gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span className="text-muted-foreground">{t("assignmentDetail.assignmentDesc")} </span>
                            <span className="whitespace-pre-wrap">{exam.assignment_prompt}</span>
                          </div>
                        </div>
                      )}
                      {exam.description && !exam.assignment_prompt && (
                        <div className="flex items-start gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span className="text-muted-foreground">{t("assignmentDetail.description")} </span>
                            <span>{exam.description}</span>
                          </div>
                        </div>
                      )}
                      {exam.createdAt && (
                        <div className="text-sm text-muted-foreground">
                          {t("assignmentDetail.createdAt")}{" "}
                          {formatDate(exam.createdAt, locale)}
                        </div>
                      )}
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
                        <h3 className="font-semibold">{t("assignmentDetail.viewQuestions")}</h3>
                        <span className="text-sm text-muted-foreground">
                          {questionsCount !== null
                            ? t("assignmentDetail.questionsCountLabel", { count: questionsCount })
                            : t("assignmentDetail.questionsLoading")}
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
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
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

          {/* Student Submissions Table */}
          <div className="space-y-4">
            {showBulkGradingCta && (
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

            {/* Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={t("assignmentDetail.searchPlaceholder")}
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
                  <SelectValue placeholder={t("assignmentDetail.sortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submittedAt">{t("assignmentDetail.sortBySubmittedAt")}</SelectItem>
                  <SelectItem value="answerLength">{t("assignmentDetail.sortByAnswerLength")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: qk.instructor.examDetail(resolvedParams.assignmentId),
                  });
                }}
                title={t("assignmentDetail.refresh")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="bg-muted/50 border-b px-4 py-3">
                <div className="grid grid-cols-[1fr_130px_70px_90px_70px] gap-4 items-center text-sm font-medium text-muted-foreground">
                  <span>{t("assignmentDetail.tableColStudent")}</span>
                  <span>{t("assignmentDetail.tableColSubmittedAt")}</span>
                  <span>{t("assignmentDetail.tableColScore")}</span>
                  <span>{t("assignmentDetail.tableColStatus")}</span>
                  <span className="text-center">{t("assignmentDetail.tableColAction")}</span>
                </div>
              </div>

              {/* Table Body */}
              {loading || analyticsLoading ? (
                <div className="p-4 space-y-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              ) : allStudents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>{t("assignmentDetail.noStudents")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allStudents.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      assignmentId={exam.id}
                      analyticsData={analyticsData}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {t("assignmentDetail.totalStudents", { count: allStudents.length })}
              {gradedStudents.length > 0 &&
                ` ${t("assignmentDetail.gradedCount", { count: gradedStudents.length })}`}
            </div>
          </div>
        </div>
      </SidebarInset>

      <BulkGradingPanel
        examId={exam.id}
        mode="assignment"
        open={bulkGradingOpen}
        onOpenChange={setBulkGradingOpen}
        onCommitted={() =>
          queryClient.invalidateQueries({
            queryKey: qk.instructor.examDetail(resolvedParams.assignmentId),
          })
        }
      />
    </SidebarProvider>
  );
}

function StudentRow({
  student,
  assignmentId,
  analyticsData,
}: {
  student: InstructorStudent;
  assignmentId: string;
  analyticsData?: Record<string, unknown> | null;
}) {
  const t = useTranslations("instructor");
  const locale = useLocale() as "ko" | "en";
  return (
    <div className="grid grid-cols-[1fr_130px_70px_90px_70px] gap-4 items-center px-4 py-3 hover:bg-muted/50 transition-colors">
      {/* Student info */}
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 border flex-shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
            {student.name.slice(-2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{student.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {student.student_number && <span>{student.student_number}</span>}
            {student.student_number && student.school && <span> &bull; </span>}
            {student.school && <span>{student.school}</span>}
            {!student.student_number && !student.school && (
              <span>{student.email}</span>
            )}
          </div>
        </div>
      </div>

      {/* Submitted at */}
      <div className="text-xs text-muted-foreground">
        {student.submittedAt
          ? formatDateTime(student.submittedAt, locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-"}
      </div>

      {/* Score — 확정(commit)된 과제 점수만 표시 */}
      <div className="text-sm font-semibold">
        {student.isGraded && student.score != null ? (
          <span className={getScoreColor(student.score)}>{student.score}{t("assignmentDetail.scoreUnit")}</span>
        ) : (
          <span className="text-muted-foreground font-normal">-</span>
        )}
      </div>

      {/* Status */}
      <div>
        {getStatusBadge(student.status, t, student.submittedAt, student.isGraded, student.autoSubmitted)}
      </div>

      {/* Action */}
      <div className="text-center">
        {student.status === "completed" && (
          <Link
            href={`/instructor/assignment/${assignmentId}/grade/${student.id}${
              analyticsData
                ? `?avgScore=${
                    (analyticsData as Record<string, unknown>).averageScore || 0
                  }&avgQuestions=${
                    (analyticsData as Record<string, unknown>).averageQuestions ||
                    0
                  }&avgAnswerLength=${
                    (analyticsData as Record<string, unknown>)
                      .averageAnswerLength || 0
                  }&avgExamDuration=${
                    (analyticsData as Record<string, unknown>)
                      .averageExamDuration || 0
                  }`
                : ""
            }`}
          >
            <Button
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-600 hover:bg-blue-50 h-7 px-2 text-xs"
            >
              {student.isGraded ? t("assignmentDetail.regrade") : t("assignmentDetail.grade")}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
