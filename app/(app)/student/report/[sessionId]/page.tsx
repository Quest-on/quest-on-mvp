"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  ShieldQuestion,
} from "lucide-react";
import type { GradingProgress } from "@/lib/types/grading";

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
          throw new Error("리포트를 찾을 수 없습니다.");
        }
        throw new Error("리포트를 불러오는 중 오류가 발생했습니다.");
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
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {errorMessage || "리포트를 불러올 수 없습니다"}
          </h2>
          <Link href="/student">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              학생 대시보드로 돌아가기
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
            대시보드로 돌아가기
          </Button>
        </div>
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {isFailed ? "AI 채점 중 일부 문제가 실패했어요" : "AI 채점이 진행 중입니다"}
          </h2>
          <p className="text-muted-foreground mb-1">
            {isFailed
              ? "강사가 확인하고 재채점을 진행할 예정입니다."
              : "채점이 완료되면 자동으로 리포트가 표시됩니다."}
          </p>
          {!isFailed && (
            <p className="text-sm text-muted-foreground">
              보통 1~2분 내에 완료됩니다.
            </p>
          )}

          {hasProgress && (
            <div className="max-w-md mx-auto mt-8">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  {done}/{progress!.total} 문제 채점 완료
                  {progress!.failed > 0 && (
                    <span className="text-red-600 dark:text-red-400 ml-2">
                      (실패 {progress!.failed})
                    </span>
                  )}
                </span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isFailed ? "bg-red-500" : "bg-primary"
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
            대시보드
          </Link>
          <span>/</span>
          <span className="truncate max-w-[200px]">{reportData.exam.title}</span>
          <span>/</span>
          <span className="text-foreground font-medium">리포트</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{reportData.exam.title}</h1>
            <p className="text-muted-foreground mt-2">
              제출일:{" "}
              {new Date(reportData.session.submitted_at).toLocaleString(
                "ko-KR"
              )}
            </p>
            {!gradesNotReleased && reportData.overallScore !== null && (
              <div className="flex items-center gap-2 mt-3">
                <Award className="w-5 h-5 text-primary" />
                <p
                  data-testid="report-overall-score"
                  className="text-2xl font-bold text-foreground"
                >
                  전체 점수: {reportData.overallScore}/100점
                </p>
              </div>
            )}
            {gradesNotReleased && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                채점이 아직 확정되지 않았습니다. 교수의 최종 확정 후 성적을 확인할 수 있습니다.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {gradesNotReleased ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
              >
                <Clock className="w-4 h-4 mr-1" />
                채점 확정 대기중
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                평가 완료
              </Badge>
            )}
          </div>
        </div>
      </div>

      {allQuestions.length === 0 && (
        <div className="text-red-600">문제를 불러올 수 없습니다.</div>
      )}

      <div className="space-y-10">
        {/* 객관식 그룹 */}
        {mcqQuestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">객관식 {mcqQuestions.length}문항</h2>
              {released && (
                <Badge variant="secondary" className="text-foreground">
                  {correctCount(mcqQuestions)}/{mcqQuestions.length} 정답
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
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">OX {oxQuestions.length}문항</h2>
              {released && (
                <Badge variant="secondary" className="text-foreground">
                  {correctCount(oxQuestions)}/{oxQuestions.length} 정답
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
              <h2 className="text-lg font-semibold">서술형 {caseQuestions.length}문항</h2>
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
                            {score}점
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {msgs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                            <MessageCircle className="w-4 h-4" />
                            내 AI 채팅 기록
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
                                      {new Date(msg.created_at).toLocaleTimeString(
                                        "ko-KR",
                                        { hour: "2-digit", minute: "2-digit" }
                                      )}
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
                            내 최종답변
                          </p>
                          {submission ? (
                            <RichTextViewer
                              content={submission.answer}
                              className="text-base leading-relaxed whitespace-pre-wrap"
                            />
                          ) : (
                            <p className="text-muted-foreground">제출된 답안이 없습니다.</p>
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
        {assignmentQuiz && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldQuestion className="w-5 h-5 text-amber-600" />
                타임어택 퀴즈 결과
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  점수 {assignmentQuiz.score ?? 0}/100
                </Badge>
                <Badge variant="secondary">
                  {assignmentQuiz.total_questions}문항 · {assignmentQuiz.time_limit_seconds}초
                </Badge>
                {assignmentQuiz.submitted_at && (
                  <span className="text-sm text-muted-foreground">
                    완료: {new Date(assignmentQuiz.submitted_at).toLocaleString("ko-KR")}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {assignmentQuiz.questions.map((question, index) => {
                  const selectedIndex = assignmentQuiz.answers?.[question.id];
                  const correctIndex = question.correctOptionIndex;
                  const isCorrect =
                    typeof correctIndex === "number" && selectedIndex === correctIndex;

                  return (
                    <div key={question.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-sm">
                          {index + 1}. {question.question}
                        </p>
                        {typeof correctIndex === "number" && (
                          <Badge
                            variant="outline"
                            className={
                              isCorrect
                                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                : "bg-red-500/10 text-red-700 dark:text-red-400"
                            }
                          >
                            {isCorrect ? "정답" : "오답"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        선택:{" "}
                        {typeof selectedIndex === "number"
                          ? question.options[selectedIndex] || "무응답"
                          : "무응답"}
                      </p>
                      {typeof correctIndex === "number" && (
                        <p className="text-sm text-muted-foreground">
                          정답: {question.options[correctIndex]}
                        </p>
                      )}
                      {question.rationale && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          근거: {question.rationale}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Exam Info */}
        <Card>
          <CardHeader>
            <CardTitle>시험 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">시험 코드:</span>
              <span className="ml-2 exam-code">{reportData.exam.code}</span>
            </div>
            <div>
              <span className="text-muted-foreground">제출 일시:</span>
              <span className="ml-2">
                {new Date(reportData.session.submitted_at).toLocaleString(
                  "ko-KR"
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
