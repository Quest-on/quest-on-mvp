"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Shine } from "@/components/ui/shine";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import type {
  GeneratedQuestion,
  ChatMessage,
} from "@/hooks/useQuestionGeneration";
import { QuestionAdjustSheet } from "./QuestionAdjustSheet";

const BASE_PRESET_INSTRUCTIONS = [
  "난이도를 높여주세요. 더 복잡한 조건과 깊은 분석을 요구하도록 수정해주세요.",
  "난이도를 낮춰주세요. 조건을 단순화하고 질문을 더 명확하게 만들어주세요.",
  "시나리오를 더 상세하게 만들고 하위 질문을 추가해주세요.",
  "각 하위 질문에 4개의 선택지(보기)를 추가하여 객관식으로 변환해주세요.",
];

const ASSIGNMENT_PRESET_INSTRUCTIONS = [
  "리서치 범위와 비교 기준을 더 정교하게 만들어주세요.",
  "조사 대상과 요구 기준을 더 단순하고 명확하게 만들어주세요.",
  "학생이 조사해야 할 대상, 기간, 비교 기준을 더 구체적으로 제시해주세요.",
];

interface AdjustResult {
  questionText: string;
  explanation: string;
}

interface GeneratedQuestionCardProps {
  question: GeneratedQuestion;
  index: number;
  isRegenerating: boolean;
  isAdjusting: boolean;
  adjustHistory: ChatMessage[];
  onAccept?: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onAdjust: (instruction: string) => Promise<AdjustResult | null>;
  onApplyAdjustment: (newText: string) => void;
  isAnyAdjusting: boolean;
  generationMode?: "case" | "research-assignment";
}

export function GeneratedQuestionCard({
  question,
  index,
  isRegenerating,
  isAdjusting,
  adjustHistory,
  onRegenerate,
  onRemove,
  onAdjust,
  onApplyAdjustment,
  isAnyAdjusting,
  generationMode = "case",
}: GeneratedQuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);
  const [quickAdjustingPreset, setQuickAdjustingPreset] = useState<string | null>(null);
  const [isEnglish, setIsEnglish] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const t = useTranslations("authoring");
  const isAssignmentMode = generationMode === "research-assignment";
  const PREVIEW_HEIGHT = 300;

  const BASE_PRESETS = [
    { label: t("generatedQuestionCard.presetHarder"), instruction: BASE_PRESET_INSTRUCTIONS[0] },
    { label: t("generatedQuestionCard.presetEasier"), instruction: BASE_PRESET_INSTRUCTIONS[1] },
    { label: t("generatedQuestionCard.presetLonger"), instruction: BASE_PRESET_INSTRUCTIONS[2] },
    { label: t("generatedQuestionCard.presetAddOptions"), instruction: BASE_PRESET_INSTRUCTIONS[3] },
  ];

  const ASSIGNMENT_PRESETS = [
    { label: t("generatedQuestionCard.presetHarder"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[0] },
    { label: t("generatedQuestionCard.presetEasier"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[1] },
    { label: t("generatedQuestionCard.presetMoreSpecific"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[2] },
  ];

  const langPreset = isEnglish
    ? { label: t("generatedQuestionCard.presetToKorean"), instruction: isAssignmentMode ? "이 리서치 과제를 한국어로 번역해주세요." : "이 문제를 한국어로 번역해주세요. 시나리오와 질문 모두 한국어로 작성해주세요." }
    : { label: t("generatedQuestionCard.presetToEnglish"), instruction: isAssignmentMode ? "이 리서치 과제를 영어로 번역해주세요." : "이 문제를 영어로 번역해주세요. 시나리오와 질문 모두 영어로 작성해주세요." };

  const presets = isAssignmentMode
    ? [...ASSIGNMENT_PRESETS, langPreset]
    : [...BASE_PRESETS.slice(0, 3), langPreset, BASE_PRESETS[3]];

  useEffect(() => {
    if (contentRef.current) {
      setNeedsExpand(contentRef.current.scrollHeight > PREVIEW_HEIGHT);
    }
    setIsEnglish(false);
  }, [question.text]);

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-card relative">
        {/* Regeneration overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 bg-card/80 backdrop-blur-[2px] rounded-lg z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t("generatedQuestionCard.overlayRegenerating")}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">{t("generatedQuestionCard.headerPreview", { index: index + 1 })}</h4>
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{t("generatedQuestionCard.labelPreview")}</span>
          </div>
        </div>

        {/* Question content */}
        <div className="relative">
          <div
            ref={contentRef}
            className="overflow-hidden transition-all"
            style={{
              maxHeight: isExpanded || !needsExpand ? "none" : `${PREVIEW_HEIGHT}px`,
            }}
          >
            <RichTextViewer content={question.text} className="prose-sm" />
          </div>

          {/* Gradient overlay when collapsed */}
          {!isExpanded && needsExpand && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>

        {/* Expand/collapse toggle */}
        {needsExpand && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                {t("generatedQuestionCard.buttonCollapse")}
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                {t("generatedQuestionCard.buttonExpand")}
              </>
            )}
          </Button>
        )}


        {/* Quick-modify preset buttons */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={isAnyAdjusting || isRegenerating}
              className="rounded-full text-xs h-7 px-3"
              onClick={async () => {
                setQuickAdjustingPreset(preset.label);
                try {
                  const result = await onAdjust(preset.instruction);
                  if (result) {
                    onApplyAdjustment(result.questionText);
                    if (preset.label === t("generatedQuestionCard.presetToEnglish")) setIsEnglish(true);
                    if (preset.label === t("generatedQuestionCard.presetToKorean")) setIsEnglish(false);
                    toast.success(t("generatedQuestionCard.toastPresetApplied", { label: preset.label }));
                  }
                } catch {
                  toast.error(t("generatedQuestionCard.toastAdjustFailed"));
                } finally {
                  setQuickAdjustingPreset(null);
                }
              }}
            >
              {quickAdjustingPreset === preset.label && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              )}
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
          <Shine
            className="rounded-full"
            duration={1200}
            loop
            loopDelay={1400}
            opacity={0.24}
          >
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => setIsSheetOpen(true)}
              className="relative overflow-hidden gap-1.5 rounded-full"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t("generatedQuestionCard.buttonAIRefine")}
            </Button>
          </Shine>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="gap-1.5"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
            />
            {t("generatedQuestionCard.buttonRegenerate")}
          </Button>
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onRemove}
                  className="size-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("generatedQuestionCard.tooltipDelete")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Adjust Sheet */}
      <QuestionAdjustSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        questionText={question.text}
        history={adjustHistory}
        isAdjusting={isAdjusting}
        onSendInstruction={onAdjust}
        onApply={(update) => onApplyAdjustment(update.text)}
        generationMode={generationMode}
      />
    </>
  );
}
