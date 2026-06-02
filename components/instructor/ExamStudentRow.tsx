"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Radio } from "@/components/animate-ui/icons/radio";
import { ClipboardCheck } from "@/components/animate-ui/icons/clipboard-check";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import {
  caseStatusLabel,
  dashboardStatus,
  dashboardStatusLabel,
  overallScoreLabel,
  type ExamStudentSummary,
} from "@/lib/types/student-summary";

function formatProgress(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${correct}/${total}`;
}

function dashboardStatusClass(status: ReturnType<typeof dashboardStatus>): string {
  switch (status) {
    case "graded":
      return "bg-blue-100 text-blue-800 text-xs";
    case "proposed-ready":
      return "bg-indigo-100 text-indigo-800 text-xs";
    case "grading":
      return "bg-amber-100 text-amber-800 text-xs";
    case "failed":
      return "bg-red-100 text-red-800 text-xs";
    case "pending":
      return "bg-orange-100 text-orange-800 text-xs";
    case "in-progress":
      return "bg-yellow-100 text-yellow-800 text-xs";
    default:
      return "bg-gray-100 text-gray-800 text-xs";
  }
}

function DashboardStatusBadge({ student }: { student: ExamStudentSummary }) {
  const status = dashboardStatus(student);
  return (
    <Badge className={dashboardStatusClass(status)}>
      {dashboardStatusLabel(status)}
    </Badge>
  );
}

interface ExamStudentRowProps {
  student: ExamStudentSummary;
  examId: string;
  /** 현재 정렬/검색된 목록 기준 1-based 표시 순번 */
  rowNumber: number;
  canOpenGrading?: boolean;
  onLiveMonitoring?: (student: ExamStudentSummary) => void;
}

export function ExamStudentRow({
  student,
  examId,
  rowNumber,
  canOpenGrading = false,
  onLiveMonitoring,
}: ExamStudentRowProps) {
  const subInfo = [student.studentNumber, student.school]
    .filter(Boolean)
    .join(" · ");
  const primaryGradingHref =
    student.caseProgress.total > 0
      ? `/instructor/${examId}/grade/${student.sessionId}?questionType=case`
      : student.mcq.total > 0
        ? `/instructor/${examId}/grade/${student.sessionId}?questionType=multiple-choice`
        : student.ox.total > 0
          ? `/instructor/${examId}/grade/${student.sessionId}?questionType=true-false`
          : `/instructor/${examId}/grade/${student.sessionId}`;

  return (
    <div
      className="grid grid-cols-[40px_minmax(160px,1fr)_72px_72px_96px_108px_140px_104px_80px] gap-3 items-center px-4 py-3 hover:bg-muted/50 transition-colors"
      data-testid={`exam-student-row-${student.sessionId}`}
    >
      <div className="text-sm tabular-nums text-muted-foreground text-center">
        {rowNumber}
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 border shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
            {student.name.slice(-2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{student.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {subInfo || student.email || ""}
          </div>
        </div>
      </div>

      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.mcq.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=multiple-choice`}
            className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {formatProgress(student.mcq.correct, student.mcq.total)}
          </Link>
        ) : (
          formatProgress(student.mcq.correct, student.mcq.total)
        )}
      </div>
      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.ox.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=true-false`}
            className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {formatProgress(student.ox.correct, student.ox.total)}
          </Link>
        ) : (
          formatProgress(student.ox.correct, student.ox.total)
        )}
      </div>
      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.caseProgress.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=case`}
            className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {caseStatusLabel(student.status, student.caseProgress)}
          </Link>
        ) : (
          caseStatusLabel(student.status, student.caseProgress)
        )}
      </div>

      <div
        className="text-sm tabular-nums text-center font-medium"
        data-testid={`exam-student-total-${student.sessionId}`}
      >
        {overallScoreLabel(student)}
      </div>

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

      <div data-testid={`exam-student-status-${student.sessionId}`}>
        <DashboardStatusBadge student={student} />
      </div>

      <div className="text-center">
        {student.status === "in-progress" && onLiveMonitoring && (
          <AnimateIcon animateOnHover loop asChild>
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50 h-7 px-2 text-xs"
              onClick={() => onLiveMonitoring(student)}
            >
              <Radio size={14} className="mr-1" />
              실시간
            </Button>
          </AnimateIcon>
        )}
        {canOpenGrading && student.status === "submitted" && (
          <AnimateIcon animateOnHover loop loopDelay={700} asChild>
            <Link href={primaryGradingHref}>
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 border-blue-600 hover:bg-blue-50 h-7 px-2 text-xs"
              >
                <ClipboardCheck size={14} className="mr-1" />
                {student.overallStatus === "manually_graded" ? "재채점" : "채점"}
              </Button>
            </Link>
          </AnimateIcon>
        )}
      </div>
    </div>
  );
}
