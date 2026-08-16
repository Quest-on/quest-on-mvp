"use client";

import { useState, useEffect, useRef, use } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error-messages";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { ExamInfoForm } from "@/components/instructor/ExamInfoForm";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";
import { CaseQuestionGenerator } from "@/components/instructor/CaseQuestionGenerator";
import { isoToKSTDateString } from "@/lib/date-utils";
import { isQuestionContentEmpty } from "@/lib/authoring-validation";
import { useTranslations } from "next-intl";

export default function EditAssignment({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const resolvedParams = use(params);
  const { assignmentId } = resolvedParams;

  const router = useRouter();
  const { user, isLoaded, isSignedIn, profile } = useAppUser();
  const queryClient = useQueryClient();
  const t = useTranslations("instructor");

  const [isLoadingExam, setIsLoadingExam] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const [examData, setExamData] = useState({
    title: "",
    code: "",
    deadline: "",
    language: "ko" as "ko" | "en",
  });
  // 과목은 선택 사항이다. null 이 기본값이며 저장을 막지 않는다.
  const [courseId, setCourseId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    deadline?: string;
    questions?: string;
  }>({});

  const isSubmittingRef = useRef(false);
  const initialCourseIdRef = useRef<string | null>(null);
  const questionsListRef = useRef<HTMLDivElement>(null);
  const examInfoRef = useRef<HTMLDivElement>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoaded && (!isSignedIn || (profile?.role as string) !== "instructor")) {
      router.push("/student");
    }
  }, [isLoaded, isSignedIn, profile, router]);

  // ── Load assignment ───────────────────────────────────────────────────────
  useEffect(() => {
    const fetchExam = async () => {
      if (!isLoaded || !user) return;
      try {
        setIsLoadingExam(true);
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_exam_by_id",
            data: { id: assignmentId },
          }),
        });
        if (!response.ok) throw new Error(t("editAssignment.toastLoadFail"));
        const result = await response.json();
        const exam = result.exam;

        if (exam.has_sessions) {
          setBlocked(true);
          return;
        }

        setExamData({
          title: exam.title ?? "",
          code: exam.code ?? "",
          deadline: isoToKSTDateString(exam.deadline ?? exam.close_at),
          language: exam.language === "en" ? "en" : "ko",
        });
        setQuestions(exam.questions ?? []);
        const loadedCourseId = exam.course_id ?? null;
        initialCourseIdRef.current = loadedCourseId;
        setCourseId(loadedCourseId);
      } catch {
        toast.error(t("editAssignment.toastLoadError"));
        router.push(`/instructor/assignment/${assignmentId}`);
      } finally {
        setIsLoadingExam(false);
      }
    };
    fetchExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, isLoaded, user?.id]);

  // ── beforeunload warning ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Question handlers ─────────────────────────────────────────────────────
  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: string | boolean | number | string[]
  ) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        text: "",
        type: "essay" as const,
      },
    ]);
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const n = [...prev];
      const t = direction === "up" ? index - 1 : index + 1;
      if (t < 0 || t >= n.length) return prev;
      [n[index], n[t]] = [n[t], n[index]];
      return n;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const errors: { title?: string; deadline?: string; questions?: string } = {};
    if (!examData.title.trim()) errors.title = t("editAssignment.fieldErrorTitle");
    if (!examData.deadline) errors.deadline = t("editAssignment.fieldErrorDeadline");
    if (questions.length === 0) {
      errors.questions = t("editAssignment.fieldErrorQuestionsMin");
    } else {
      const emptyIndices = questions
        .map((q, i) => (isQuestionContentEmpty(q.text) ? i + 1 : -1))
        .filter((i) => i !== -1);
      if (emptyIndices.length > 0) {
        errors.questions =
          emptyIndices.length === questions.length
            ? t("editAssignment.fieldErrorQuestionsContent")
            : t("editAssignment.fieldErrorQuestionsEmpty", { indices: emptyIndices.join(", ") });
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      isSubmittingRef.current = false;
      if (errors.title || errors.deadline) {
        examInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (errors.questions) {
        questionsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    setFieldErrors({});

    setIsSaving(true);
    try {
      const deadlineISO = new Date(examData.deadline + "T23:59:00+09:00").toISOString();
      const courseUpdate =
        courseId !== initialCourseIdRef.current ? { course_id: courseId } : {};

      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_assignment",
          data: {
            id: assignmentId,
            update: {
              title: examData.title,
              questions,
              language: examData.language,
              ...courseUpdate,
              deadline: deadlineISO,
              close_at: deadlineISO,
              updated_at: new Date().toISOString(),
            },
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errData, t("editAssignment.toastSaveFail"), response.status));
      }

      toast.success(t("editAssignment.toastSaved"));
      queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(assignmentId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
      router.push(`/instructor/assignment/${assignmentId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("editAssignment.toastSaveError"));
    } finally {
      setIsSaving(false);
      isSubmittingRef.current = false;
    }
  };

  // ── Auth render guard ─────────────────────────────────────────────────────
  if (!isLoaded || !isSignedIn || (profile?.role as string) !== "instructor") {
    return null;
  }

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (isLoadingExam) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-muted-foreground">{t("editAssignment.loadingText")}</span>
      </div>
    );
  }

  // ── Blocked screen ────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full border rounded-lg p-8 text-center space-y-4 bg-background shadow-sm">
          <h2 className="text-xl font-semibold">{t("editAssignment.blockedTitle")}</h2>
          <p className="text-muted-foreground">
            {t("editAssignment.blockedDesc")}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/instructor/assignment/${assignmentId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("editAssignment.blockedBack")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Edit form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            type="button"
            onClick={() => router.push(`/instructor/assignment/${assignmentId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("editAssignment.backToAssignment")}
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {examData.title ? `${examData.title}${t("editAssignment.titleSuffix")}` : t("editAssignment.titleDefault")}
          </h1>
        </div>
      </header>

      {/* Form body */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA")
              e.preventDefault();
          }}
          className="space-y-6"
        >
          <div ref={examInfoRef}>
            <ExamInfoForm
              title={examData.title}
              code={examData.code}
              duration={0}
              onTitleChange={(value) => {
                setExamData((prev) => ({ ...prev, title: value }));
                setFieldErrors((prev) => ({ ...prev, title: undefined }));
              }}
              onCodeChange={() => {}}
              onDurationChange={() => {}}
              onGenerateCode={() => {}}
              codeReadOnly={true}
              mode="assignment"
              deadline={examData.deadline}
              onDeadlineChange={(value) => {
                setExamData((prev) => ({ ...prev, deadline: value }));
                setFieldErrors((prev) => ({ ...prev, deadline: undefined }));
              }}
              titleError={fieldErrors.title}
              deadlineError={fieldErrors.deadline}
              language={examData.language}
              onLanguageChange={(value) =>
                setExamData((prev) => ({ ...prev, language: value }))
              }
              courseId={courseId}
              onCourseChange={setCourseId}
            />
          </div>

          <CaseQuestionGenerator
            examTitle={examData.title}
            mode="assignment"
            language={examData.language}
            onQuestionsAccepted={(newQuestions) => {
              const newIds = newQuestions.map((q) => q.id);
              setQuestions((prev) => {
                const nonEmpty = prev.filter(
                  (q) => !isQuestionContentEmpty(q.text)
                );
                return [
                  ...nonEmpty,
                  ...newQuestions.map((q) => ({
                    id: q.id,
                    text: q.text,
                    type: q.type as "essay" | "short-answer" | "multiple-choice",
                  })),
                ];
              });
              setHighlightedQuestionIds(new Set(newIds));
              setTimeout(() => setHighlightedQuestionIds(new Set()), 3000);
              setTimeout(
                () =>
                  questionsListRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                100
              );
            }}
          />

          <div
            ref={questionsListRef}
            className={fieldErrors.questions ? "rounded-lg ring-2 ring-red-500 ring-offset-2" : ""}
          >
            {fieldErrors.questions && (
              <p className="text-xs text-red-500 mb-2 px-1">{fieldErrors.questions}</p>
            )}
            <QuestionsList
              questions={questions}
              highlightedIds={highlightedQuestionIds}
              defaultOpen={false}
              mode="assignment"
              language={examData.language}
              onUpdate={(id, field, value) => {
                updateQuestion(id, field, value);
                setFieldErrors((prev) => ({ ...prev, questions: undefined }));
              }}
              onRemove={(id) => setQuestions((prev) => prev.filter((q) => q.id !== id))}
              onAdd={() => {
                addQuestion();
                setFieldErrors((prev) => ({ ...prev, questions: undefined }));
              }}
              onMove={moveQuestion}
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/instructor/assignment/${assignmentId}`)}
            >
              {t("editAssignment.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t("editAssignment.saving") : t("editAssignment.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
