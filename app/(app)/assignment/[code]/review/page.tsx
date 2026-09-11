"use client";

import { useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTime, formatTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import {
  AssignmentQuizResult,
  type AssignmentQuiz,
} from "@/components/report/AssignmentQuizResult";
import { qk } from "@/lib/query-keys";
import {
  ArrowLeft,
  FileText,
  MessageCircle,
  Lock,
  ClipboardList,
} from "lucide-react";

interface ReviewQuestion {
  id: string;
  text: string;
  type: string;
}

interface ReviewMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ReviewData {
  exam: {
    id: string;
    title: string;
    code: string;
    assignment_prompt: string | null;
    questions: ReviewQuestion[];
  };
  deadline: string | null;
  session: {
    id: string;
    status: string;
    submitted_at: string | null;
    final_answer: string | null;
    created_at: string;
  } | null;
  messages: ReviewMessage[];
  quiz: AssignmentQuiz | null;
}

/** HTML 본문이 시각적으로 비어있지 않은지(태그만 있는 경우 제외) 확인 */
function htmlHasContent(html: string | null | undefined): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export default function AssignmentReviewPage() {
  const t = useTranslations("assignment");
  const locale = useLocale() as Locale;
  const params = useParams();
  const router = useRouter();
  const { user, profile, isLoaded, isSignedIn } = useAppUser();
  const code = params.code as string;
  const userRole = (profile?.role as string) || "student";

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: qk.student.assignmentReview(code, user?.id),
    enabled:
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      typeof code === "string" &&
      !!code,
    queryFn: async () => {
      const response = await fetch(`/api/student/assignment/${code}/review`);
      if (!response.ok) {
        if (response.status === 400) {
          throw new Error(t("review.errorNotViewable"));
        }
        if (response.status === 403 || response.status === 404) {
          throw new Error(t("review.errorNotFound"));
        }
        throw new Error(t("review.errorLoading"));
      }
      return (await response.json()) as ReviewData;
    },
    retry: false,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || userRole !== "student") {
      router.push("/student");
    }
  }, [isLoaded, isSignedIn, userRole, router]);

  if (!isLoaded || isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isSignedIn || userRole !== "student") {
    return null;
  }

  const errorMessage = queryError instanceof Error ? queryError.message : null;

  if (errorMessage || !data) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-destructive mb-2">
            {errorMessage || t("review.errorFallback")}
          </h2>
          <Link href="/student">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("review.backToDashboard")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { exam, deadline, session, messages, quiz } = data;
  const finalAnswerVisible = htmlHasContent(session?.final_answer);

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link href="/student" className="hover:text-foreground transition-colors">
            {t("review.breadcrumbDashboard")}
          </Link>
          <span>/</span>
          <span className="truncate max-w-[200px]">{exam.title}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{t("review.breadcrumbReview")}</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold">{exam.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-muted text-muted-foreground"
              >
                <Lock className="w-3.5 h-3.5 mr-1" />
                {t("review.statusBadge")}
              </Badge>
              {deadline && (
                <span className="type-hint">
                  {t("review.deadline", { deadline: formatDateTime(deadline, locale) })}
                </span>
              )}
            </div>
            <p className="type-hint">
              {t("review.readonlyNotice")}
            </p>
          </div>
          <div className="shrink-0">
            <Link href="/student">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("review.dashboardButton")}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {!session && (
        <Card className="mb-8">
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("review.noSessionRecord")}
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {/* 과제 안내 */}
        {exam.assignment_prompt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-5 h-5 text-primary" />
                {t("review.sectionPrompt")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <AIMessageRenderer
                  content={exam.assignment_prompt}
                  timestamp={new Date().toISOString()}
                  variant="plain"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 과제 문제 */}
        {exam.questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-purple-600" />
                {t("review.sectionQuestions")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {exam.questions.map((q, i) => (
                <div key={q.id || `q-${i}`} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("review.questionLabel", { number: i + 1 })}
                  </p>
                  <RichTextViewer content={q.text} className="text-sm" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 본인 리서치 채팅 */}
        {session && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="w-5 h-5 text-info-text" />{t("review.sectionChat")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t("review.noChatHistory")}
                </p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
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
                            {formatTime(msg.created_at, locale, { hour: "2-digit", minute: "2-digit" })}
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
              )}
            </CardContent>
          </Card>
        )}

        {/* 최종답안 */}
        {finalAnswerVisible && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-success-text" />{t("review.sectionFinalAnswer")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextViewer
                content={session!.final_answer || ""}
                className="text-base leading-relaxed whitespace-pre-wrap"
              />
            </CardContent>
          </Card>
        )}

        {/* 타임어택 퀴즈 결과 */}
        {quiz && <AssignmentQuizResult quiz={quiz} />}
      </div>
    </div>
  );
}
