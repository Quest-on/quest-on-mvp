"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { StudentObjectiveAnswer } from "@/components/report/StudentObjectiveAnswer";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  MessageCircle,
  Award,
  ListChecks,
  Loader2,
  Clock,
} from "lucide-react";
import type { GradingProgress } from "@/lib/types/grading";
import {
  AssignmentQuizResult,
  type AssignmentQuiz,
} from "@/components/report/AssignmentQuizResult";
import { formatDateTime, formatTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
  ai_context?: string;
  options?: string[];
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  created_at: string;
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
}

interface ReportData {
  session: {
    id: string;
    exam_id: string;
    student_id: string;
    submitted_at: string;
    created_at: string;
  };
  exam: {
    id: string;
    title: string;
    code: string;
    questions: Question[];
    description?: string;
  };
  submissions: Record<number, Submission>;
  messages: Record<
    number,
    Array<{ role: string; content: string; created_at: string }>
  >;
  grades: Record<number, Grade>;
  overallScore: number | null;
  gradesReleased?: boolean;
  gradingProgress?: GradingProgress | null;
  assignmentQuiz?: AssignmentQuiz | null;
}

export default function StudentReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, isLoaded, isSignedIn } = useAppUser();
  const t = useTranslations("report.page");
  const locale = useLocale() as Locale;
  const sessionId = params.sessionId as string;
  const userRole = (profile?.role as string) || "student";

  const {
    data: reportData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["student-report", sessionId, user?.id],
    enabled:
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      typeof sessionId === "string" &&
      !!sessionId,
    queryFn: async () => {
      const response = await fetch(`/api/student/session/${sessionId}/report`);

      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          throw new Error(t("notFound"));
        }
        throw new Error(t("loadError"));
      }

      const data: ReportData = await response.json();
      return data;
    },
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.gradesReleased === false) {
        return false; // Don't poll — grades hidden until instructor releases
      }
      if (!data || !data.grades || Object.keys(data.grades).length === 0) {
        return 5000; // Poll every 5s while grading is incomplete
      }
      return false; // Stop polling once grades are available
    },
  });

  const errorMessage =
    queryError instanceof Error ? queryError.message : null;

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || (profile?.role as string) !== "student") {
      router.push("/student");
      return;
    }
  }, [isLoaded, isSignedIn, profile?.role, router]);

  if (!isLoaded || isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isSignedIn || (profile?.role as string) !== "student") {
    return null;
  }

  if (errorMessage || !reportData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-destructive mb-2">
            {errorMessage || t("cannotLoad")}
          </h2>
          <Link href="/student">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("backToDashboard")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const gradesNotReleased = reportData.gradesReleased === false;
  const gradingInProgress =
    !gradesNotReleased && (!reportData.grades || Object.keys(reportData.grades).length === 0);

  if (gradingInProgress) {
    const progress = reportData.gradingProgress;
    const hasProgress = !!progress && progress.total > 0;
    const done = progress ? progress.completed + progress.failed : 0;
    const pct = hasProgress ? Math.min(100, Math.round((done / progress!.total) * 100)) : 0;
    const isFailed = progress?.status === "failed";

    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/student")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("backToDashboardShort")}
          </Button>
        </div>
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {isFailed ? t("grading.failedTitle") : t("grading.inProgressTitle")}
          </h2>
          <p className="text-muted-foreground mb-1">
            {isFailed
              ? t("grading.failedDesc")
              : t("grading.inProgressDesc")}
          </p>
          {!isFailed && (
            <p className="type-hint">
              {t("grading.estimatedTime")}
            </p>
          )}

          {hasProgress && (
            <div className="max-w-md mx-auto mt-8">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  {t("grading.progressCount", { done, total: progress!.total })}
                  {progress!.failed > 0 && (
                    <span className="text-destructive ml-2">
                      {t("grading.failedCount", { failed: progress!.failed })}
                    </span>
                  )}
                </span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isFailed ? "bg-destructive/10" : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const assignmentQuiz = reportData.assignmentQuiz;
  const released = !gradesNotReleased;

  const allQuestions = Array.isArray(reportData.exam?.questions)
    ? reportData.exam.questions
    : [];
  const qIdxOf = (q: Question, fallback: number) =>
    typeof q.idx === "number" ? q.idx : fallback;
  const mcqQuestions = allQuestions.filter((q) => q.type === "multiple-choice");
  const oxQuestions = allQuestions.filter((q) => q.type === "true-false");
  const caseQuestions = allQuestions.filter(
    (q) => q.type !== "multiple-choice" && q.type !== "true-false",
  );

  const scoreOf = (q: Question, fallback: number): number | undefined =>
    released ? reportData.grades?.[qIdxOf(q, fallback)]?.score : undefined;
  const correctCount = (group: Question[]) =>
    group.filter((q) => scoreOf(q, allQuestions.indexOf(q)) === 100).length;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link href="/student" className="hover:text-foreground transition-colors">
            {t("breadcrumb.dashboard")}
          </Link>
          <span>/</span>
          <span className="truncate max-w-[200px]">{reportData.exam.title}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{t("breadcrumb.report")}</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{reportData.exam.title}</h1>
            <p className="text-muted-foreground mt-2">
              {t("submittedAt")}{" "}
              {formatDateTime(reportData.session.submitted_at, locale)}
            </p>
            {!gradesNotReleased && reportData.overallScore !== null && (
              <div className="flex items-center gap-2 mt-3">
                <Award className="w-5 h-5 text-primary" />
                <p
                  data-testid="report-overall-score"
                  className="text-2xl font-bold text-foreground"
                >
                  {t("overallScore", { score: reportData.overallScore })}
                </p>
              </div>
            )}
            {gradesNotReleased && (
              <p className="text-sm text-warning-text mt-3">
                {t("gradesNotReleased")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {gradesNotReleased ? (
              <Badge
                variant="outline"
                className="bg-warning-surface/10 text-warning-text border-warning-border/20"
              >
                <Clock className="w-4 h-4 mr-1" />
                {t("badge.pendingRelease")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-success-solid/10 text-success-text border-success-border/20"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("badge.evaluated")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {allQuestions.length === 0 && (
        <div className="text-destructive">{t("noQuestions")}</div>
      )}

      <div className="space-y-10">
        {/* 객관식 그룹 */}
        {mcqQuestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-info-text" />
              <h2 className="text-lg font-semibold">
                {t("group.mcq", { count: mcqQuestions.length })}
              </h2>
              {released && (
                <Badge variant="secondary" className="text-foreground">
                  {t("group.mcqCorrect", {
                    correct: correctCount(mcqQuestions),
                    total: mcqQuestions.length,
                  })}
                </Badge>
              )}
            </div>
            <div className="space-y-4">
              {mcqQuestions.map((question, i) => {
                const idx = qIdxOf(question, allQuestions.indexOf(question));
                return (
                  <Card key={question.id || `mcq-${i}`}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        <span className="text-muted-foreground mr-2">Q{i + 1}.</span>
                        <RichTextViewer
                          content={question.prompt || ""}
                          className="inline text-base font-semibold"
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StudentObjectiveAnswer
                        type={question.type}
                        options={question.options}
                        selectedAnswer={reportData.submissions?.[idx]?.answer}
                        released={released}
                        score={reportData.grades?.[idx]?.score}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* OX 그룹 */}
        {oxQuestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success-text" />
              <h2 className="text-lg font-semibold">
                {t("group.ox", { count: oxQuestions.length })}
              </h2>
              {released && (
                <Badge variant="secondary" className="text-foreground">
                  {t("group.oxCorrect", {
                    correct: correctCount(oxQuestions),
                    total: oxQuestions.length,
                  })}
                </Badge>
              )}
            </div>
            <div className="space-y-4">
              {oxQuestions.map((question, i) => {
                const idx = qIdxOf(question, allQuestions.indexOf(question));
                return (
                  <Card key={question.id || `ox-${i}`}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        <span className="text-muted-foreground mr-2">Q{i + 1}.</span>
                        <RichTextViewer
                          content={question.prompt || ""}
                          className="inline text-base font-semibold"
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StudentObjectiveAnswer
                        type={question.type}
                        options={question.options}
                        selectedAnswer={reportData.submissions?.[idx]?.answer}
                        released={released}
                        score={reportData.grades?.[idx]?.score}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* 서술형 그룹 */}
        {caseQuestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold">
                {t("group.essay", { count: caseQuestions.length })}
              </h2>
            </div>
            <div className="space-y-6">
              {caseQuestions.map((question, i) => {
                const idx = qIdxOf(question, allQuestions.indexOf(question));
                const msgs = reportData.messages?.[idx] ?? [];
                const submission = reportData.submissions?.[idx];
                const score = scoreOf(question, allQuestions.indexOf(question));
                return (
                  <Card key={question.id || `case-${i}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-base">
                          <span className="text-muted-foreground mr-2">Q{i + 1}.</span>
                          <RichTextViewer
                            content={question.prompt || ""}
                            className="inline text-base font-semibold"
                          />
                        </CardTitle>
                        {typeof score === "number" && (
                          <Badge variant="secondary" className="shrink-0 text-foreground">
                            {t("group.scorePoints", { score })}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {msgs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                            <MessageCircle className="w-4 h-4" />
                            {t("chat.title")}
                          </div>
                          <div className="space-y-4">
                            {msgs.map((msg, index) => (
                              <div
                                key={index}
                                className={`flex ${
                                  msg.role === "user" ? "justify-end" : "justify-start"
                                }`}
                              >
                                {msg.role === "user" ? (
                                  <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[85%] sm:max-w-[70%]">
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                      {msg.content}
                                    </p>
                                    <p className="text-xs mt-2 opacity-70">
                                      {formatTime(msg.created_at, locale)}
                                    </p>
                                  </div>
                                ) : (
                                  <AIMessageRenderer
                                    content={msg.content}
                                    timestamp={msg.created_at}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!assignmentQuiz && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            {t("finalAnswer.title")}
                          </p>
                          {submission ? (
                            <RichTextViewer
                              content={submission.answer}
                              className="text-base leading-relaxed whitespace-pre-wrap"
                            />
                          ) : (
                            <p className="text-muted-foreground">{t("finalAnswer.empty")}</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Assignment Quiz Result */}
        {assignmentQuiz && <AssignmentQuizResult quiz={assignmentQuiz} />}

        {/* Exam Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t("examInfo.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">{t("examInfo.examCode")}</span>
              <span className="ml-2 exam-code">{reportData.exam.code}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("examInfo.submittedAt")}</span>
              <span className="ml-2">
                {formatDateTime(reportData.session.submitted_at, locale)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
