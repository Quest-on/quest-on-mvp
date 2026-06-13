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
          throw new Error("이 과제는 열람할 수 없습니다.");
        }
        if (response.status === 403 || response.status === 404) {
          throw new Error("과제 기록을 찾을 수 없습니다.");
        }
        throw new Error("과제 기록을 불러오는 중 오류가 발생했습니다.");
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
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {errorMessage || "과제 기록을 불러올 수 없습니다"}
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

  const { exam, deadline, session, messages, quiz } = data;
  const finalAnswerVisible = htmlHasContent(session?.final_answer);

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link href="/student" className="hover:text-foreground transition-colors">
            대시보드
          </Link>
          <span>/</span>
          <span className="truncate max-w-[200px]">{exam.title}</span>
          <span>/</span>
          <span className="text-foreground font-medium">열람</span>
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
                열람 전용 · 마감됨
              </Badge>
              {deadline && (
                <span className="text-sm text-muted-foreground">
                  제출 기한: {new Date(deadline).toLocaleString("ko-KR")}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              제출 기한이 지나 작성한 기록을 읽기 전용으로 보여드립니다. 더 이상 수정이나 제출은 할 수 없습니다.
            </p>
          </div>
          <div className="shrink-0">
            <Link href="/student">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                대시보드
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {!session && (
        <Card className="mb-8">
          <CardContent className="py-10 text-center text-muted-foreground">
            이 과제에 대한 응시 기록이 없습니다.
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
                과제 안내
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
                과제 문제
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {exam.questions.map((q, i) => (
                <div key={q.id || `q-${i}`} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    문제 {i + 1}
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
                <MessageCircle className="w-5 h-5 text-blue-600" />내 리서치 채팅
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  채팅 기록이 없습니다.
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
                            {new Date(msg.created_at).toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
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
                <FileText className="w-5 h-5 text-emerald-600" />내 최종답안
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
