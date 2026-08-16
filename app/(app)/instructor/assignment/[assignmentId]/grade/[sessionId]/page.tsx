"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useState, useEffect, use, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { CaseGradingChat } from "@/components/instructor/CaseGradingChat";
import { SessionQuizResultsCard } from "@/components/instructor/SessionQuizResultsCard";
import toast from "react-hot-toast";
import {
  AIOverallSummary,
  SummaryData,
} from "@/components/instructor/AIOverallSummary";
import { AiDependencySummaryCard } from "@/components/grading/AiDependencySummaryCard";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { StageGrading, QuestionSummaryData, GradingProgress } from "@/lib/types/grading";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
  message_type?: "concept" | "calculation" | "strategy" | "other";
}

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
  ai_context?: string;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  decompressed?: {
    answerData?: Record<string, unknown>;
  };
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
  stage_grading?: StageGrading;
  ai_summary?: QuestionSummaryData | null;
  grade_type?: string;
}

interface AssignmentQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  rationale?: string;
}

interface AssignmentQuiz {
  id: string;
  questions: AssignmentQuizQuestion[];
  answers: Record<string, number>;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  status: string;
}

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  pasted_text?: string;
  paste_start?: number;
  paste_end?: number;
  answer_length_before?: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface SessionData {
  session: {
    id: string;
    exam_id: string;
    student_id: string;
    submitted_at: string;
    used_clarifications: number;
    created_at: string;
    ai_summary?: SummaryData;
    auto_submitted?: boolean;
    grading_progress?: GradingProgress | null;
    final_answer?: string | null;
    final_answer_updated_at?: string | null;
  };
  exam: {
    id: string;
    title: string;
    code: string;
    questions: Question[];
  };
  student: {
    name: string;
    email: string;
    student_number?: string;
    school?: string;
  };
  submissions: Record<string, Submission>;
  messages: Record<string, Conversation[]>;
  grades: Record<string, Grade>;
  pasteLogs?: Record<string, PasteLog[]>;
  overallScore: number | null;
  gradingProgress?: GradingProgress | null;
  assignmentQuiz?: AssignmentQuiz | null;
}

export default function AssignmentGradePage({
  params,
}: {
  params: Promise<{ assignmentId: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const queryClient = useQueryClient();

  const averageStats = useMemo(() => {
    const avgScore = searchParams.get("avgScore");
    const avgQuestions = searchParams.get("avgQuestions");
    const avgAnswerLength = searchParams.get("avgAnswerLength");
    const avgExamDuration = searchParams.get("avgExamDuration");
    return {
      averageScore: avgScore ? parseFloat(avgScore) : null,
      averageQuestions: avgQuestions ? parseFloat(avgQuestions) : null,
      averageAnswerLength: avgAnswerLength ? parseFloat(avgAnswerLength) : null,
      averageExamDuration: avgExamDuration ? parseFloat(avgExamDuration) : null,
    };
  }, [searchParams]);

  const t = useTranslations("grading");
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number>(0);
  const [overallSummary, setOverallSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  const {
    data: sessionData,
    isLoading: loading,
    error: sessionError,
    refetch,
  } = useQuery({
    queryKey: qk.session.grade(resolvedParams.sessionId),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/session/${resolvedParams.sessionId}/grade`,
        { signal }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || t("assignmentGradePage.loadFail", { status: response.status })
        );
      }
      return (await response.json()) as SessionData;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      (profile?.role as string) === "instructor"
    ),
    refetchInterval: (query) => {
      const status = query.state.data?.gradingProgress?.status;
      return status === "queued" || status === "running" ? 5000 : false;
    },
  });

  const [isRegrading, setIsRegrading] = useState(false);

  const handleRegrade = async () => {
    setIsRegrading(true);
    try {
      const response = await fetch(
        `/api/session/${resolvedParams.sessionId}/grade`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRegrade: true }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("assignmentGradePage.regradeFailed"));
      }
      const data = await response.json();
      toast.success(
        data.skipped
          ? t("assignmentGradePage.alreadyGraded")
          : t("assignmentGradePage.regradeQueued")
      );
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.sessionId),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("assignmentGradePage.regradeError")
      );
    } finally {
      setIsRegrading(false);
    }
  };

  const { data: generatedSummary, isLoading: summaryLoading } = useQuery({
    queryKey: qk.session.summary(sessionData?.session?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionData?.session?.id }),
        signal,
      });
      if (!response.ok) throw new Error("Failed to generate summary");
      const data = await response.json();
      return data.summary as SummaryData;
    },
    enabled: !!sessionData?.session?.id && !sessionData?.session?.ai_summary,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (sessionData) setOverallSummary(sessionData.session.ai_summary || null);
  }, [sessionData]);

  useEffect(() => {
    if (generatedSummary) setOverallSummary(generatedSummary);
  }, [generatedSummary]);

  const handleBackClick = () => {
    window.location.href = `/instructor/assignment/${resolvedParams.assignmentId}`;
  };

  // Early returns
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

  if (sessionError || !sessionData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-destructive mb-2">
            {sessionError
              ? t("assignmentGradePage.errorTitle")
              : t("assignmentGradePage.notFoundTitle")}
          </h2>
          {sessionError && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {sessionError.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("assignmentGradePage.retry")}
            </Button>
            <Link href={`/instructor/assignment/${resolvedParams.assignmentId}`}>
              <Button variant="outline">{t("assignmentGradePage.goBack")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  // Assignments have a single question at q_idx=0.
  // initialScore: prefer stage_grading.answer.score (AI sub-score), fall back to grade.score.
  // initialComment: prefer stage_grading.answer.comment, fall back to grade.comment.
  const grade0 = sessionData.grades?.[0] as Grade | undefined;
  const caseGradeInitialScore =
    grade0?.stage_grading?.answer?.score ?? grade0?.score;
  const caseGradeInitialComment =
    grade0?.stage_grading?.answer?.comment ?? grade0?.comment ?? "";

  const currentGrade = sessionData.grades?.[selectedQuestionIdx] as
    | Grade
    | undefined;
  const currentAiDependency = currentGrade?.stage_grading?.chat?.ai_dependency;
  const overallAiDependency = overallSummary?.aiDependency || null;
  const assignmentQuiz = sessionData.assignmentQuiz;

  let currentMessages = (sessionData.messages?.[selectedQuestionIdx] || []) as Conversation[];
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] || []) as Conversation[];
  }
  const duringExamMessages = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <SidebarInset>
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="outline" size="sm" onClick={handleBackClick}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("assignmentGradePage.backToAssignment")}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">
                  {t("assignmentGradePage.studentGradeTitle", { studentName: sessionData.student.name })}
                </h1>
                <div className="text-muted-foreground space-y-1 mt-2">
                  <p>
                    {t("assignmentGradePage.submittedAt")}{" "}
                    {new Date(sessionData.session.submitted_at).toLocaleString()}
                  </p>
                  {sessionData.student.student_number && (
                    <p>{t("assignmentGradePage.studentNumber", { number: sessionData.student.student_number })}</p>
                  )}
                  {sessionData.student.school && (
                    <p>{t("assignmentGradePage.school", { school: sessionData.student.school })}</p>
                  )}
                </div>
                {sessionData.overallScore !== null && (
                  <p className="text-lg font-semibold mt-2">
                    {t("assignmentGradePage.overallScore", { score: sessionData.overallScore })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {sessionData.session.auto_submitted && (
            <div className="mb-6 p-4 bg-warning-surface border border-warning-border rounded-lg flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-text shrink-0" />
              <div>
                <p className="font-medium text-warning-text">
                  {t("assignmentGradePage.autoSubmittedBannerTitle")}
                </p>
                <p className="text-sm text-warning-text">
                  {t("assignmentGradePage.autoSubmittedBannerDesc")}
                </p>
              </div>
            </div>
          )}

          {/* AI 채점 상태 배너: 진행 중 / 실패 / 부재 3가지 경우 처리 */}
          {(() => {
            const gp = sessionData.gradingProgress;
            const grades = Object.values(sessionData.grades) as Grade[];
            const hasAiFailed = grades.some((g) => g.grade_type === "ai_failed");
            const noGradesAtAll =
              sessionData.overallScore === null && grades.length === 0;
            const isQueued = gp?.status === "queued";
            const isRunning = gp?.status === "running";
            const isFailed = gp?.status === "failed" || hasAiFailed;
            const inProgress = isQueued || isRunning;

            if (!inProgress && !isFailed && !noGradesAtAll) return null;

            const done = gp ? gp.completed + gp.failed : 0;
            const total = gp?.total ?? 0;
            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

            if (inProgress) {
              return (
                <div className="mb-6 p-4 bg-info-surface border border-info-border rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-info-text shrink-0 animate-spin" />
                    <div>
                      <p className="font-medium text-info-text">
                        {t("assignmentGradePage.gradingInProgressTitle")}
                      </p>
                      <p className="text-sm text-info-text">
                        {total > 0 ? t("assignmentGradePage.gradingProgress", { done, total }) : t("assignmentGradePage.gradingWaiting")}
                        {gp && gp.failed > 0 && (
                          <span className="ml-2 text-destructive">
                            ({t("assignmentGradePage.gradingFailed", { count: gp.failed })})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="h-2 w-full rounded-full bg-info-subtle overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            }

            const title = isFailed ? t("assignmentGradePage.gradingFailedTitle") : t("assignmentGradePage.noGradesTitle");
            const progressPart = total > 0 ? ` (${done}/${total})` : "";
            const desc = isFailed
              ? t("assignmentGradePage.gradingFailedDesc", { progressPart })
              : t("assignmentGradePage.gradingAbsentDesc");

            return (
              <div className="mb-6 p-4 bg-warning-surface border border-warning-border rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning-text shrink-0" />
                  <div>
                    <p className="font-medium text-warning-text">
                      {title}
                    </p>
                    <p className="text-sm text-warning-text">
                      {desc}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleRegrade}
                  disabled={isRegrading}
                  variant="outline"
                  className="border-warning-border shrink-0"
                >
                  {isRegrading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("assignmentGradePage.queuingLabel")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("assignmentGradePage.regradeButton")}
                    </>
                  )}
                </Button>
              </div>
            );
          })()}

          <div className="mb-6">
            <AIOverallSummary summary={overallSummary} loading={summaryLoading} />
          </div>

          <QuestionNavigation
            questions={sessionData.exam?.questions || []}
            selectedQuestionIdx={selectedQuestionIdx}
            onSelectQuestion={setSelectedQuestionIdx}
            grades={sessionData.grades}
            hideScores
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <QuestionPromptCard
                question={currentQuestion}
                questionNumber={selectedQuestionIdx + 1}
              />

              <AIConversationsCard messages={duringExamMessages} />

              {assignmentQuiz && (
                <SessionQuizResultsCard quiz={assignmentQuiz} />
              )}

              {/* Assignment 최종답안 — sessions.final_answer (plain text, XSS 안전) */}
              <FinalAnswerCard
                finalAnswerText={sessionData.session.final_answer ?? ""}
              />
            </div>

            <div className="space-y-6">
              {/* AI-chat grading panel — assignment has one question at q_idx=0 */}
              <CaseGradingChat
                sessionId={resolvedParams.sessionId}
                qIdx={0}
                questionNumber={1}
                initialScore={caseGradeInitialScore}
                initialComment={caseGradeInitialComment}
              />

              <AiDependencySummaryCard
                mode="instructor"
                questionAssessment={currentAiDependency}
                overallSummary={overallAiDependency}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
