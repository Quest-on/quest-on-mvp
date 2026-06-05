"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Info,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
} from "lucide-react";
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
import type { Question } from "@/components/instructor/QuestionEditor";
import {
  CaseQuestionGenerator,
  type CaseQuestionGeneratorHandle,
} from "@/components/instructor/CaseQuestionGenerator";
import { SimpleExamAuthoringForm } from "@/components/instructor/SimpleExamAuthoringForm";
import { useAgentRunController } from "@/components/agent/AgentRunController";
import { useAgentEditorExecutor } from "@/components/agent/useAgentEditorExecutor";
import { Bot, Hand } from "lucide-react";
import {
  ScrollProgressProvider,
  ScrollProgress,
} from "@/components/animate-ui/primitives/animate/scroll-progress";
import { useExamDraftAutoSave } from "@/hooks/useExamDraftAutoSave";
import { useFileUpload } from "@/hooks/useFileUpload";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";
import {
  buildDefaultScoreWeightsForQuestionTypes,
  validateScoreWeightsForQuestions,
  type ScoreWeights,
} from "@/lib/grade-utils";

function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

/** 객관식/OX 문제의 선택지·정답이 덜 채워졌는지 검사한다. */
function isObjectiveQuestionIncomplete(q: Question): boolean {
  if (q.type !== "multiple-choice" && q.type !== "true-false") return false;
  if (typeof q.correctOptionIndex !== "number") return true;
  if (q.type === "multiple-choice") {
    const opts = q.options ?? [];
    if (opts.length < 4) return true;
    return opts.slice(0, 4).some((o) => o.trim() === "");
  }
  return false;
}

export default function CreateExam() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useAppUser();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSignUpDialogOpen, setIsSignUpDialogOpen] = useState(false);
  const [createdExamCode, setCreatedExamCode] = useState("");

  // 데모 모드 체크: 로그인하지 않았거나 데모 페이지에서 온 경우
  const isDemoMode = !isLoaded || !isSignedIn || !user;
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
  // 파일 업로드 + 텍스트 추출 통합 hook
  const fileUpload = useFileUpload();

  // 문제 목록 참조 (스크롤용)
  const questionsListRef = useRef<HTMLDivElement>(null);

  // AI 에이전트 실행 레이어 연결용 ref
  const titleInputRef = useRef<HTMLInputElement>(null);
  const generatorHandleRef = useRef<CaseQuestionGeneratorHandle>(null);

  // P1-2: 새로 수락된 문제 하이라이트
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<Set<string>>(new Set());

  // P0-2: adjustHistory ref for localStorage persistence
  const adjustHistoryRef = useRef<Map<string, ChatMessage[]>>(new Map());

  // P0-1: localStorage 자동 저장
  const {
    showRestoreModal,
    savedDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useExamDraftAutoSave({
    title: examData.title,
    duration: examData.duration,
    code: examData.code,
    questions,
    chatWeight,
    scoreWeights,
    adjustHistoryRef,
  });

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (draft) {
      setExamData((prev) => ({
        ...prev,
        title: draft.title || prev.title,
        duration: draft.duration ?? prev.duration,
        code: draft.code || prev.code,
      }));
      if (draft.questions?.length > 0) {
        setQuestions(draft.questions);
      }
      setChatWeight(draft.chatWeight ?? null);
      setScoreWeights(draft.scoreWeights ?? null);
      // P0-2: Restore adjust history
      if (draft.adjustHistory) {
        adjustHistoryRef.current = new Map(Object.entries(draft.adjustHistory));
      }
    }
  }, [restoreDraft]);

  useEffect(() => {
    setScoreWeights((prev) => {
      if (questions.length === 0) return null;
      return (
        prev ??
        buildDefaultScoreWeightsForQuestionTypes(
          questions.map((question) => question.type)
        )
      );
    });
  }, [questions]);

  // 폼 변경 감지 (이탈 경고용)
  const hasFormData = useCallback(() => {
    return (
      examData.title.trim() !== "" ||
      examData.materials.length > 0 ||
      questions.some((q) => !isQuestionContentEmpty(q.text))
    );
  }, [examData.title, examData.materials.length, questions]);

  // 이탈 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasFormData()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasFormData]);

  const generateExamCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setExamData((prev) => ({ ...prev, code: result }));
  };

  // 파일 용량 계산 함수
  const calculateTotalSize = (files: File[]) => {
    return files.reduce((total, file) => total + file.size, 0);
  };

  // 파일 용량 검증 및 비활성화 처리
  const validateAndManageFileSize = (files: File[]) => {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const totalSize = calculateTotalSize(files);

    if (totalSize <= MAX_SIZE) {
      // 용량이 정상인 경우
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }

    // 용량 초과 시 처리
    setCanAddMoreFiles(false);
    toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다.");

    // 뒤에서부터 파일을 하나씩 비활성화하여 50MB 이하로 만들기
    const newDisabledFiles = new Set<number>();
    let currentSize = 0;

    for (let i = files.length - 1; i >= 0; i--) {
      currentSize += files[i].size;
      if (currentSize > MAX_SIZE) {
        newDisabledFiles.add(i);
        currentSize -= files[i].size; // 이 파일은 제외
      }
    }

    setDisabledFiles(newDisabledFiles);
    return false;
  };

  // 페이지 진입 시 자동으로 시험 코드 생성
  useEffect(() => {
    generateExamCode();
  }, []);

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/csv",
      "application/x-hwp",
      "application/haansofthwp",
      "application/vnd.hancom.hwp",
      "application/vnd.hancom.hwpx",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB (will be compressed)

    // 파일 확장자로도 체크 (MIME 타입이 없는 경우 대비)
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = [
      "pdf",
      "ppt",
      "pptx",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "csv",
      "hwp",
      "hwpx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
    ];

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(extension || "")
    ) {
      toast.error(
        "지원되지 않는 파일 형식입니다. PPT, PDF, 워드, 엑셀, 한글, 이미지 파일만 업로드 가능합니다."
      );
      return false;
    }

    if (file.size > maxSize) {
      toast.error("파일 크기가 50MB를 초과합니다.");
      return false;
    }

    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다.");
      e.target.value = "";
      return;
    }

    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(validateFile);

    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    const newMaterials = [...examData.materials, ...validFiles];

    // 용량 검증 및 관리
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 파일 업로드 + 텍스트 추출 (서버 경유, URL 재사용)
    validFiles.forEach((file) => {
      fileUpload.upload(file);
    });

    // Reset input
    e.target.value = "";
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canAddMoreFiles) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!canAddMoreFiles) {
      toast.error("파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다.");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(validateFile);

    if (validFiles.length === 0) {
      return;
    }

    const newMaterials = [...examData.materials, ...validFiles];

    // 용량 검증 및 관리
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 파일 업로드 + 텍스트 추출 (서버 경유, URL 재사용)
    validFiles.forEach((file) => {
      fileUpload.upload(file);
    });
  };

  const handleDragAreaClick = () => {
    if (canAddMoreFiles) {
      document.getElementById("materials")?.click();
    }
  };

  const removeFile = (index: number) => {
    const removedFile = examData.materials[index];
    const newMaterials = examData.materials.filter((_, i) => i !== index);

    // 파일 삭제 후 용량 재검증
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // hook에서도 업로드된 파일 정보 제거
    if (removedFile) {
      fileUpload.removeFile(removedFile.name);
    }
  };

  // 파일 업로드 + 텍스트 추출은 useFileUpload hook이 처리

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    const iconClass = "w-4 h-4 shrink-0";
    switch (extension) {
      case "pdf":
        return <FileText className={`${iconClass} text-red-500`} />;
      case "ppt":
      case "pptx":
        return <Presentation className={`${iconClass} text-orange-500`} />;
      case "doc":
      case "docx":
        return <FileText className={`${iconClass} text-blue-500`} />;
      case "xls":
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className={`${iconClass} text-green-500`} />;
      case "hwp":
      case "hwpx":
        return <ClipboardList className={`${iconClass} text-sky-500`} />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
        return <FileImage className={`${iconClass} text-purple-500`} />;
      default:
        return <File className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: string | boolean | number | string[]
  ) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const createEmptyQuestion = (type: Question["type"]): Question => ({
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    text: "",
    type,
    // 객관식/OX 는 편집기에서 채울 선택지 골격을 미리 잡아둔다.
    ...(type === "multiple-choice"
      ? { options: ["", "", "", ""] }
      : type === "true-false"
        ? { options: ["O", "X"] }
        : {}),
  });

  const addQuestion = (type: Question["type"] = "essay", count: number = 1) => {
    const safeCount = Math.max(1, Math.min(5, Math.floor(count)));
    setQuestions((prev) => [
      ...prev,
      ...Array.from({ length: safeCount }, () => createEmptyQuestion(type)),
    ]);
  };

  const removeQuestionById = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newQuestions.length) return prev;
      [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
      return newQuestions;
    });
  };

  // AI 일괄 생성 콜백 — memoize하여 불필요한 리렌더 방지
  const handleQuestionsAppend = useCallback((newQuestions: Question[]) => {
    const newIds = newQuestions.map((q) => q.id);
    setQuestions((prev) => [...prev, ...newQuestions]);
    setHighlightedQuestionIds(new Set(newIds));
    setTimeout(() => setHighlightedQuestionIds(new Set()), 3000);
    setTimeout(() => {
      const target = newIds[0]
        ? document.getElementById(`question-card-${newIds[0]}`)
        : null;
      (target ?? questionsListRef.current)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  }, []); // setQuestions, setHighlightedQuestionIds는 stable setState reference

  // ── AI 에이전트 클라이언트 실행 레이어 연결 ──────────────────────
  // 컨트롤러에 활성 런이 있고 running 단계이면 "에이전트 작성 중" 모드.
  // URL 파라미터가 아니라 컨트롤러 상태로 판별한다. 일반 사용에는 무영향.
  const agentController = useAgentRunController();
  const isAgentMode =
    agentController.activeRun != null &&
    agentController.phase === "running";

  const submitReasons = [
    !examData.title ? "시험 제목을 입력해주세요" : null,
    !examData.code ? "시험 코드를 생성해주세요" : null,
    questions.length === 0 ? "문제를 1개 이상 추가해주세요" : null,
    questions.length > 0 &&
    questions.every((q) => isQuestionContentEmpty(q.text))
      ? "문제 내용을 입력해주세요"
      : null,
    !canAddMoreFiles ? "파일 용량이 50MB를 초과했습니다" : null,
    examData.duration !== 0 && examData.duration < 15
      ? "시험 시간은 15분 이상이거나 무제한이어야 합니다"
      : null,
    questions.some((q) => isObjectiveQuestionIncomplete(q))
      ? "객관식 문제의 선택지와 정답을 입력해주세요"
      : null,
    questions.length > 0 && !scoreWeights
      ? "최종 점수 비중을 설정해주세요"
      : null,
    ...validateScoreWeightsForQuestions(
      scoreWeights,
      questions.map((q) => q.type)
    ),
  ].filter((reason): reason is string => Boolean(reason));

  const agentExecutor = useAgentEditorExecutor({
    examTitle: examData.title,
    setExamTitle: (value) =>
      setExamData((prev) => ({ ...prev, title: value })),
    titleElementRef: titleInputRef,
    questions,
    addQuestion,
    removeQuestionById,
    updateQuestion,
    generatorRef: generatorHandleRef,
    route: "/instructor/new",
  });

  // 편집기 executor 를 컨트롤러에 등록 — 마운트 동안 유지, 언마운트 시 해제.
  // 컨트롤러는 레이아웃에 마운트되어 페이지 이동에도 살아 있으므로,
  // navigate 후 새 편집기가 마운트되며 여기서 재등록되어 핸드오프가 이어진다.
  const registerExecutor = agentController.registerExecutor;
  useEffect(() => {
    registerExecutor(agentExecutor);
    return () => registerExecutor(null);
  }, [registerExecutor, agentExecutor]);

  const createExamMutation = useMutation({
    mutationFn: async (examDataForDB: {
      title: string;
      code: string;
      duration: number;
      questions: Question[];
      chat_weight: number | null;
      score_weights: ScoreWeights | null;
      materials: string[];
      status: string;
      created_at: string;
      updated_at: string;
    }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_exam",
          data: examDataForDB,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "시험 생성에 실패했습니다",
          response.status
        );
        throw new Error(errorMessage);
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

    // 데모 모드에서는 실제 제출을 막고 회원가입 유도
    if (isDemoMode) {
      isSubmittingRef.current = false;
      setIsSignUpDialogOpen(true);
      return;
    }

    // 비활성화된 버튼 클릭 시 이유 안내
    if (!examData.title) {
      isSubmittingRef.current = false;
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      isSubmittingRef.current = false;
      toast.error("시험 코드를 생성해주세요.");
      return;
    }
    // 모든 문제에 대해 빈 텍스트 검증
    const emptyQuestionIndices = questions
      .map((q, i) => (isQuestionContentEmpty(q.text) ? i + 1 : -1))
      .filter((i) => i !== -1);
    if (emptyQuestionIndices.length > 0) {
      isSubmittingRef.current = false;
      toast.error(
        emptyQuestionIndices.length === questions.length
          ? "문제를 입력해주세요."
          : `${emptyQuestionIndices.join(", ")}번 문제가 비어있습니다.`
      );
      return;
    }
    // 객관식/OX 문제: 선택지·정답 미입력 검증
    const incompleteObjectiveIndices = questions
      .map((q, i) => (isObjectiveQuestionIncomplete(q) ? i + 1 : -1))
      .filter((i) => i !== -1);
    if (incompleteObjectiveIndices.length > 0) {
      isSubmittingRef.current = false;
      toast.error(
        `${incompleteObjectiveIndices.join(", ")}번 객관식 문제의 선택지와 정답을 입력해주세요.`
      );
      return;
    }
    if (!canAddMoreFiles) {
      isSubmittingRef.current = false;
      toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요.");
      return;
    }
    // duration 검증: 0(무제한)이 아니고 15 미만이면 에러
    if (examData.duration !== 0 && examData.duration < 15) {
      isSubmittingRef.current = false;
      toast.error("시험 시간은 최소 15분 이상이거나 무제한이어야 합니다.");
      return;
    }

    if (!examData.title) {
      isSubmittingRef.current = false;
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      isSubmittingRef.current = false;
      toast.error("시험 코드를 입력해주세요.");
      return;
    }
    if (questions.length === 0) {
      isSubmittingRef.current = false;
      toast.error("최소 1개 이상의 문제를 추가해주세요.");
      return;
    }
    if (!scoreWeights) {
      isSubmittingRef.current = false;
      toast.error("최종 점수 비중을 설정해주세요.");
      return;
    }
    const scoreWeightErrors = validateScoreWeightsForQuestions(
      scoreWeights,
      questions.map((q) => q.type)
    );
    if (scoreWeightErrors.length > 0) {
      isSubmittingRef.current = false;
      toast.error(scoreWeightErrors[0]);
      return;
    }

    setIsLoading(true);

    try {
      // 파일은 이미 선택 시점에 업로드 완료됨 → URL 재사용
      const materialUrls = fileUpload.getUploadedUrls();
      const materialsText = fileUpload.getMaterialsText();

      // Prepare exam data for database
      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        // duration: 0은 무제한(과제형), > 0은 시험형 (분 단위)
        // 명시적으로 0을 전송하여 fallback 로직이 작동하지 않도록 함
        duration: examData.duration,
        questions: questions,
        chat_weight: chatWeight, // 채점 가중치 (null = 기본값 50)
        score_weights: scoreWeights,
        materials: materialUrls, // Array of file URLs
        materials_text: materialsText, // 추출된 텍스트 배열
        language: examData.language, // AI 시스템 프롬프트 언어 (ko | en)
        status: "draft", // Start as draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to Supabase using useMutation
      await createExamMutation.mutateAsync(examDataForDB);

      // P0-1: Clear draft on successful submit
      clearDraft();
      // Show dialog with exam code instead of redirecting
      setCreatedExamCode(examData.code);
      setIsDialogOpen(true);
    } catch {
      toast.error("시험 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-muted/40">
    <ScrollProgressProvider
      global
      transition={{ stiffness: 150, damping: 30, bounce: 0 }}
    >
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <div className="max-w-4xl mx-auto">
          <ScrollProgress
            className="h-1.5 bg-primary rounded-full"
            mode="width"
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2 w-full justify-between">
              <h1 className="text-3xl font-bold">새로운 시험 만들기</h1>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // 데모 모드에서는 랜딩 페이지로, 일반 모드에서는 인스터럭터 대시보드로
                  if (isDemoMode) {
                    router.push("/");
                  } else {
                    router.push("/instructor");
                  }
                }}
                className="min-h-[44px] gap-2 border-border hover:bg-muted hover:text-foreground"
                aria-label="대시보드로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" />
                {isDemoMode ? "데모로 돌아가기" : "대시보드"}
              </Button>
            </div>
            <p className="text-muted-foreground">
              문제와 설정으로 새로운 시험을 구성하세요
            </p>
          </div>

          {/* AI 에이전트 작성 중 배너 — 중단(take-over) 컨트롤 포함 */}
          {isAgentMode && (
            <div
              className="mb-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
              data-testid="agent-writing-banner"
            >
              <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">
                  AI 에이전트가 시험을 작성하고 있습니다
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  에이전트가 제목과 문제를 직접 입력합니다. 직접 이어서
                  작성하려면 작업을 넘겨받으세요.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => agentController.cancelRun()}
                className="shrink-0 gap-1.5"
                aria-label="에이전트 작업 넘겨받기"
              >
                <Hand className="w-4 h-4" />
                넘겨받기
              </Button>
            </div>
          )}

          {/* 데모 모드 배너 (P0-1) */}
          {isDemoMode && isLoaded && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  데모 모드로 체험 중입니다
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                  AI 문제 생성을 자유롭게 체험할 수 있지만, 실제 시험 출제를 위해서는{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/sign-up")}
                    className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    회원가입
                  </button>
                  이 필요합니다.
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              // textarea에서는 엔터 허용, 다른 입력 요소에서는 form submit 방지
              if (
                e.key === "Enter" &&
                (e.target as HTMLElement).tagName !== "TEXTAREA"
              ) {
                e.preventDefault();
              }
            }}
            className="space-y-6"
          >
            <div ref={questionsListRef}>
              <SimpleExamAuthoringForm
                titleRef={titleInputRef}
                title={examData.title}
                duration={examData.duration}
                language={examData.language}
                onTitleChange={(value) =>
                  setExamData((prev) => ({ ...prev, title: value }))
                }
                onDurationChange={(value) =>
                  setExamData((prev) => ({ ...prev, duration: value }))
                }
                onLanguageChange={(value) =>
                  setExamData((prev) => ({ ...prev, language: value }))
                }
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
                generator={
                  <CaseQuestionGenerator
                    agentHandleRef={generatorHandleRef}
                    examTitle={examData.title}
                    extractedTexts={fileUpload.extractedTexts}
                    extractionStatus={fileUpload.fileStatus}
                    language={examData.language}
                    variant="line"
                    onQuestionsAccepted={(newQuestions) => {
                      const newIds = newQuestions.map((q) => q.id);
                      setQuestions((prev) => {
                        const nonEmpty = prev.filter((q) => {
                          const stripped = q.text
                            .replace(/<[^>]*>/g, "")
                            .trim();
                          return stripped !== "";
                        });
                        return [
                          ...nonEmpty,
                          ...newQuestions.map((q) => ({
                            id: q.id,
                            text: q.text,
                            type: q.type,
                            options: q.options,
                            correctOptionIndex: q.correctOptionIndex,
                          })),
                        ];
                      });
                      setHighlightedQuestionIds(new Set(newIds));
                      setTimeout(
                        () => setHighlightedQuestionIds(new Set()),
                        3000,
                      );
                      setTimeout(() => {
                        const target = newIds[0]
                          ? document.getElementById(
                              `question-card-${newIds[0]}`,
                            )
                          : null;
                        (target ?? questionsListRef.current)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }, 100);
                    }}
                  />
                }
                questions={questions}
                highlightedIds={highlightedQuestionIds}
                onQuestionAdd={addQuestion}
                onQuestionUpdate={updateQuestion}
                onQuestionRemove={(id) => {
                  setQuestions((prev) => prev.filter((q) => q.id !== id));
                }}
                onQuestionMove={moveQuestion}
                chatWeight={chatWeight}
                onChatWeightChange={setChatWeight}
                scoreWeights={scoreWeights}
                onScoreWeightsChange={setScoreWeights}
                submitReasons={submitReasons}
                isSubmitting={isLoading}
                onCancel={() => {
                  if (isDemoMode) {
                    router.push("/");
                  } else {
                    router.push("/instructor");
                  }
                }}
                materialsText={fileUpload.getMaterialsText()}
                onQuestionsAppend={handleQuestionsAppend}
              />
            </div>
          </form>

          {/* 출제 완료 Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
                  <DialogHeader>
                    <DialogTitle>출제 완료</DialogTitle>
                    <DialogDescription>
                      시험이 성공적으로 출제되었습니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">시험 코드</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="px-4 py-2 bg-muted rounded-md exam-code text-lg font-semibold">
                            {createdExamCode}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(createdExamCode);
                              toast.success("시험 코드가 복사되었습니다.", {
                                id: "copy-exam-code",
                              });
                            }}
                          >
                            복사
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          이 코드를 학생들에게 공유하세요.
                        </p>
                      </div>
                      {/* P2-5: Summary */}
                      <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
                        <p>문제 {questions.length}개{examData.materials.length > 0 && ` · 자료 ${examData.materials.length}개`}</p>
                        <p>시험 시간: {examData.duration === 0 ? "무제한 (과제형)" : `${examData.duration}분`}</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        queryClient.refetchQueries({ queryKey: ["drive-folder-contents"], type: "all" });
                        setIsDialogOpen(false);
                        router.push("/instructor");
                      }}
                    >
                      확인
                    </Button>
                  </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 회원가입 유도 Dialog (데모 모드) */}
          <Dialog
            open={isSignUpDialogOpen}
            onOpenChange={setIsSignUpDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>회원가입이 필요합니다</DialogTitle>
                <DialogDescription>
                  시험을 출제하려면 회원가입이 필요합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  데모 모드에서는 실제로 시험을 출제할 수 없습니다. 회원가입을
                  하시면 전체 기능을 이용하실 수 있습니다.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSignUpDialogOpen(false)}
                >
                  닫기
                </Button>
                <Button onClick={() => router.push("/sign-up")}>
                  회원가입하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* P0-1: 드래프트 복원 확인 Dialog */}
          <Dialog open={showRestoreModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이전 작업 복원</DialogTitle>
                <DialogDescription>
                  저장되지 않은 이전 작업이 있습니다. 복원하시겠습니까?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                {savedDraft && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    {savedDraft.title && <p>제목: {savedDraft.title}</p>}
                    {savedDraft.questions?.length > 0 && (
                      <p>문제 {savedDraft.questions.length}개</p>
                    )}
                    <p className="text-xs">
                      저장 시각: {new Date(savedDraft.savedAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={discardDraft}>
                  새로 시작
                </Button>
                <Button onClick={handleRestoreDraft}>
                  복원하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ScrollProgressProvider>
    </div>
  );
}
