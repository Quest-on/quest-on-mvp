"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { useTranslations } from "next-intl";

interface ExamStudentCardProps {
  student: ExamStudentSummary;
  examId: string;
  onLiveMonitoring?: (student: ExamStudentSummary) => void;
}

function formatProgress(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${correct}/${total}`;
}

function dashboardStatusClass(status: ReturnType<typeof dashboardStatus>): string {
  switch (status) {
    case "graded":
      return "bg-blue-100 text-blue-800";
    case "proposed-ready":
      return "bg-indigo-100 text-indigo-800";
    case "grading":
      return "bg-amber-100 text-amber-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "pending":
      return "bg-orange-100 text-orange-800";
    case "in-progress":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function ExamStudentCard({
  student,
  examId,
  onLiveMonitoring,
}: ExamStudentCardProps) {
  const t = useTranslations("authoring");
  const subInfo = [student.studentNumber, student.school].filter(Boolean).join(" · ");
  const status = dashboardStatus(student);

  return (
    <Card
      className="h-full hover:border-primary/30 transition-colors"
      data-testid={`exam-student-card-${student.sessionId}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 border shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
              {student.name.slice(-2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm truncate">{student.name}</h3>
              <Badge
                variant="secondary"
                className={`text-[11px] font-normal px-1.5 py-0 ${dashboardStatusClass(status)}`}
              >
                {status === "in-progress" && (
                  <span className="relative flex h-1.5 w-1.5 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-600" />
                  </span>
                )}
                {dashboardStatusLabel(status)}
              </Badge>
            </div>
            {subInfo ? (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subInfo}</p>
            ) : student.email ? (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{student.email}</p>
            ) : null}
            {student.submittedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("examStudentCard.labelSubmitted")}{" "}
                {new Date(student.submittedAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{t("examStudentCard.labelMcq")}</dt>
            <dd className="font-medium tabular-nums">
              {formatProgress(student.mcq.correct, student.mcq.total)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("examStudentCard.labelOx")}</dt>
            <dd className="font-medium tabular-nums">
              {formatProgress(student.ox.correct, student.ox.total)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("examStudentCard.labelEssay")}</dt>
            <dd className="font-medium tabular-nums">
              {caseStatusLabel(student.status, student.caseProgress)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("examStudentCard.labelTotal")}</dt>
            <dd className="font-medium tabular-nums">
              {overallScoreLabel(student)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 pt-1">
          {student.status === "in-progress" && onLiveMonitoring && (
            <AnimateIcon animateOnHover loop asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 h-8 px-2.5 text-xs"
                onClick={() => onLiveMonitoring(student)}
              >
                <Radio size={14} className="mr-1" />
                {t("examStudentCard.buttonLiveView")}
              </Button>
            </AnimateIcon>
          )}
          {student.status === "submitted" && (
            <AnimateIcon animateOnHover loop loopDelay={700} asChild>
              <Link href={`/instructor/${examId}/grade/${student.sessionId}`}>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 h-8 px-2.5 text-xs"
                >
                  <ClipboardCheck size={14} className="mr-1" />
                  {student.overallStatus === "manually_graded" ? t("examStudentCard.buttonRegrade") : t("examStudentCard.buttonGrade")}
                </Button>
              </Link>
            </AnimateIcon>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
