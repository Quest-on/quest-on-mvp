"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useStudentFiltering } from "@/hooks/useStudentFiltering";
import { qk } from "@/lib/query-keys";
import type { InstructorStudent } from "@/lib/types/exam";
import type { StudentFilterSortOption } from "@/hooks/useStudentFiltering";

function getStatusBadge(status: string, submittedAt?: string, isGraded?: boolean) {
  if (isGraded) {
    return <Badge className="bg-blue-100 text-blue-800 text-xs">채점완료</Badge>;
  }
  if (status === "completed" && submittedAt) {
    return <Badge className="bg-green-100 text-green-800 text-xs">제출완료</Badge>;
  }
  if (status === "in-progress") {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 text-xs">
        <span className="relative flex h-2 w-2 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-600"></span>
        </span>
        진행중
      </Badge>
    );
  }
  return <Badge className="bg-gray-100 text-gray-800 text-xs">미제출</Badge>;
}

export default function AssignmentDashboard({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user, profile } = useAppUser();

  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

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
          <h2 className="text-xl font-semibold text-red-600 mb-2">오류 발생</h2>
          <p className="text-muted-foreground">
            {error || "과제 데이터를 불러올 수 없습니다."}
          </p>
          <Link href="/instructor" className="inline-block mt-4">
            <Button variant="outline">목록으로 돌아가기</Button>
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
          마감됨
        </Badge>
      );
    }
    if (start && now >= start) {
      return (
        <Badge variant="outline" className="border-green-500 text-green-700">
          진행중
        </Badge>
      );
    }
    if (start && now < start) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          예정
        </Badge>
      );
    }
    return null;
  })();

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <SidebarInset>
        <div className="container mx-auto p-4 sm:p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold">{exam.title}</h1>
                <p className="text-muted-foreground">
                  과제 코드: <span className="exam-code">{exam.code}</span>
                </p>
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
                          편집
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      참여한 학생이 있어 편집할 수 없습니다
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Link href={`/instructor/assignment/${resolvedParams.assignmentId}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="h-4 w-4 mr-1" />
                      편집
                    </Button>
                  </Link>
                )}
                <Link href="/instructor">
                  <Button variant="outline" size="sm">
                    <span className="sm:hidden">대시보드</span>
                    <span className="hidden sm:inline">대시보드로 돌아가기</span>
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
                        <h3 className="font-semibold">과제 정보</h3>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(exam.code);
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          }}
                          className={`text-sm cursor-pointer border-b border-dashed transition-colors ${codeCopied ? "text-green-600 border-green-500" : "text-muted-foreground border-muted-foreground/50 hover:text-foreground hover:border-foreground"}`}
                          title="클릭하여 복사"
                        >
                          {codeCopied ? "복사됨!" : exam.code}
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
                            <span className="text-muted-foreground">과제 설명: </span>
                            <span className="whitespace-pre-wrap">{exam.assignment_prompt}</span>
                          </div>
                        </div>
                      )}
                      {exam.description && !exam.assignment_prompt && (
                        <div className="flex items-start gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span className="text-muted-foreground">설명: </span>
                            <span>{exam.description}</span>
                          </div>
                        </div>
                      )}
                      {exam.createdAt && (
                        <div className="text-sm text-muted-foreground">
                          생성일:{" "}
                          {new Date(exam.createdAt).toLocaleDateString("ko-KR")}
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
            {/* Search & Sort */}
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
                  <SelectItem value="submittedAt">제출 빠른 순</SelectItem>
                  <SelectItem value="answerLength">답안 길이 순</SelectItem>
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
                title="새로고침"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="bg-muted/50 border-b px-4 py-3">
                <div className="grid grid-cols-[1fr_140px_100px_80px] gap-4 items-center text-sm font-medium text-muted-foreground">
                  <span>학생</span>
                  <span>제출일시</span>
                  <span>상태</span>
                  <span className="text-center">액션</span>
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
                  <p>제출한 학생이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y max-h-[calc(100vh-400px)] min-h-[400px] overflow-y-auto">
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
              총 {allStudents.length}명
              {gradedStudents.length > 0 &&
                ` (채점완료: ${gradedStudents.length}명)`}
            </div>
          </div>
        </div>
      </SidebarInset>
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
  return (
    <div className="grid grid-cols-[1fr_140px_100px_80px] gap-4 items-center px-4 py-3 hover:bg-muted/50 transition-colors">
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
          ? new Date(student.submittedAt).toLocaleString("ko-KR", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-"}
      </div>

      {/* Status */}
      <div>
        {getStatusBadge(student.status, student.submittedAt, student.isGraded)}
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
              {student.isGraded ? "재채점" : "채점"}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
