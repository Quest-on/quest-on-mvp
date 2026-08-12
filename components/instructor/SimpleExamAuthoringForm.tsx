"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { Question } from "@/components/instructor/QuestionEditor";
import { QuestionEditor } from "@/components/instructor/QuestionEditor";
import { CourseSelectField } from "@/components/instructor/CourseSelectField";
import {
  buildDefaultScoreWeightsForQuestionTypes,
  scoreBucketForQuestionType,
  syncScoreWeightsForBuckets,
  validateScoreWeightsForQuestions,
  type ScoreWeightBucket,
  type ScoreWeights,
} from "@/lib/grade-utils";
import {
  QuestionAdjustSheet,
  type QuestionAdjustApply,
} from "@/components/instructor/QuestionAdjustSheet";
import type { ChatMessage, GeneratedQuestion } from "@/hooks/useQuestionGeneration";
import { useBulkQuestionGeneration } from "@/hooks/useBulkQuestionGeneration";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

type ExtractionStatus = "uploading" | "extracting" | "done" | "failed";

interface SimpleExamAuthoringFormProps {
  title: string;
  duration: number;
  language: "ko" | "en";
  titleRef?: Ref<HTMLInputElement>;
  onTitleChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onLanguageChange: (value: "ko" | "en") => void;
  /** 선택된 과목 id. null 이 기본값이고 "과목 없음"을 뜻한다 — 출제를 막지 않는다. */
  courseId?: string | null;
  /** 넘기지 않으면 과목 선택기를 렌더링하지 않는다(기존 호출부 무영향). */
  onCourseChange?: (courseId: string | null) => void;
  files: File[];
  disabledFiles: Set<number>;
  canAddMoreFiles: boolean;
  isDragOver: boolean;
  totalSize: number;
  extractionStatus?: Map<string, ExtractionStatus>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragAreaClick: () => void;
  onRemoveFile: (index: number) => void;
  getFileIcon: (fileName: string) => ReactNode;
  /**
   * AI 에이전트 실행 레이어가 쓰는 숨은 문제 생성기.
   * 다이얼로그에는 렌더링하지 않지만, 에이전트 ref 핸들이 살아 있도록
   * 폼 내부에 시각적으로 숨겨 마운트한다. (에이전트 미사용 시 생략 가능)
   */
  generator?: ReactNode;
  questions: Question[];
  highlightedIds?: Set<string>;
  onQuestionAdd: (type?: Question["type"], count?: number) => void;
  onQuestionUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean | number | string[],
  ) => void;
  onQuestionRemove: (id: string) => void;
  onQuestionMove: (index: number, direction: "up" | "down") => void;
  chatWeight: number | null;
  onChatWeightChange: (value: number | null) => void;
  scoreWeights: ScoreWeights | null;
  onScoreWeightsChange: (value: ScoreWeights | null) => void;
  submitReasons: string[];
  isSubmitting: boolean;
  onCancel: () => void;
  /** 업로드된 강의 자료 텍스트 목록 (AI 문제 생성 시 사용). */
  materialsText?: Array<{ url: string; text: string; fileName: string }>;
  /** AI 일괄 생성으로 만들어진 문제들을 목록에 append 하는 콜백. */
  onQuestionsAppend?: (questions: Question[]) => void;
  // ── 편집 모드 전용 (new/page에서는 사용 안 함) ──────────────────────────
  /** 있으면 제목 아래에 "시험 코드" 섹션을 렌더링한다. */
  examCode?: string;
  /** 코드 재생성 버튼 핸들러. examCode가 있을 때만 유효. */
  onCodeRegenerate?: () => void;
  /** 제출 버튼 텍스트. 기본값 "출제하기". 편집 시 "변경사항 저장" 등. */
  submitButtonText?: string;
  /** 이미 업로드된 기존 파일 목록 (편집 시 DB에서 로드한 URL 기반). */
  existingFiles?: Array<{ url: string; name: string; index: number }>;
  /** 기존 파일 삭제 핸들러. */
  onRemoveExistingFile?: (index: number) => void;
}

type StatusTextKey = "simpleExamAuthoringForm.statusUploading" | "simpleExamAuthoringForm.statusExtracting" | "simpleExamAuthoringForm.statusDone" | "simpleExamAuthoringForm.statusFailed" | "simpleExamAuthoringForm.statusWaiting";

function getStatusTextKey(status?: ExtractionStatus): StatusTextKey {
  switch (status) {
    case "uploading": return "simpleExamAuthoringForm.statusUploading";
    case "extracting": return "simpleExamAuthoringForm.statusExtracting";
    case "done": return "simpleExamAuthoringForm.statusDone";
    case "failed": return "simpleExamAuthoringForm.statusFailed";
    default: return "simpleExamAuthoringForm.statusWaiting";
  }
}

/**
 * "한 줄 한 박스" 필드 블록.
 * 라벨과 안내문은 입력 위에 평문으로 두고, 경계(테두리)는 실제 입력
 * 컨트롤에만 둔다 — 섹션 전체를 카드로 감싸지 않는다.
 */
function Field({
  label,
  htmlFor,
  required,
  optional,
  optionalLabel = "선택",
  helper,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  optionalLabel?: string;
  helper?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label
            htmlFor={htmlFor}
            className="flex items-center gap-1.5 text-base font-semibold"
          >
            {label}
            {required && (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            )}
            {optional && (
              <span className="text-xs font-normal text-muted-foreground">
                {optionalLabel}
              </span>
            )}
          </Label>
          {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** 문제 추가 다이얼로그에서 고르는 문제 유형. */
const QUESTION_TYPE_OPTION_KEYS: {
  type: Question["type"];
  labelKey: "simpleExamAuthoringForm.typeMcqLabel" | "simpleExamAuthoringForm.typeOxLabel" | "simpleExamAuthoringForm.typeEssayLabel";
  descKey: "simpleExamAuthoringForm.typeMcqDesc" | "simpleExamAuthoringForm.typeOxDesc" | "simpleExamAuthoringForm.typeEssayDesc";
}[] = [
  { type: "multiple-choice", labelKey: "simpleExamAuthoringForm.typeMcqLabel", descKey: "simpleExamAuthoringForm.typeMcqDesc" },
  { type: "true-false", labelKey: "simpleExamAuthoringForm.typeOxLabel", descKey: "simpleExamAuthoringForm.typeOxDesc" },
  { type: "essay", labelKey: "simpleExamAuthoringForm.typeEssayLabel", descKey: "simpleExamAuthoringForm.typeEssayDesc" },
];

const SCORE_BUCKET_LABEL_KEYS: Record<ScoreWeightBucket, "simpleExamAuthoringForm.scoreBucketMcq" | "simpleExamAuthoringForm.scoreBucketOx" | "simpleExamAuthoringForm.scoreBucketCase"> = {
  "multiple-choice": "simpleExamAuthoringForm.scoreBucketMcq",
  "true-false": "simpleExamAuthoringForm.scoreBucketOx",
  case: "simpleExamAuthoringForm.scoreBucketCase",
};

const SCORE_BUCKET_COLORS: Record<ScoreWeightBucket, string> = {
  "multiple-choice": "bg-primary",
  "true-false": "bg-primary/65",
  case: "bg-primary/35",
};

const QUICK_QUESTION_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
// 한 번에 추가/생성할 수 있는 최대 문항 수. AI 생성 라우트가 문항당 병렬
// OpenAI 호출을 발사하므로(비용·rate-limit 폭주 방지) 상한을 보수적으로 유지한다.
export const MAX_QUESTION_ADD_COUNT = 10;

function normalizeQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_QUESTION_ADD_COUNT, Math.floor(value)));
}

function getPresentScoreBuckets(questions: Question[]): ScoreWeightBucket[] {
  const buckets = new Set<ScoreWeightBucket>();
  questions.forEach((question) => {
    const bucket = scoreBucketForQuestionType(question.type);
    if (bucket) buckets.add(bucket);
  });
  return (["multiple-choice", "true-false", "case"] as const).filter((bucket) =>
    buckets.has(bucket)
  );
}

function buildDefaultScoreWeights(questions: Question[]): ScoreWeights | null {
  return buildDefaultScoreWeightsForQuestionTypes(
    questions.map((question) => question.type)
  );
}

function formatScoreValue(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * 문제 추가 다이얼로그의 유형 선택기.
 * 단일 선택이므로 radiogroup 으로 노출하고 좌우/상하 방향키 이동을 지원한다.
 */
function QuestionTypePicker({
  value,
  onChange,
  t,
}: {
  value: Question["type"];
  onChange: (type: Question["type"]) => void;
  t: ReturnType<typeof useTranslations<"authoring">>;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const currentIndex = QUESTION_TYPE_OPTION_KEYS.findIndex(
      (o) => o.type === value,
    );
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + delta + QUESTION_TYPE_OPTION_KEYS.length) %
      QUESTION_TYPE_OPTION_KEYS.length;
    const next = QUESTION_TYPE_OPTION_KEYS[nextIndex];
    onChange(next.type);
    document.getElementById(`question-type-${next.type}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("simpleExamAuthoringForm.ariaQuestionType")}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {QUESTION_TYPE_OPTION_KEYS.map((option) => {
        const isSelected = value === option.type;
        return (
          <button
            key={option.type}
            id={`question-type-${option.type}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.type)}
            onKeyDown={handleKeyDown}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-square ${
              isSelected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            <span className="text-base font-semibold">{t(option.labelKey)}</span>
            <span className="text-xs text-muted-foreground">
              {t(option.descKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SimpleExamAuthoringForm({
  title,
  duration,
  language,
  titleRef,
  onTitleChange,
  onDurationChange,
  onLanguageChange,
  courseId,
  onCourseChange,
  files,
  disabledFiles,
  canAddMoreFiles,
  isDragOver,
  totalSize,
  extractionStatus,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragAreaClick,
  onRemoveFile,
  getFileIcon,
  generator,
  questions,
  highlightedIds,
  onQuestionAdd,
  onQuestionUpdate,
  onQuestionRemove,
  onQuestionMove,
  chatWeight,
  onChatWeightChange,
  scoreWeights,
  onScoreWeightsChange,
  submitReasons,
  isSubmitting,
  onCancel,
  materialsText,
  onQuestionsAppend,
  examCode,
  onCodeRegenerate,
  submitButtonText,
  existingFiles,
  onRemoveExistingFile,
}: SimpleExamAuthoringFormProps) {
  const t = useTranslations("authoring");
  const [showAdvancedGrading, setShowAdvancedGrading] = useState(false);
  // "+" 문제 추가 — 문제 유형을 고르는 Dialog 의 열림 상태.
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  // 추가 다이얼로그에서 선택 중인 문제 유형.
  const [pickedType, setPickedType] =
    useState<Question["type"]>("multiple-choice");
  // 추가 다이얼로그에서 한 번에 추가할 문제 개수 (1~5).
  const [pickedCount, setPickedCount] = useState(1);
  // 추가 다이얼로그에서 입력하는 AI 생성 프롬프트.
  const [pickedPrompt, setPickedPrompt] = useState("");

  const {
    generateAll,
    isLoading: isBulkGenerating,
    allDone: bulkAllDone,
    reset: resetBulk,
    groupResults,
  } = useBulkQuestionGeneration();

  // GeneratedQuestion → Question 변환
  const toQuestion = useCallback((gq: GeneratedQuestion): Question => ({
    id: gq.id,
    text: gq.text,
    type: gq.type,
    options: gq.options,
    correctOptionIndex: gq.correctOptionIndex,
  }), []);

  // AI 생성 완료 감지 → 성공분 append + 에러 toast + Dialog 조건부 닫기
  useEffect(() => {
    if (!bulkAllDone) return;

    const results = Object.values(groupResults);
    const successQs = results.flatMap((r) =>
      r.status === "success" ? r.questions : [],
    );
    const errorTypes = results
      .filter((r) => r.status === "error")
      .map((r) => r.type);

    // 성공분 append
    if (successQs.length > 0) {
      onQuestionsAppend?.(successQs.map(toQuestion));
    }

    // 에러 알림
    if (errorTypes.length > 0) {
      toast.error(t("simpleExamAuthoringForm.toastGenerateFailed"));
    }

    // 전부 성공이면 Dialog 닫기 (에러가 있으면 열린 채로 프롬프트 유지)
    if (errorTypes.length === 0 && successQs.length > 0) {
      setIsAddPickerOpen(false);
      setPickedPrompt("");
    }

    // 상태 초기화
    resetBulk();
  }, [bulkAllDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // "추가" 버튼 핸들러
  const handleAdd = useCallback(async () => {
    const safePickedCount = normalizeQuestionCount(pickedCount);
    if (!pickedPrompt.trim()) {
      // 프롬프트 없음 → 빈 문제 추가
      onQuestionAdd(pickedType, safePickedCount);
      setIsAddPickerOpen(false);
      setPickedCount(1);
      return;
    }
    // 프롬프트 있음 → AI 생성
    if (!title?.trim()) {
      toast.error(t("simpleExamAuthoringForm.toastTitleRequired"));
      return;
    }
    const slots = [
      {
        tempId: crypto.randomUUID(),
        type: (pickedType === "multiple-choice"
          ? "mcq"
          : pickedType === "true-false"
            ? "true-false"
            : "case") as "mcq" | "true-false" | "case",
        prompt: pickedPrompt,
        count: safePickedCount,
      },
    ];
    await generateAll(slots, {
      examTitle: title,
      language,
      materialsText: materialsText && materialsText.length > 0 ? materialsText : undefined,
    });
  }, [pickedPrompt, pickedType, pickedCount, onQuestionAdd, generateAll, title, language, materialsText]);

  const isUnlimited = duration === 0;
  const effectiveWeight = chatWeight ?? 50;
  const isCustomWeight = chatWeight !== null;
  const presentScoreBuckets = useMemo(
    () => getPresentScoreBuckets(questions),
    [questions]
  );
  const scoreBucketCounts = useMemo(() => {
    const counts: Record<ScoreWeightBucket, number> = {
      "multiple-choice": 0,
      "true-false": 0,
      case: 0,
    };
    questions.forEach((question) => {
      const bucket = scoreBucketForQuestionType(question.type);
      if (bucket) counts[bucket] += 1;
    });
    return counts;
  }, [questions]);
  const scoreWeightErrors = useMemo(
    () =>
      validateScoreWeightsForQuestions(
        scoreWeights,
        questions.map((question) => question.type)
      ),
    [questions, scoreWeights]
  );

  useEffect(() => {
    const synced = syncScoreWeightsForBuckets(scoreWeights, presentScoreBuckets);
    if (JSON.stringify(synced) === JSON.stringify(scoreWeights)) return;

    onScoreWeightsChange(synced);
  }, [onScoreWeightsChange, presentScoreBuckets, scoreWeights]);

  const getScoreWeightValue = (bucket: ScoreWeightBucket) =>
    scoreWeights?.typeWeights[bucket] ?? 0;

  const getMaxScoreWeight = () => 100;

  const totalScoreWeight = presentScoreBuckets.reduce(
    (sum, bucket) => sum + getScoreWeightValue(bucket),
    0,
  );

  const getPerQuestionScore = (bucket: ScoreWeightBucket) => {
    const count = scoreBucketCounts[bucket];
    if (count === 0) return null;
    return getScoreWeightValue(bucket) / count;
  };

  const setScoreWeight = (bucket: ScoreWeightBucket, value: number) => {
    const current = scoreWeights ?? buildDefaultScoreWeights(questions);
    if (!current) return;
    const clamped = Math.max(1, Math.min(100, Number.isFinite(value) ? Math.round(value) : 1));
    onScoreWeightsChange({
      version: 1,
      distribution: "equal_by_type",
      typeWeights: {
        ...current.typeWeights,
        [bucket]: clamped,
      },
    });
  };

  const materialSummary = useMemo(() => {
    if (files.length === 0) return t("simpleExamAuthoringForm.materialSummaryNone");
    const statuses = Array.from(extractionStatus?.values() ?? []);
    const failed = statuses.filter((status) => status === "failed").length;
    const inProgress = statuses.filter(
      (status) => status === "uploading" || status === "extracting",
    ).length;
    if (failed > 0) return t("simpleExamAuthoringForm.materialSummaryFailed", { total: files.length, failed });
    if (inProgress > 0) return t("simpleExamAuthoringForm.materialSummaryAnalyzing", { total: files.length });
    return t("simpleExamAuthoringForm.materialSummaryReady", { total: files.length });
  }, [extractionStatus, files.length]);

  const [durationInput, setDurationInput] = useState<string>(
    duration === 0 ? "" : duration.toString(),
  );
  const parsedDurationInput =
    durationInput === "" ? null : Number.parseInt(durationInput, 10);
  const DURATION_REASON_EMPTY = t("simpleExamAuthoringForm.fieldDurationLabel") + ":empty";
  const DURATION_REASON_SHORT = t("simpleExamAuthoringForm.fieldDurationLabel") + ":short";
  const durationSubmitReason =
    !isUnlimited && durationInput === ""
      ? DURATION_REASON_EMPTY
      : !isUnlimited &&
          parsedDurationInput !== null &&
          parsedDurationInput < 15
        ? DURATION_REASON_SHORT
        : null;
  const visibleSubmitReasons = durationSubmitReason
    ? [
        ...submitReasons.filter((reason) => !reason.startsWith(t("simpleExamAuthoringForm.fieldDurationLabel"))),
        durationSubmitReason === DURATION_REASON_EMPTY ? t("examInfoForm.durationWarning") : t("simpleExamAuthoringForm.durationWarning"),
      ]
    : submitReasons;
  const formReady = visibleSubmitReasons.length === 0;
  const showDurationWarning =
    !isUnlimited &&
    parsedDurationInput !== null &&
    parsedDurationInput < 15;
  const durationBadgeLabel = isUnlimited
    ? t("simpleExamAuthoringForm.switchUnlimited")
    : durationInput === ""
      ? t("simpleExamAuthoringForm.fieldDurationLabel")
      : `${parsedDurationInput ?? duration}${t("simpleExamAuthoringForm.unitMinutes")}`;

  const handleDurationInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setDurationInput(value);

    if (value === "") {
      return;
    }

    const numValue = Number.parseInt(value, 10);
    if (Number.isNaN(numValue) || numValue < 0) {
      return;
    }

    if (numValue >= 1 && numValue <= 1440) {
      onDurationChange(numValue);
    } else if (numValue > 1440) {
      setDurationInput("1440");
      onDurationChange(1440);
    }
  };

  const handleDurationInputBlur = () => {
    if (durationInput === "") {
      setDurationInput(duration === 0 ? "" : duration.toString());
      return;
    }

    const numValue = Number.parseInt(
      durationInput.replace(/[^0-9]/g, ""),
      10,
    );

    if (Number.isNaN(numValue) || numValue < 1) {
      setDurationInput("1");
      onDurationChange(1);
    } else if (numValue > 1440) {
      setDurationInput("1440");
      onDurationChange(1440);
    } else {
      setDurationInput(numValue.toString());
      onDurationChange(numValue);
    }
  };

  useEffect(() => {
    const next = duration === 0 ? "" : duration.toString();
    setDurationInput((current) => (current === next ? current : next));
  }, [duration]);

  // 문제별 AI 다듬기 — 각 문제 카드의 "AI 다듬기" 버튼이 이 시트를 연다.
  const [sheetQuestionId, setSheetQuestionId] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustHistories, setAdjustHistories] = useState<
    Map<string, ChatMessage[]>
  >(new Map());

  const sheetQuestion =
    questions.find((q) => q.id === sheetQuestionId) ?? null;
  const sheetHistory = sheetQuestionId
    ? (adjustHistories.get(sheetQuestionId) ?? [])
    : [];

  const handleApplyAdjustment = useCallback(
    (update: QuestionAdjustApply) => {
      if (!sheetQuestionId) return;
      onQuestionUpdate(sheetQuestionId, "text", update.text);
      if (update.options) {
        onQuestionUpdate(sheetQuestionId, "options", update.options);
      }
      if (typeof update.correctOptionIndex === "number") {
        onQuestionUpdate(
          sheetQuestionId,
          "correctOptionIndex",
          update.correctOptionIndex,
        );
      }
    },
    [sheetQuestionId, onQuestionUpdate],
  );

  const handleAdjust = useCallback(
    async (instruction: string) => {
      if (!sheetQuestionId) return null;
      const question = questions.find((q) => q.id === sheetQuestionId);
      if (!question) return null;

      setIsAdjusting(true);
      setAdjustHistories((prev) => {
        const next = new Map(prev);
        next.set(sheetQuestionId, [
          ...(next.get(sheetQuestionId) ?? []),
          { role: "user", content: instruction },
        ]);
        return next;
      });

      try {
        // 라우트 enum 에는 short-answer 가 없으므로 essay 로 매핑한다.
        const questionType: "multiple-choice" | "true-false" | "essay" =
          question.type === "multiple-choice" ||
          question.type === "true-false"
            ? question.type
            : "essay";
        const res = await fetch("/api/ai/adjust-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: sheetQuestionId,
            questionText: question.text,
            instruction,
            language,
            questionType,
            ...(question.options && question.options.length > 0
              ? { currentOptions: question.options }
              : {}),
            ...(typeof question.correctOptionIndex === "number"
              ? { currentCorrectOptionIndex: question.correctOptionIndex }
              : {}),
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as {
          questionText: string;
          explanation: string;
          options?: string[];
          correctOptionIndex?: number;
        };
        setAdjustHistories((prev) => {
          const next = new Map(prev);
          next.set(sheetQuestionId, [
            ...(next.get(sheetQuestionId) ?? []),
            {
              role: "assistant",
              content: data.explanation,
              questionText: data.questionText,
              options: data.options,
              correctOptionIndex: data.correctOptionIndex,
            },
          ]);
          return next;
        });
        // 새 생성 결과는 적용하기 버튼 없이 즉시 문제에 반영한다.
        handleApplyAdjustment({
          text: data.questionText,
          options: data.options,
          correctOptionIndex: data.correctOptionIndex,
        });
        return data;
      } catch {
        toast.error(t("questionsList.toastAdjustFailed"));
        return null;
      } finally {
        setIsAdjusting(false);
      }
    },
    [sheetQuestionId, questions, language, handleApplyAdjustment],
  );

  return (
    <div className="space-y-8">
      <div className="space-y-10">
        {/* 시험 제목 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldTitleLabel")}
          htmlFor="simple-title"
          required
          helper={t("simpleExamAuthoringForm.fieldTitleHelper")}
        >
          <Input
            ref={titleRef}
            id="simple-title"
            aria-label={t("simpleExamAuthoringForm.fieldTitleAria")}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t("simpleExamAuthoringForm.fieldTitlePlaceholder")}
            className="h-12 text-base bg-white"
            required
          />
        </Field>

        {/* 과목 — 선택 사항. 제목 바로 아래에 둬야 "무엇을/어디에" 순서로 읽힌다. */}
        {onCourseChange && (
          <CourseSelectField
            value={courseId ?? null}
            onChange={onCourseChange}
            variant="section"
          />
        )}

        {/* 시험 코드 — 편집 모드에서만 표시 */}
        {examCode != null && (
          <Field
            label={t("simpleExamAuthoringForm.fieldCodeLabel")}
            required
            helper={t("simpleExamAuthoringForm.fieldCodeHelper")}
          >
            <div className="flex items-center gap-2">
              <Input
                value={examCode}
                readOnly
                className="h-11 w-40 font-mono text-base tracking-widest bg-white"
                aria-label={t("simpleExamAuthoringForm.fieldCodeAria")}
              />
              {onCodeRegenerate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCodeRegenerate}
                >
                  {t("simpleExamAuthoringForm.buttonRegenerate")}
                </Button>
              )}
            </div>
          </Field>
        )}

        {/* 시험 시간 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldDurationLabel")}
          htmlFor="simple-duration"
          helper={t("simpleExamAuthoringForm.fieldDurationHelper")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="simple-duration"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={isUnlimited ? "" : durationInput}
              disabled={isUnlimited}
              onChange={handleDurationInputChange}
              onBlur={handleDurationInputBlur}
              placeholder={isUnlimited ? t("simpleExamAuthoringForm.placeholderUnlimited") : t("simpleExamAuthoringForm.placeholderDuration")}
              className="h-11 w-28 text-center bg-white"
            />
            <span className="text-sm text-muted-foreground">{t("simpleExamAuthoringForm.unitMinutes")}</span>
            {[30, 60, 90, 120].map((value) => (
              <Button
                key={value}
                type="button"
                variant={
                  !isUnlimited && duration === value ? "default" : "outline"
                }
                size="sm"
                onClick={() => {
                  onDurationChange(value);
                  setDurationInput(value.toString());
                }}
                disabled={isUnlimited}
              >
                {value}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Switch
                id="simple-unlimited"
                checked={isUnlimited}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onDurationChange(0);
                    setDurationInput("");
                  } else {
                    onDurationChange(60);
                    setDurationInput("60");
                  }
                }}
              />
              <Label
                htmlFor="simple-unlimited"
                className="cursor-pointer text-sm"
              >
                {t("simpleExamAuthoringForm.switchUnlimited")}
              </Label>
            </div>
            {showDurationWarning && (
              <p className="flex basis-full items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {t("simpleExamAuthoringForm.durationWarning")}
              </p>
            )}
          </div>
        </Field>

        {/* 수업 자료 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldMaterialsLabel")}
          optional
          optionalLabel={t("simpleExamAuthoringForm.optional")}
          helper={t("simpleExamAuthoringForm.fieldMaterialsHelper")}
        >
          <div className="space-y-3">
            <Input
              id="materials"
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={onFileSelect}
              className="hidden"
              disabled={!canAddMoreFiles}
            />
            <button
              type="button"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={onDragAreaClick}
              disabled={!canAddMoreFiles}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : canAddMoreFiles
                    ? "border-border hover:border-muted-foreground hover:bg-muted/50"
                    : "cursor-not-allowed border-destructive/40 bg-destructive/5 text-muted-foreground"
              }`}
            >
              {isDragOver ? (
                <FolderOpen className="h-8 w-8" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {isDragOver
                  ? t("simpleExamAuthoringForm.dropHint")
                  : t("simpleExamAuthoringForm.uploadHint")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("simpleExamAuthoringForm.uploadSupportedFormats")}
              </span>
            </button>
            {/* 기존 파일 chips (편집 모드에서 DB에서 로드한 파일) */}
            {existingFiles && existingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {existingFiles.map(({ url, name, index }) => (
                  <span
                    key={url}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{name}</span>
                    {onRemoveExistingFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => onRemoveExistingFile(index)}
                        aria-label={t("simpleExamAuthoringForm.ariaDeleteExistingFile", { name })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {(files.length > 0 || !canAddMoreFiles) && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => {
                  const status = extractionStatus?.get(file.name);
                  const disabled = disabledFiles.has(index);
                  return (
                    <span
                      key={`${file.name}-${index}`}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
                        disabled || status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                          : status === "done"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "bg-muted/40"
                      }`}
                    >
                      {status === "uploading" || status === "extracting" ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        getFileIcon(file.name)
                      )}
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs opacity-75">
                        {t(getStatusTextKey(status))}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => onRemoveFile(index)}
                        aria-label={t("simpleExamAuthoringForm.ariaDeleteFile", { name: file.name })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  );
                })}
                <span className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted-foreground">
                  {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB
                </span>
              </div>
            )}
          </div>
        </Field>

        {/* AI 응답 언어 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldLanguageLabel")}
          helper={t("simpleExamAuthoringForm.fieldLanguageHelper")}
        >
          <Select
            value={language}
            onValueChange={(value) => onLanguageChange(value as "ko" | "en")}
          >
            <SelectTrigger className="h-11 w-44 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">{t("simpleExamAuthoringForm.languageKo")}</SelectItem>
              <SelectItem value="en">{t("simpleExamAuthoringForm.languageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* 문제 — "+" 버튼이 문제 추가 Dialog(유형/개수/AI 프롬프트)를 연다. */}
        <Field
          label={t("simpleExamAuthoringForm.fieldQuestionsLabel")}
          required
          helper={
            questions.length > 0
              ? t("simpleExamAuthoringForm.fieldQuestionsHelperHas", { count: questions.length })
              : t("simpleExamAuthoringForm.fieldQuestionsHelperEmpty")
          }
        >
          <div className="space-y-8" data-testid="manual-questions-section">
            {questions.map((question, index) => (
              <div
                key={question.id}
                id={`question-card-${question.id}`}
                className={`relative transition-all duration-500 ${
                  highlightedIds?.has(question.id)
                    ? "rounded-md ring-2 ring-primary ring-offset-2"
                    : ""
                }`}
              >
                {questions.length > 1 && (
                  <div className="absolute right-3 top-11 z-10 flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      disabled={index === 0}
                      onClick={() => onQuestionMove(index, "up")}
                      aria-label={t("simpleExamAuthoringForm.ariaUp")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      disabled={index === questions.length - 1}
                      onClick={() => onQuestionMove(index, "down")}
                      aria-label={t("simpleExamAuthoringForm.ariaDown")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <QuestionEditor
                  question={question}
                  index={index}
                  onUpdate={onQuestionUpdate}
                  onRemove={onQuestionRemove}
                  onAIEdit={() => setSheetQuestionId(question.id)}
                  mode="exam"
                  variant="line"
                />
              </div>
            ))}

            {/* "+" 문제 추가 트리거 — 파일 추가 영역과 동일 톤의 큰 점선 박스. 클릭 시 문제 추가 Dialog 를 연다. */}
            <button
              type="button"
              onClick={() => setIsAddPickerOpen(true)}
              aria-label={t("simpleExamAuthoringForm.fieldQuestionsLabel")}
              data-testid={
                questions.length === 0
                  ? "empty-add-question-btn"
                  : "add-question-btn"
              }
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-center transition-colors hover:border-muted-foreground hover:bg-muted/50"
            >
              <Plus className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {questions.length === 0 ? t("simpleExamAuthoringForm.buttonAddFirstQuestion") : t("simpleExamAuthoringForm.buttonAddQuestion")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("simpleExamAuthoringForm.addQuestionHint")}
              </span>
            </button>
          </div>
        </Field>

        {/* 최종 점수 비중 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldScoreWeightsLabel")}
          required
          helper={t("simpleExamAuthoringForm.fieldScoreWeightsHelper")}
        >
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {scoreWeights && presentScoreBuckets.length > 0
                  ? t("simpleExamAuthoringForm.scoreWeightsHintFree")
                  : t("simpleExamAuthoringForm.scoreWeightsHintEmpty")}
              </span>
              {scoreWeights && presentScoreBuckets.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onScoreWeightsChange(buildDefaultScoreWeights(questions))
                  }
                  className="ml-auto"
                >
                  {t("simpleExamAuthoringForm.buttonRedistribute")}
                </Button>
              )}
            </div>
            {scoreWeights && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted">
                    {presentScoreBuckets.map((bucket) => {
                      const weight = getScoreWeightValue(bucket);
                      return (
                        <div
                          key={bucket}
                          className={SCORE_BUCKET_COLORS[bucket]}
                          style={{
                            width: `${totalScoreWeight > 0 ? (weight / totalScoreWeight) * 100 : 0}%`,
                          }}
                          title={`${t(SCORE_BUCKET_LABEL_KEYS[bucket])} ${weight}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {presentScoreBuckets.map((bucket) => {
                      const weight = getScoreWeightValue(bucket);
                      return (
                        <span
                          key={bucket}
                          className="inline-flex items-center gap-1.5"
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${SCORE_BUCKET_COLORS[bucket]}`}
                          />
                          {t(SCORE_BUCKET_LABEL_KEYS[bucket])} {weight}%
                        </span>
                      );
                    })}
                  </div>
                </div>

                {presentScoreBuckets.length === 1 && (
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    {t("simpleExamAuthoringForm.scoreWeightsSingleType")}
                  </p>
                )}

                <div className="divide-y rounded-md border bg-background">
                  {presentScoreBuckets.map((bucket) => {
                    const weight = getScoreWeightValue(bucket);
                    const maxWeight = getMaxScoreWeight();
                    const perQuestionScore = getPerQuestionScore(bucket);
                    const isOnlyBucket = presentScoreBuckets.length === 1;
                    return (
                      <div
                        key={bucket}
                        className="grid gap-3 p-3 sm:grid-cols-[8rem_1fr_7rem] sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${SCORE_BUCKET_COLORS[bucket]}`}
                            />
                            <span className="text-sm font-medium">
                              {t(SCORE_BUCKET_LABEL_KEYS[bucket])}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {perQuestionScore !== null
                              ? t("simpleExamAuthoringForm.scoreWeightsPerQuestion", { count: scoreBucketCounts[bucket], score: formatScoreValue(perQuestionScore) })
                              : t("simpleExamAuthoringForm.scoreWeightsCount", { count: scoreBucketCounts[bucket] })}
                          </p>
                        </div>
                        <Slider
                          value={[weight]}
                          onValueChange={([value]) => setScoreWeight(bucket, value)}
                          min={1}
                          max={maxWeight}
                          step={1}
                          disabled={isOnlyBucket}
                          aria-label={t("simpleExamAuthoringForm.ariaSliderBucket", { bucket: t(SCORE_BUCKET_LABEL_KEYS[bucket]) })}
                        />
                        <div className="flex items-center gap-2 sm:justify-end">
                          <Input
                            type="number"
                            min={1}
                            max={maxWeight}
                            value={weight}
                            disabled={isOnlyBucket}
                            onChange={(e) =>
                              setScoreWeight(
                                bucket,
                                Number.parseInt(e.target.value, 10) || 1
                              )
                            }
                            className="h-9 w-20 bg-white text-center"
                            aria-label={t("simpleExamAuthoringForm.ariaInputBucket", { bucket: t(SCORE_BUCKET_LABEL_KEYS[bucket]) })}
                          />
                          <span className="text-sm text-muted-foreground">{t("simpleExamAuthoringForm.unitPercent")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {scoreWeightErrors.length > 0 && (
                  <div className="flex flex-wrap items-start justify-between gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <div className="space-y-1">
                      {scoreWeightErrors.map((error) => (
                        <p key={error} className="flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" />
                          {t("simpleExamAuthoringForm.scoreWeightsError", { error })}
                        </p>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onScoreWeightsChange(buildDefaultScoreWeights(questions))
                      }
                    >
                      {t("simpleExamAuthoringForm.buttonRestoreWeights")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Field>

        {/* 채점 비중 */}
        <Field
          label={t("simpleExamAuthoringForm.fieldChatWeightLabel")}
          optional
          optionalLabel={t("simpleExamAuthoringForm.optional")}
          helper={t("simpleExamAuthoringForm.fieldChatWeightHelper")}
        >
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {t("simpleExamAuthoringForm.chatWeightDisplay", { chat: effectiveWeight, final: 100 - effectiveWeight })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedGrading((prev) => !prev)}
                className="ml-auto"
              >
                {t("simpleExamAuthoringForm.buttonAdjust")}
              </Button>
            </div>
            {showAdvancedGrading && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="simple-custom-weight"
                    checked={isCustomWeight}
                    onCheckedChange={(checked) =>
                      onChatWeightChange(checked ? 50 : null)
                    }
                  />
                  <Label htmlFor="simple-custom-weight" className="text-sm">
                    {t("simpleExamAuthoringForm.switchCustomWeight")}
                  </Label>
                </div>
                {isCustomWeight && (
                  <Slider
                    value={[effectiveWeight]}
                    onValueChange={([value]) => onChatWeightChange(value)}
                    min={0}
                    max={100}
                    step={10}
                  />
                )}
              </div>
            )}
          </div>
        </Field>
      </div>

      <div className="sticky bottom-4 z-20 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant={formReady ? "default" : "outline"}>
                {formReady ? t("simpleExamAuthoringForm.badgeReady") : t("simpleExamAuthoringForm.badgeCheck")}
              </Badge>
              <Badge variant="outline">{durationBadgeLabel}</Badge>
              <Badge variant="outline">{t("simpleExamAuthoringForm.badgeQuestionCount", { count: questions.length })}</Badge>
              <Badge variant="outline">{materialSummary}</Badge>
            </div>
            {visibleSubmitReasons.length > 0 && (
              <div
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                data-testid="create-exam-submit-reasons"
              >
                {visibleSubmitReasons.map((reason) => (
                  <span key={reason}>• {reason}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("simpleExamAuthoringForm.buttonCancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !formReady}>
              {isSubmitting
                ? (submitButtonText ? t("simpleExamAuthoringForm.buttonSaving") : t("simpleExamAuthoringForm.buttonSubmitting"))
                : (submitButtonText ?? t("simpleExamAuthoringForm.buttonSubmit"))}
            </Button>
          </div>
        </div>
      </div>

      {/*
        AI 에이전트 실행 레이어가 쓰는 숨은 문제 생성기.
        다이얼로그 UI 에서는 AI 생성을 제거했지만, 에이전트 ref 핸들이
        살아 있도록 시각적으로 숨겨 마운트만 유지한다.
      */}
      <div className="sr-only" aria-hidden>
        {generator}
      </div>

      {/* 문제 추가 Dialog — 유형 선택 + 프롬프트 입력 */}
      <Dialog
        open={isAddPickerOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (isBulkGenerating) return; // 로딩 중 닫기 차단
            setPickedPrompt("");
            setPickedCount(1);
            resetBulk();
          }
          setIsAddPickerOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          data-testid="add-question-picker"
        >
          <DialogHeader>
            <DialogTitle>{t("simpleExamAuthoringForm.dialogAddTitle")}</DialogTitle>
            <DialogDescription>
              {t("simpleExamAuthoringForm.dialogAddDescription")}
            </DialogDescription>
          </DialogHeader>
          <QuestionTypePicker value={pickedType} onChange={setPickedType} t={t} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="add-question-count" className="text-sm">
                {t("simpleExamAuthoringForm.dialogCountLabel")}
              </Label>
              <Select
                value={pickedCount.toString()}
                onValueChange={(value) =>
                  setPickedCount(
                    normalizeQuestionCount(Number.parseInt(value, 10)),
                  )
                }
              >
                <SelectTrigger
                  id="add-question-count"
                  className="h-9 w-28"
                  data-testid="add-question-count"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_QUESTION_COUNTS.map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {t("caseQuestionGenerator.countItem", { n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 프롬프트 입력란 */}
          <div className="mt-1">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              {t("simpleExamAuthoringForm.dialogPromptLabel")}{" "}
              <span className="text-xs">{t("simpleExamAuthoringForm.dialogPromptOptional")}</span>
            </label>
            <Textarea
              value={pickedPrompt}
              onChange={(e) => setPickedPrompt(e.target.value)}
              placeholder={t("simpleExamAuthoringForm.dialogPromptPlaceholder")}
              rows={3}
              className="resize-none"
              disabled={isBulkGenerating}
            />
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button
              type="button"
              onClick={handleAdd}
              disabled={isBulkGenerating}
              data-testid="manual-add-question-btn"
            >
              {isBulkGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("simpleExamAuthoringForm.buttonGenerating")}
                </>
              ) : pickedPrompt.trim() ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("simpleExamAuthoringForm.buttonAIGenerate", { count: pickedCount })}
                </>
              ) : (
                t("simpleExamAuthoringForm.buttonAddManual")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {sheetQuestion && (
        <QuestionAdjustSheet
          open={sheetQuestionId !== null}
          onOpenChange={(open) => {
            if (!open) setSheetQuestionId(null);
          }}
          questionText={sheetQuestion.text}
          questionType={sheetQuestion.type}
          questionOptions={sheetQuestion.options}
          questionCorrectOptionIndex={sheetQuestion.correctOptionIndex}
          history={sheetHistory}
          isAdjusting={isAdjusting}
          onSendInstruction={handleAdjust}
          onApply={handleApplyAdjustment}
        />
      )}
    </div>
  );
}
