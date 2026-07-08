"use client";

import { useState, useEffect, useCallback, use, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import {
  ArrowLeft,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
} from "lucide-react";
import { SimpleExamAuthoringForm } from "@/components/instructor/SimpleExamAuthoringForm";
import { useTranslations } from "next-intl";
import type { Question } from "@/components/instructor/QuestionEditor";
import { useFileUpload } from "@/hooks/useFileUpload";
import {
  buildDefaultScoreWeightsForQuestionTypes,
  validateScoreWeightsForQuestions,
  type ScoreWeights,
} from "@/lib/grade-utils";
import {
  EXAM_DURATION_REASON,
  isExamDurationTooShort,
  isObjectiveQuestionIncomplete,
  isQuestionContentEmpty,
} from "@/lib/authoring-validation";

// ─── 페이지 ─────────────────────────────────────────────────────────────────

export default function EditExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user, isLoaded } = useAppUser();
  const t = useTranslations("instructor");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExam, setIsLoadingExam] = useState(true);
  const [examData, setExamData] = useState({
    title: "",
    duration: 60,
    code: "",
    materials: [] as File[],
    language: "ko" as "ko" | "en",
  });
  const [disabledFiles, setDisabledFiles] = useState<Set<number>>(new Set());
  const [canAddMoreFiles, setCanAddMoreFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chatWeight, setChatWeight] = useState<number | null>(null);
  const [scoreWeights, setScoreWeights] = useState<ScoreWeights | null>(null);
  const [hasSessions, setHasSessions] = useState(false);
  const fileUpload = useFileUpload();
  const isSubmittingRef = useRef(false);
  const initialScoreWeightsRef = useRef<ScoreWeights | null>(null);
  // 무제한 토글 OFF 시 이전 duration 복원
  const prevDurationRef = useRef<number>(60);

  // ── 기존 시험 데이터 로드 ──────────────────────────────────────────────────
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
            data: { id: resolvedParams.examId },
          }),
        });
        if (!response.ok) throw new Error(t("editExam.toastSaveFail"));
        const result = await response.json();
        const exam = result.exam;
        setExamData({
          title: exam.title || "",
          duration: exam.duration ?? 60,
          code: exam.code || "",
          materials: [],
          language: (exam.language === "en" ? "en" : "ko") as "ko" | "en",
        });
        setQuestions(exam.questions || []);
        const loadedWeight = exam.chat_weight ?? null;
        setChatWeight(loadedWeight);
        const loadedScoreWeights = exam.score_weights ?? null;
        initialScoreWeightsRef.current = loadedScoreWeights;
        setScoreWeights(loadedScoreWeights);
        setHasSessions(Boolean(exam.has_sessions));
        fileUpload.initExistingData(exam.materials || [], exam.materials_text);
      } catch {
        toast.error(t("editExam.toastLoadFail"));
        router.push(`/instructor/${resolvedParams.examId}`);
      } finally {
        setIsLoadingExam(false);
      }
    };
    fetchExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.examId, isLoaded, user?.id]);

  // ── 이탈 경고 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);


  // ── 파일 관련 ─────────────────────────────────────────────────────────────
  const calculateTotalSize = (files: File[]) =>
    files.reduce((total, file) => total + file.size, 0);

  const validateAndManageFileSize = (files: File[]) => {
    const MAX = 50 * 1024 * 1024;
    const total = calculateTotalSize(files);
    if (total <= MAX) {
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }
    setCanAddMoreFiles(false);
    toast.error(t("editExam.toastFileSizeExceeded"));
    const disabled = new Set<number>();
    let cur = 0;
    for (let i = files.length - 1; i >= 0; i--) {
      cur += files[i].size;
      if (cur > MAX) { disabled.add(i); cur -= files[i].size; }
    }
    setDisabledFiles(disabled);
    return false;
  };

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      "application/pdf", "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv", "application/csv", "application/x-hwp",
      "application/haansofthwp", "application/vnd.hancom.hwp",
      "application/vnd.hancom.hwpx", "image/jpeg", "image/png",
      "image/gif", "image/webp",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExt = ["pdf","ppt","pptx","doc","docx","xls","xlsx","csv","hwp","hwpx","jpg","jpeg","png","gif","webp"];
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext || "")) {
      toast.error(t("editExam.toastUnsupportedFormat"));
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("editExam.toastFileTooLarge"));
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAddMoreFiles) {
      toast.error(t("editExam.toastCannotAddMore"));
      e.target.value = "";
      return;
    }
    const files = Array.from(e.target.files || []).filter(validateFile);
    if (files.length === 0) { e.target.value = ""; return; }
    const newMaterials = [...examData.materials, ...files];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    files.forEach((f) => fileUpload.upload(f));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (canAddMoreFiles) setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (!canAddMoreFiles) {
      toast.error(t("editExam.toastCannotAddMore"));
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter(validateFile);
    if (files.length === 0) return;
    const newMaterials = [...examData.materials, ...files];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    files.forEach((f) => fileUpload.upload(f));
  };
  const handleDragAreaClick = () => {
    if (canAddMoreFiles) document.getElementById("materials")?.click();
  };
  const removeFile = (index: number) => {
    const removed = examData.materials[index];
    const newMaterials = examData.materials.filter((_, i) => i !== index);
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    if (removed) fileUpload.removeFile(removed.name);
  };
  const removeExistingFile = (index: number) => fileUpload.removeExistingUrl(index);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const cls = "w-4 h-4 shrink-0";
    switch (ext) {
      case "pdf": return <FileText className={`${cls} text-red-500`} />;
      case "ppt": case "pptx": return <Presentation className={`${cls} text-orange-500`} />;
      case "doc": case "docx": return <FileText className={`${cls} text-blue-500`} />;
      case "xls": case "xlsx": case "csv": return <FileSpreadsheet className={`${cls} text-green-500`} />;
      case "hwp": case "hwpx": return <ClipboardList className={`${cls} text-sky-500`} />;
      case "jpg": case "jpeg": case "png": case "gif": case "webp":
        return <FileImage className={`${cls} text-purple-500`} />;
      default: return <File className={`${cls} text-muted-foreground`} />;
    }
  };

  const getFileNameFromUrl = (url: string) => {
    try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || t("editExam.filenameFallback")); }
    catch { return t("editExam.filenameFallback"); }
  };

  // ── 문제 CRUD ──────────────────────────────────────────────────────────────
  const addQuestion = useCallback((type?: Question["type"], count?: number) => {
    const qType = type ?? "essay";
    const qCount = count ?? 1;
    const newQs: Question[] = Array.from({ length: qCount }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      text: "",
      type: qType,
      ...(qType === "multiple-choice"
        ? { options: ["", "", "", ""], correctOptionIndex: 0 }
        : qType === "true-false"
        ? { options: ["O", "X"] }
        : {}),
    }));
    setQuestions((prev) => [...prev, ...newQs]);
  }, []);

  const updateQuestion = useCallback(
    (id: string, field: keyof Question, value: string | boolean | number | string[]) => {
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
    },
    []
  );

  const moveQuestion = useCallback((index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleQuestionsAppend = useCallback((newQs: Question[]) => {
    setQuestions((prev) => [...prev, ...newQs]);
  }, []);

  // ── 저장 ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);
    try {
      const defaultScoreWeights = buildDefaultScoreWeightsForQuestionTypes(
        questions.map((question) => question.type)
      );
      const shouldOmitAutoDefaultScoreWeights =
        hasSessions &&
        initialScoreWeightsRef.current === null &&
        scoreWeights !== null &&
        JSON.stringify(scoreWeights) === JSON.stringify(defaultScoreWeights);

      const updateData: {
        title: string;
        code: string;
        duration: number;
        questions: Question[];
        chat_weight: number | null;
        score_weights?: ScoreWeights | null;
        materials: string[];
        materials_text: Array<{ url: string; text: string; fileName: string }>;
        language: "ko" | "en";
        updated_at: string;
      } = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions,
        chat_weight: chatWeight,
        materials: fileUpload.getUploadedUrls(),
        materials_text: fileUpload.getMaterialsText(),
        language: examData.language,
        updated_at: new Date().toISOString(),
      };
      if (!shouldOmitAutoDefaultScoreWeights) {
        updateData.score_weights = scoreWeights;
      }
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_exam",
          data: { id: resolvedParams.examId, update: updateData },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "시험 수정에 실패했습니다", response.status));
      }
      toast.success(t("editExam.toastSaved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("editExam.toastSaveError")), { duration: 5000 });
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [examData, questions, chatWeight, scoreWeights, hasSessions, fileUpload, resolvedParams.examId]);

  // ── 제출 사유 ─────────────────────────────────────────────────────────────
  const submitReasons = useMemo(() => {
    return [
      !examData.title ? t("editExam.submitReasonTitle") : null,
      questions.length === 0 ? t("editExam.submitReasonQuestions") : null,
      questions.length > 0 && questions.every((q) => isQuestionContentEmpty(q.text))
        ? t("editExam.submitReasonContent")
        : null,
      !canAddMoreFiles ? t("editExam.submitReasonFileSize") : null,
      isExamDurationTooShort(examData.duration) ? EXAM_DURATION_REASON : null,
      questions.some((q) => isObjectiveQuestionIncomplete(q))
        ? t("editExam.submitReasonObjective")
        : null,
      questions.length > 0 && !scoreWeights
        ? t("editExam.submitReasonScoreWeights")
        : null,
      ...validateScoreWeightsForQuestions(
        scoreWeights,
        questions.map((q) => q.type)
      ),
    ].filter(Boolean) as string[];
  }, [examData.title, examData.duration, questions, canAddMoreFiles, scoreWeights]);

  // ── 로딩 스피너 ───────────────────────────────────────────────────────────
  if (isLoadingExam) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-muted-foreground">{t("editExam.loadingText")}</span>
      </div>
    );
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Sticky 헤더 */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            type="button"
            onClick={() => router.push(`/instructor/${resolvedParams.examId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("editExam.backToDashboard")}
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {examData.title ? `${examData.title}${t("editExam.titleSuffix")}` : t("editExam.titleDefault")}
          </h1>
        </div>
      </header>

      {/* 폼 */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA")
              e.preventDefault();
          }}
        >
          <SimpleExamAuthoringForm
            // ── 기본 시험 정보 ──────────────────────────────────────────────
            title={examData.title}
            duration={examData.duration}
            language={examData.language}
            onTitleChange={(v) => setExamData((p) => ({ ...p, title: v }))}
            onDurationChange={(v) => {
              if (examData.duration !== 0) prevDurationRef.current = examData.duration;
              setExamData((p) => ({ ...p, duration: v === 0 ? 0 : v || prevDurationRef.current }));
            }}
            onLanguageChange={(v) => setExamData((p) => ({ ...p, language: v }))}
            // ── 파일 업로드 ─────────────────────────────────────────────────
            files={examData.materials}
            disabledFiles={disabledFiles}
            canAddMoreFiles={canAddMoreFiles}
            isDragOver={isDragOver}
            totalSize={calculateTotalSize(examData.materials)}
            extractionStatus={fileUpload.fileStatus}
            onFileSelect={handleFileSelect}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragAreaClick={handleDragAreaClick}
            onRemoveFile={removeFile}
            getFileIcon={getFileIcon}
            // ── 문제 관리 ───────────────────────────────────────────────────
            questions={questions}
            onQuestionAdd={addQuestion}
            onQuestionUpdate={updateQuestion}
            onQuestionRemove={(id) => setQuestions((prev) => prev.filter((q) => q.id !== id))}
            onQuestionMove={moveQuestion}
            // ── 채점 비중 ───────────────────────────────────────────────────
            chatWeight={chatWeight}
            onChatWeightChange={setChatWeight}
            scoreWeights={scoreWeights}
            onScoreWeightsChange={setScoreWeights}
            // ── 폼 제출 제어 ────────────────────────────────────────────────
            submitReasons={submitReasons}
            isSubmitting={isLoading}
            onCancel={() => router.push(`/instructor/${resolvedParams.examId}`)}
            // ── AI 문제 생성 지원 ───────────────────────────────────────────
            materialsText={fileUpload.getMaterialsText()}
            onQuestionsAppend={handleQuestionsAppend}
            // ── 편집 전용 ───────────────────────────────────────────────────
            submitButtonText={t("editExam.submitButtonText")}
            existingFiles={fileUpload.existingUrls.map((url, i) => ({
              url,
              name: getFileNameFromUrl(url),
              index: i,
            }))}
            onRemoveExistingFile={removeExistingFile}
          />
        </form>
      </div>
    </div>
  );
}
