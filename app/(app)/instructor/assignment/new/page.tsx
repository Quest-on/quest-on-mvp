"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error-messages";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExamInfoForm } from "@/components/instructor/ExamInfoForm";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";
import { CaseQuestionGenerator } from "@/components/instructor/CaseQuestionGenerator";
import {
  ScrollProgressProvider,
  ScrollProgress,
} from "@/components/animate-ui/primitives/animate/scroll-progress";
import { isQuestionContentEmpty } from "@/lib/authoring-validation";

export default function CreateAssignment() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useAppUser();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdExamCode, setCreatedExamCode] = useState("");

  const [examData, setExamData] = useState({
    title: "",
    duration: 0,
    code: "",
    deadline: "",
    language: "ko" as "ko" | "en",
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const questionsListRef = useRef<HTMLDivElement>(null);
  const examInfoRef = useRef<HTMLDivElement>(null);
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; deadline?: string; questions?: string }>({});

  const generateExamCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setExamData((prev) => ({ ...prev, code: result }));
  };

  useEffect(() => {
    generateExamCode();
  }, []);

  const updateQuestion = (id: string, field: keyof Question, value: string | boolean | number | string[]) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };
  const addQuestion = () => {
    setQuestions((prev) => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2), text: "", type: "essay" as const }]);
  };
  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const n = [...prev]; const t = direction === "up" ? index - 1 : index + 1;
      if (t < 0 || t >= n.length) return prev;
      [n[index], n[t]] = [n[t], n[index]]; return n;
    });
  };

  const createAssignmentMutation = useMutation({
    mutationFn: async (dataForDB: Record<string, unknown>) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_assignment", data: dataForDB }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errorData, "과제 생성에 실패했습니다", response.status));
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
      queryClient.refetchQueries({ queryKey: ["drive-folder-contents"], type: "all" });
    },
  });

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const errors: { title?: string; deadline?: string; questions?: string } = {};
    if (!examData.title.trim()) errors.title = "과제 제목을 입력해주세요";
    if (!examData.deadline) errors.deadline = "제출 기한을 선택해주세요";
    if (questions.length === 0) {
      errors.questions = "최소 1개 이상의 문제를 추가해주세요";
    } else {
      const emptyIndices = questions.map((q, i) => (isQuestionContentEmpty(q.text) ? i + 1 : -1)).filter((i) => i !== -1);
      if (emptyIndices.length > 0) {
        errors.questions = emptyIndices.length === questions.length ? "문제 내용을 입력해주세요" : `${emptyIndices.join(", ")}번 문제가 비어있습니다`;
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

    setIsLoading(true);
    try {
      // date input gives "YYYY-MM-DD", auto-set to 23:59 KST
      const deadlineDate = new Date(examData.deadline + "T23:59:00+09:00");
      const deadlineISO = deadlineDate.toISOString();

      const dataForDB = {
        title: examData.title,
        code: examData.code,
        deadline: deadlineISO,
        close_at: deadlineISO,
        questions: questions,
        rubric: [],
        rubric_public: false,
        chat_weight: null,
        materials: [],
        materials_text: [],
        language: examData.language,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        type: "report",
      };

      await createAssignmentMutation.mutateAsync(dataForDB);
      setCreatedExamCode(examData.code);
      setIsDialogOpen(true);
    } catch {
      toast.error("과제 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isLoaded || !isSignedIn || !user) {
    return null;
  }

  return (
    <ScrollProgressProvider global transition={{ stiffness: 150, damping: 30, bounce: 0 }}>
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <div className="max-w-4xl mx-auto">
          <ScrollProgress className="h-1.5 bg-primary rounded-full" mode="width" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2 w-full justify-between">
              <h1 className="text-3xl font-bold">새로운 과제 만들기</h1>
              <Button type="button" variant="outline" onClick={() => router.push("/instructor")} className="min-h-[44px] gap-2 border-border hover:bg-muted hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
                대시보드
              </Button>
            </div>
            <p className="text-muted-foreground">AI 리서치 채팅 기반 과제를 구성하세요</p>
          </div>

          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }} className="space-y-6">
            <div ref={examInfoRef}>
              <ExamInfoForm
                title={examData.title}
                code={examData.code}
                duration={examData.duration}
                onTitleChange={(value) => { setExamData((prev) => ({ ...prev, title: value })); setFieldErrors((prev) => ({ ...prev, title: undefined })); }}
                onCodeChange={(value) => setExamData((prev) => ({ ...prev, code: value }))}
                onDurationChange={(value) => setExamData((prev) => ({ ...prev, duration: value }))}
                onGenerateCode={generateExamCode}
                mode="assignment"
                deadline={examData.deadline}
                onDeadlineChange={(value) => { setExamData((prev) => ({ ...prev, deadline: value })); setFieldErrors((prev) => ({ ...prev, deadline: undefined })); }}
                titleError={fieldErrors.title}
                deadlineError={fieldErrors.deadline}
                language={examData.language}
                onLanguageChange={(value) => setExamData((prev) => ({ ...prev, language: value }))}
              />
            </div>

            <CaseQuestionGenerator
              examTitle={examData.title}
              mode="assignment"
              language={examData.language}
              onQuestionsAccepted={(newQuestions) => {
                const newIds = newQuestions.map((q) => q.id);
                setQuestions((prev) => {
                  const nonEmpty = prev.filter((q) => q.text.replace(/<[^>]*>/g, "").trim() !== "");
                  return [...nonEmpty, ...newQuestions.map((q) => ({ id: q.id, text: q.text, type: q.type as "essay" | "short-answer" | "multiple-choice" }))];
                });
                setHighlightedQuestionIds(new Set(newIds));
                setTimeout(() => setHighlightedQuestionIds(new Set()), 3000);
                setTimeout(() => questionsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
            />

            <div ref={questionsListRef} className={fieldErrors.questions ? "rounded-lg ring-2 ring-red-500 ring-offset-2" : ""}>
              {fieldErrors.questions && (
                <p className="text-xs text-red-500 mb-2 px-1">{fieldErrors.questions}</p>
              )}
              <QuestionsList
                questions={questions}
                highlightedIds={highlightedQuestionIds}
                defaultOpen={false}
                mode="assignment"
                language={examData.language}
                onUpdate={(id, field, value) => { updateQuestion(id, field, value); setFieldErrors((prev) => ({ ...prev, questions: undefined })); }}
                onRemove={(id) => setQuestions((prev) => prev.filter((q) => q.id !== id))}
                onAdd={() => { addQuestion(); setFieldErrors((prev) => ({ ...prev, questions: undefined })); }}
                onMove={moveQuestion}
              />
            </div>

            <div className="space-y-2">
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.push("/instructor")}>취소</Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "생성 중..." : "과제 출제하기"}
                </Button>
              </div>
            </div>
          </form>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>과제 생성 완료</DialogTitle>
                <DialogDescription>과제가 성공적으로 생성되었습니다.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">과제 코드</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="px-4 py-2 bg-muted rounded-md exam-code text-lg font-semibold">{createdExamCode}</code>
                      <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdExamCode); toast.success("과제 코드가 복사되었습니다.", { id: "copy-code" }); }}>
                        복사
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">이 코드를 학생들에게 공유하세요.</p>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
                    <p>문제 {questions.length}개</p>
                    <p>제출 기한: {examData.deadline ? `${examData.deadline} 23:59까지` : "-"}</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  queryClient.refetchQueries({ queryKey: ["drive-folder-contents"], type: "all" });
                  setIsDialogOpen(false);
                  router.push("/instructor");
                }}>확인</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ScrollProgressProvider>
  );
}
