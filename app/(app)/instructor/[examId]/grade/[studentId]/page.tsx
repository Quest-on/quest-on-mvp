"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useState, useEffect, use, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GradeHeader } from "@/components/instructor/GradeHeader";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { ObjectiveGradeCard } from "@/components/instructor/ObjectiveGradeCard";
import { CaseGradingChat } from "@/components/instructor/CaseGradingChat";
import {
  SessionQuizResultsCard,
  type SessionQuizAttempt,
} from "@/components/instructor/SessionQuizResultsCard";
import { QuestionAiSummaryCard } from "@/components/instructor/QuestionAiSummaryCard";
import {
  AIOverallSummary,
  type SummaryData,
} from "@/components/instructor/AIOverallSummary";
import { isObjectiveQuestion } from "@/lib/grading-helpers";
import {
  buildTypedQuestionEntries,
  getSubmissionForQuestion,
  getSubmittedAnswer,
} from "@/lib/objective-grade-view";
import { QuickActionsCard } from "@/components/instructor/QuickActionsCard";
import toast from "react-hot-toast";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  StageGrading,
  GradingProgress,
  QuestionSummaryData,
} from "@/lib/types/grading";

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
  options?: string[];
  correctOptionIndex?: number;
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
    ai_summary?: SummaryData | null;
    auto_submitted?: boolean;
    grading_progress?: GradingProgress | null;
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
  pasteLogs?: Record<string, PasteLog[]>; // question_id별로 그룹화된 paste 로그
  overallScore: number | null;
  gradingProgress?: GradingProgress | null;
  assignmentQuiz?: SessionQuizAttempt | null;
}

function parseQIdxParam(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function findQuestionArrayIndexByQIdx(
  questions: Question[],
  qIdx: number,
): number {
  const explicitIdxMatch = questions.findIndex((q) => q.idx === qIdx);
  if (explicitIdxMatch !== -1) return explicitIdxMatch;

  const hasExplicitIdx = questions.some((q) => Number.isInteger(q.idx));
  if (!hasExplicitIdx && qIdx < questions.length) return qIdx;

  return -1;
}

function isCaseNavigationQuestionType(type?: string): boolean {
  return type === "case" || type === "essay" || type === "short-answer";
}

function findFirstQuestionArrayIndexByType(
  questions: Question[],
  questionType?: string,
): number {
  if (!questionType) return -1;

  return questions.findIndex((q) => {
    if (questionType === "case") return isCaseNavigationQuestionType(q.type);
    return q.type === questionType;
  });
}

export default function GradeStudentPage({
  params,
}: {
  params: Promise<{ examId: string; studentId: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, profile } = useAppUser();
  const queryClient = useQueryClient();

  const questionType = searchParams.get("questionType") ?? undefined;
  const qIdxParam = searchParams.get("qIdx");
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number>(0);
  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, profile?.role]);

  // Query for session data
  const { data: sessionData, isLoading: loading, error: sessionError, refetch } = useQuery({
    queryKey: qk.session.grade(resolvedParams.studentId),
    queryFn: async ({ signal }) => {
      // studentId is actually sessionId in the URL
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        { signal } // AbortSignal 연결
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `채점 데이터 로드 실패 (${response.status})`);
      }

      const data: SessionData = await response.json();

      return data;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      (profile?.role as string) === "instructor"
    ),
    // 채점 큐 진행 중 (queued/running) 에는 5초 폴링으로 진행률 반영
    refetchInterval: (query) => {
      const status = query.state.data?.gradingProgress?.status;
      return status === "queued" || status === "running" ? 5000 : false;
    },
  });

  // URL 파라미터(qIdx 우선, questionType 보조)에 따라 초기 문항만 선택한다.
  useEffect(() => {
    if (!sessionData?.exam?.questions) return;
    if (sessionData.exam.questions.length === 0) return;

    const selectionKey = [
      resolvedParams.studentId,
      qIdxParam ?? "",
      questionType ?? "",
    ].join(":");
    if (initialSelectionAppliedRef.current === selectionKey) return;

    const qs = sessionData.exam.questions;
    const qIdx = parseQIdxParam(qIdxParam);
    const targetIdx =
      qIdx !== null
        ? findQuestionArrayIndexByQIdx(qs, qIdx)
        : findFirstQuestionArrayIndexByType(qs, questionType);

    if (targetIdx !== -1) {
      setSelectedQuestionIdx(targetIdx);
    }
    initialSelectionAppliedRef.current = selectionKey;
  }, [qIdxParam, questionType, resolvedParams.studentId, sessionData?.exam?.questions]);

  // AI 재채점 상태
  const [isRegrading, setIsRegrading] = useState(false);

  // AI 재채점 핸들러
  const handleRegrade = async () => {
    setIsRegrading(true);
    try {
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRegrade: true }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "AI 재채점에 실패했습니다");
      }

      const data = await response.json();
      toast.success(
        data.skipped
          ? "이미 채점이 완료되어 있습니다."
          : "AI 재채점 요청을 큐에 등록했습니다. 완료되면 자동으로 결과가 표시됩니다."
      );

      // 데이터 리프레시 — 큐잉 직후부터 폴링으로 진행률 반영
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.studentId),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "AI 재채점 중 오류가 발생했습니다"
      );
    } finally {
      setIsRegrading(false);
    }
  };

  const handleBackClick = () => {
    window.location.href = `/instructor/${resolvedParams.examId}`;
  };

  // Calculate exam participation statistics
  // Show loading while auth is loading
  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Don't render anything if not authorized
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
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {sessionError ? "채점 데이터를 불러오는 중 오류가 발생했습니다" : "제출물을 찾을 수 없습니다"}
          </h2>
          {sessionError && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {sessionError.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              다시 시도
            </Button>
            <Link href={`/instructor/${resolvedParams.examId}`}>
              <Button variant="outline">돌아가기</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get current question data
  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const selectedQuestionQIdx = currentQuestion?.idx ?? selectedQuestionIdx;
  const currentSubmission = sessionData.submissions?.[selectedQuestionQIdx] as
    | Submission
    | undefined;
  const currentGrade = sessionData.grades?.[selectedQuestionQIdx] as
    | Grade
    | undefined;

  const caseGradeInitialScore =
    currentGrade?.stage_grading?.answer?.score ?? currentGrade?.score;
  const caseGradeInitialComment =
    currentGrade?.stage_grading?.answer?.comment ?? currentGrade?.comment ?? "";

  // Try to get messages by both index and question.id (for backward compatibility)
  let currentMessages = (sessionData.messages?.[selectedQuestionQIdx] ||
    []) as Conversation[];

  // If no messages found by index, try using question.id
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] ||
      []) as Conversation[];
  }

  // Separate messages into AI conversations (before submission) and feedback conversations (after submission)
  const aiConversations = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

  // For now, we'll assume all messages are AI conversations during the exam
  const duringExamMessages = aiConversations;

  const caseCount =
    sessionData.exam?.questions?.filter(
      (q: Question) => !isObjectiveQuestion(q.type),
    ).length ?? 0;

  const sessionSummary =
    (sessionData.session.ai_summary as SummaryData | null) ?? null;
  const hasSessionSummary =
    !!sessionSummary &&
    typeof sessionSummary.summary === "string" &&
    sessionSummary.summary.trim().length > 0;

  const gp = sessionData.gradingProgress;
  const hasCurrentQuestionSummary =
    !!currentGrade?.ai_summary &&
    typeof currentGrade.ai_summary.summary === "string" &&
    currentGrade.ai_summary.summary.trim().length > 0;

  const summaryLoading =
    caseCount >= 2
      ? !hasCurrentQuestionSummary &&
        (gp?.status === "queued" ||
          gp?.status === "running") &&
        (gp?.phase === "qsummary" ||
          gp?.phase === "grade" ||
          gp?.phase === "question_summary")
      : !hasSessionSummary &&
        (gp?.status === "queued" ||
          gp?.status === "running") &&
        (gp?.phase === "session_summary" ||
          gp?.phase === "qsummary" ||
          gp?.phase === "grade");

  const objectiveQuestionType =
    questionType === "multiple-choice" || questionType === "true-false"
      ? questionType
      : null;
  const objectiveQuestionEntries = objectiveQuestionType
    ? buildTypedQuestionEntries(sessionData.exam.questions, objectiveQuestionType)
    : [];
  const objectiveTitle =
    objectiveQuestionType === "multiple-choice" ? "사지선다 정답 확인" : "O/X 정답 확인";
  const caseQuestionEntries = (sessionData.exam?.questions || [])
    .map((q, arrIdx) => ({ q, arrIdx }))
    .filter(({ q }) => isCaseNavigationQuestionType(q.type));
  const selectedCaseVisibleIdx = Math.max(
    0,
    caseQuestionEntries.findIndex(({ arrIdx }) => arrIdx === selectedQuestionIdx),
  );

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <SidebarInset>
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
          <div className="mb-8">
            <GradeHeader
              studentName={sessionData.student.name}
              submittedAt={sessionData.session.submitted_at}
              overallScore={sessionData.overallScore}
              examId={resolvedParams.examId}
              studentNumber={sessionData.student.student_number}
              school={sessionData.student.school}
              onBackClick={handleBackClick}
              questionNavigation={
                objectiveQuestionType ? undefined : (
                  <QuestionNavigation
                    questions={caseQuestionEntries.map(({ q }) => q)}
                    selectedQuestionIdx={selectedCaseVisibleIdx}
                    onSelectQuestion={(visibleIdx) => {
                      const target = caseQuestionEntries[visibleIdx];
                      if (target) setSelectedQuestionIdx(target.arrIdx);
                    }}
                    grades={sessionData.grades}
                    initialFilter="case"
                  />
                )
              }
            />
          </div>

          {/* CASE 평가 — 2문항 이상: 문항별 / 1문항: 세션 종합 */}
          {!isObjectiveQuestion(currentQuestion?.type) && (
            <div className="mb-6 space-y-4">
              {caseCount >= 2 ? (
                <QuestionAiSummaryCard
                  summary={currentGrade?.ai_summary ?? null}
                  loading={summaryLoading}
                />
              ) : (
                <AIOverallSummary
                  summary={sessionSummary}
                  loading={summaryLoading}
                />
              )}
            </div>
          )}

          {objectiveQuestionType && (
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{objectiveTitle}</CardTitle>
                  <CardDescription>
                    이 화면은 {objectiveQuestionType === "multiple-choice" ? "사지선다" : "O/X"} 문제의 학생 선택과 정답만 표시합니다.
                  </CardDescription>
                </CardHeader>
              </Card>

              {objectiveQuestionEntries.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    표시할 문제가 없습니다.
                  </CardContent>
                </Card>
              ) : (
                objectiveQuestionEntries.map(({ question, globalIndex }, displayIndex) => {
                  const submission = getSubmissionForQuestion(
                    sessionData.submissions,
                    question,
                    globalIndex,
                  );
                  const studentAnswer = getSubmittedAnswer(submission);
                  return (
                    <Card key={question.id || `${question.type}-${globalIndex}`}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          문제 {displayIndex + 1}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-lg bg-muted/40 p-4">
                          <RichTextViewer content={question.prompt} className="text-sm" />
                          {question.ai_context && (
                            <div className="mt-4 border-t pt-4">
                              <p className="mb-2 text-xs text-muted-foreground">
                                AI 컨텍스트:
                              </p>
                              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                {question.ai_context}
                              </p>
                            </div>
                          )}
                        </div>
                        <ObjectiveGradeCard
                          type={question.type}
                          options={question.options}
                          correctOptionIndex={question.correctOptionIndex}
                          studentAnswer={studentAnswer}
                          embedded
                        />
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {!objectiveQuestionType && (
            <>

          {/* 강제 종료 자동 제출 안내 배너 */}
          {sessionData.session.auto_submitted && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  강제 종료로 자동 제출된 세션
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  이 세션은 시험 강제 종료로 자동 제출되었습니다. 자동 저장된 답변만 표시됩니다.
                </p>
              </div>
            </div>
          )}

          {/* AI 채점 상태 배너: 진행 중 / 실패 / 부재 3가지 경우 모두 처리 */}
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

            // Nothing to surface when grading completed cleanly
            if (!inProgress && !isFailed && !noGradesAtAll) return null;

            const done = gp ? gp.completed + gp.failed : 0;
            const total = gp?.total ?? 0;
            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

            // In-progress state — show progress bar, no retry button
            if (inProgress) {
              return (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 animate-spin" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">
                        AI 채점이 진행 중입니다
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        {total > 0 ? `${done}/${total} 문제 완료` : "채점 대기 중"}
                        {gp && gp.failed > 0 && (
                          <span className="ml-2 text-red-600 dark:text-red-400">
                            (실패 {gp.failed})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="h-2 w-full rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            }

            // Failed or no-grades — show retry button
            const title = isFailed
              ? "AI 채점 실패"
              : "자동 채점 결과가 없습니다";
            const desc = isFailed
              ? `일부(또는 전체) 문제의 AI 채점이 실패했습니다.${
                  total > 0 ? ` (${done}/${total})` : ""
                } AI 재채점을 실행하거나 수동으로 채점해주세요.`
              : "배경 자동 채점이 실행되지 않았거나 실패했습니다. AI 재채점을 실행해주세요.";

            return (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      {title}
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {desc}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleRegrade}
                  disabled={isRegrading}
                  variant="outline"
                  className="border-amber-300 dark:border-amber-700 shrink-0"
                >
                  {isRegrading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      큐 등록 중...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      AI 재채점
                    </>
                  )}
                </Button>
              </div>
            );
          })()}

          {/* 데이터 표시 */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <QuestionPromptCard
                question={currentQuestion}
                questionNumber={selectedQuestionQIdx + 1}
              />

              {isObjectiveQuestion(currentQuestion?.type) ? (
                <ObjectiveGradeCard
                  type={currentQuestion?.type ?? ""}
                  options={currentQuestion?.options}
                  correctOptionIndex={currentQuestion?.correctOptionIndex}
                  studentAnswer={currentSubmission?.answer}
                />
              ) : (
                <>
                  <AIConversationsCard messages={duringExamMessages} />

                  <FinalAnswerCard
                    submission={currentSubmission}
                    pasteLogs={
                      currentQuestion
                        ? sessionData.pasteLogs?.[currentQuestion.id] ||
                          sessionData.pasteLogs?.[String(selectedQuestionQIdx)]
                        : undefined
                    }
                    questionId={currentQuestion?.id}
                  />
                </>
              )}
            </div>

            <div className="space-y-6">
              {sessionData.assignmentQuiz && (
                <SessionQuizResultsCard
                  quiz={sessionData.assignmentQuiz}
                  compact
                />
              )}

              {!isObjectiveQuestion(currentQuestion?.type) && (
                <CaseGradingChat
                  key={selectedQuestionQIdx}
                  sessionId={sessionData.session.id}
                  qIdx={selectedQuestionQIdx}
                  questionNumber={selectedQuestionQIdx + 1}
                  initialScore={caseGradeInitialScore}
                  initialComment={caseGradeInitialComment}
                />
              )}

              <QuickActionsCard
                sessionId={sessionData.session.id}
                isGraded={
                  Object.keys(sessionData.grades || {}).length > 0 &&
                  sessionData.overallScore !== null
                }
                reportData={
                  sessionData
                    ? {
                        exam: {
                          title: sessionData.exam.title,
                          code: sessionData.exam.code,
                          questions: sessionData.exam.questions.map(
                            (q: Question) => ({
                              id: q.id,
                              idx: q.idx,
                              type: q.type,
                              prompt: q.prompt,
                            })
                          ),
                          description: undefined,
                        },
                        session: {
                          submitted_at: sessionData.session.submitted_at,
                        },
                        grades: Object.fromEntries(
                          Object.entries(sessionData.grades).map(
                            ([key, grade]) => {
                              const typedGrade = grade as Grade;
                              return [
                                parseInt(key),
                                {
                                  id: typedGrade.id,
                                  q_idx: typedGrade.q_idx,
                                  score: typedGrade.score,
                                  comment: typedGrade.comment,
                                  stage_grading: typedGrade.stage_grading,
                                  ai_summary: typedGrade.ai_summary,
                                },
                              ];
                            }
                          )
                        ),
                        overallScore: sessionData.overallScore,
                        studentName: sessionData.student.name,
                        studentNumber: sessionData.student.student_number,
                        school: sessionData.student.school,
                        aiSummary:
                          caseCount >= 2
                            ? null
                            : ((sessionData.session.ai_summary as SummaryData | null) ??
                              null),
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </>
          )}
        </div>
      </SidebarInset>

    </SidebarProvider>
  );
}
