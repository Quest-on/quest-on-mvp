"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AssignmentHeader } from "@/components/assignment/AssignmentHeader";
import { AssignmentChatPanel } from "@/components/assignment/AssignmentChatPanel";
import { AssignmentSubmitDialog } from "@/components/assignment/AssignmentSubmitDialog";
import { FinalAnswerButton } from "@/components/assignment/FinalAnswerButton";
import { FinalAnswerSheet } from "@/components/assignment/FinalAnswerSheet";
import { useAssignmentSession } from "@/hooks/useAssignmentSession";
import { useAssignmentChat } from "@/hooks/useAssignmentChat";
import { useFinalAnswer } from "@/hooks/useFinalAnswer";
import { Loader2, AlertCircle, FileX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function AssignmentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const t = useTranslations("assignment");
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  const router = useRouter();

  const {
    exam,
    session,
    isLoading: isSessionLoading,
    error,
    userId,
  } = useAssignmentSession(code);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [finalAnswerSheetOpen, setFinalAnswerSheetOpen] = useState(false);
  const [finalAnswerAttention, setFinalAnswerAttention] = useState(false);

  const finalAnswer = useFinalAnswer({
    sessionId: session?.id,
    examId: exam?.id,
    studentId: userId || undefined,
    initialValue: session?.final_answer,
    disabled: isSubmitted,
  });

  // attention 상태는 1.5s 뒤 자동 해제 (shake 애니메이션은 0.6s)
  useEffect(() => {
    if (!finalAnswerAttention) return;
    const t = setTimeout(() => setFinalAnswerAttention(false), 1500);
    return () => clearTimeout(t);
  }, [finalAnswerAttention]);

  // Detect if already submitted
  useEffect(() => {
    if (session?.submitted_at || session?.status === "submitted") {
      setIsSubmitted(true);
    } else if (session?.status === "quiz_pending") {
      router.replace(`/student/session/${session.id}/quiz`);
    }
  }, [session, router]);

  const {
    messages,
    setMessages,
    isLoading: isChatLoading,
    sendMessage,
    citations,
  } = useAssignmentChat({
    sessionId: session?.id || "",
    examId: exam?.id || "",
    studentId: userId,
  });

  // Load existing messages when session initializes
  useEffect(() => {
    if (!session?.id) return;
    const loadMessages = async () => {
      try {
        const res = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_messages",
            data: { sessionId: session.id },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const existingMsgs = data.messages || [];
          if (existingMsgs.length > 0) {
            setMessages(
              existingMsgs.map(
                (m: { id: string; role: string; content: string }) => {
                  const isAssistant = m.role === "ai";
                  return {
                    id: m.id,
                    role: isAssistant ? "assistant" as const : "user" as const,
                    content: m.content,
                    isStreaming: false,
                  };
                }
              )
            );
          }
        }
      } catch {
        // Non-critical
      }
    };
    loadMessages();
  }, [session?.id, setMessages]);

  // Auto-submit when deadline expires
  const handleDeadlineExpired = useCallback(async () => {
    if (isSubmitted || isSubmitting) return;
    if (!session?.id || !exam?.id || !userId) return;
    toast(t("page.deadlineExpiredToast"), { icon: "\u23F0" });
    setIsSubmitting(true);
    try {
      try {
        await finalAnswer.flush();
      } catch {
        // ignore — server accepts partial work past deadline
      }
      const res = await fetch(`/api/student/session/${session.id}/deadline-auto-submit`, {
        method: "POST",
      });
      if (res.ok || res.status === 409) {
        setIsSubmitted(true);
        toast.success(t("page.autoSubmitSuccess"));
        router.push(`/student/report/${session.id}`);
      }
    } catch {
      // Silent — deadline already passed
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitted, isSubmitting, session?.id, exam?.id, userId, router, finalAnswer]);

  // Pre-flight: header "제출하기" 클릭 시 호출 — 미작성이면 sheet 열고 어필
  const handleHeaderSubmitClick = () => {
    if (!finalAnswer.value.trim()) {
      setFinalAnswerSheetOpen(true);
      setFinalAnswerAttention(true);
      toast.error(t("page.finalAnswerRequired"));
      return;
    }
    setShowSubmitDialog(true);
  };

  // Handle submit (dialog confirm)
  const handleSubmit = async () => {
    if (!session?.id || !exam?.id || !userId) return;

    setIsSubmitting(true);
    try {
      // 1) Flush any pending auto-save first
      const flushRes = await finalAnswer.flush();
      if (!flushRes.ok && flushRes.error && flushRes.error !== "aborted") {
        throw new Error(t("page.saveError"));
      }

      // 2) Submit
      const res = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_assignment",
          data: {
            sessionId: session.id,
            examId: exam.id,
            studentId: userId,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // 서버측 final_answer_missing 가드에 대한 친절한 처리
        if (errData?.details?.reason === "final_answer_missing") {
          setShowSubmitDialog(false);
          setFinalAnswerSheetOpen(true);
          setFinalAnswerAttention(true);
          throw new Error(t("page.finalAnswerRequired"));
        }
        throw new Error(errData.message || t("page.submitError"));
      }

      setIsSubmitted(true);
      setShowSubmitDialog(false);
      toast.success(t("page.quizRedirect"));
      router.push(`/student/session/${session.id}/quiz`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("page.submitNetworkError")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("page.loading")}</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold">{t("page.errorTitle")}</CardTitle>
            <CardDescription className="text-sm">{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button size="lg" className="min-h-[48px] px-8" onClick={() => router.push("/")}>
              {t("page.backButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <FileX className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl font-bold">{t("page.notFoundTitle")}</CardTitle>
            <CardDescription className="text-sm">{t("page.notFoundDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button size="lg" className="min-h-[48px] px-8" onClick={() => router.push("/")}>
              {t("page.backButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <AssignmentHeader
        title={exam.title}
        deadline={exam.deadline}
        isSubmitted={isSubmitted}
        onSubmit={handleHeaderSubmitClick}
        isSubmitting={isSubmitting}
        onDeadlineExpired={handleDeadlineExpired}
      />

      <div className="flex-1 overflow-hidden">
        <AssignmentChatPanel
          messages={messages}
          isLoading={isChatLoading}
          onSendMessage={sendMessage}
          isSubmitted={isSubmitted}
          assignmentPrompt={exam.assignment_prompt || ""}
          questions={(exam.questions || []) as { id: string; text: string; type: string }[]}
          citations={citations}
        />
      </div>

      {!isSubmitted && (
        <FinalAnswerButton
          hasContent={!!finalAnswer.value.trim()}
          attention={finalAnswerAttention}
          onClick={() => setFinalAnswerSheetOpen(true)}
        />
      )}

      <FinalAnswerSheet
        open={finalAnswerSheetOpen}
        onOpenChange={setFinalAnswerSheetOpen}
        value={finalAnswer.value}
        onChange={finalAnswer.setValue}
        onFlush={finalAnswer.flush}
        isSaving={finalAnswer.isSaving}
        lastSavedAt={finalAnswer.lastSavedAt}
        error={finalAnswer.error}
        savedValue={finalAnswer.savedValue}
        disabled={isSubmitted}
      />

      <AssignmentSubmitDialog
        open={showSubmitDialog}
        onOpenChange={setShowSubmitDialog}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        finalAnswer={finalAnswer.value}
        onEditFinalAnswer={() => {
          setShowSubmitDialog(false);
          setFinalAnswerSheetOpen(true);
        }}
      />
    </div>
  );
}
