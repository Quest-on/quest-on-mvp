"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Send, Loader2, Check, ChevronDown, ChevronUp, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";

// AI instructions kept in Korean (prompt text, not UI labels)
const PRESET_INSTRUCTIONS = [
  "난이도를 높여주세요. 더 복잡한 조건과 깊은 분석을 요구하도록 수정해주세요.",
  "난이도를 낮춰주세요. 조건을 단순화하고 질문을 더 명확하게 만들어주세요.",
  "질문을 더 구체적이고 명확하게 만들어주세요.",
  "시나리오를 더 상세하게 만들고 하위 질문을 추가해주세요.",
];

const ASSIGNMENT_PRESET_INSTRUCTIONS = [
  "리서치 범위와 비교 기준을 더 정교하게 만들어주세요.",
  "조사 대상과 요구 기준을 더 단순하고 명확하게 만들어주세요.",
  "학생이 조사해야 할 대상, 기간, 비교 기준을 더 구체적으로 제시해주세요.",
  "리서치 지시문을 더 자세하게 풀어 쓰되 정답이나 조사 결과는 포함하지 마세요.",
];

/** {@link QuestionAdjustSheet} 의 적용 콜백 페이로드. */
export interface QuestionAdjustApply {
  text: string;
  options?: string[];
  correctOptionIndex?: number;
}

interface QuestionAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionText: string;
  history: ChatMessage[];
  isAdjusting: boolean;
  onSendInstruction: (instruction: string) => Promise<unknown>;
  onApply: (update: QuestionAdjustApply) => void;
  generationMode?: "case" | "research-assignment";
  /** 현재 문제 유형 — 미리보기·플레이스홀더를 유형에 맞춘다. */
  questionType?: "multiple-choice" | "true-false" | "essay" | "short-answer";
  /** 현재 문제의 선택지 — 상단 미리보기에 노출한다. */
  questionOptions?: string[];
  /** 현재 문제의 정답 인덱스. */
  questionCorrectOptionIndex?: number;
}

/** 선택지 목록 미리보기 — 정답 칸을 강조해 보여준다. */
function OptionPreview({
  options,
  correctOptionIndex,
  answerLabel,
}: {
  options: string[];
  correctOptionIndex?: number;
  answerLabel: string;
}) {
  return (
    <ul className="mt-2 space-y-1">
      {options.map((option, idx) => {
        const isCorrect = correctOptionIndex === idx;
        return (
          <li
            key={idx}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
              isCorrect
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                isCorrect
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {isCorrect ? <Check className="size-3" /> : idx + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">{option}</span>
            {isCorrect && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {answerLabel}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionAdjustSheet({
  open,
  onOpenChange,
  questionText,
  history,
  isAdjusting,
  onSendInstruction,
  onApply,
  generationMode = "case",
  questionType,
  questionOptions,
  questionCorrectOptionIndex,
}: QuestionAdjustSheetProps) {
  const t = useTranslations("authoring");
  const [input, setInput] = useState("");
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const PRESETS = [
    { label: t("questionAdjustSheet.presetHarder"), instruction: PRESET_INSTRUCTIONS[0] },
    { label: t("questionAdjustSheet.presetEasier"), instruction: PRESET_INSTRUCTIONS[1] },
    { label: t("questionAdjustSheet.presetMoreSpecific"), instruction: PRESET_INSTRUCTIONS[2] },
    { label: t("questionAdjustSheet.presetLonger"), instruction: PRESET_INSTRUCTIONS[3] },
  ];

  const ASSIGNMENT_PRESETS = [
    { label: t("questionAdjustSheet.presetHarder"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[0] },
    { label: t("questionAdjustSheet.presetEasier"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[1] },
    { label: t("questionAdjustSheet.presetMoreSpecific"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[2] },
    { label: t("questionAdjustSheet.presetLonger"), instruction: ASSIGNMENT_PRESET_INSTRUCTIONS[3] },
  ];

  const presets = generationMode === "research-assignment" ? ASSIGNMENT_PRESETS : PRESETS;

  const isObjective =
    questionType === "multiple-choice" || questionType === "true-false";
  const sheetTitle =
    generationMode === "research-assignment"
      ? t("questionAdjustSheet.titleAssignment")
      : t("questionAdjustSheet.titleExam");
  const emptyHint = isObjective
    ? questionType === "true-false"
      ? t("questionAdjustSheet.emptyHintTrueFalse")
      : t("questionAdjustSheet.emptyHintMcq")
    : t("questionAdjustSheet.emptyHintEssay");
  const emptyExample = isObjective
    ? questionType === "true-false"
      ? t("questionAdjustSheet.emptyExampleTrueFalse")
      : t("questionAdjustSheet.emptyExampleMcq")
    : t("questionAdjustSheet.emptyExampleEssay");
  const inputPlaceholder = isObjective
    ? questionType === "true-false"
      ? t("questionAdjustSheet.placeholderTrueFalse")
      : t("questionAdjustSheet.placeholderMcq")
    : t("questionAdjustSheet.placeholderEssay");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // 최신 AI 답변은 폼에서 즉시 적용된다 — 마지막 답변을 "적용됨"으로 표시.
  useEffect(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant" && history[i].questionText) {
        setAppliedIdx(i);
        return;
      }
    }
  }, [history]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAppliedIdx(null);
      setIsPreviewExpanded(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!input.trim() || isAdjusting) return;

    const instruction = input.trim();
    setInput("");
    await onSendInstruction(instruction);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        {/* P0-2: Current question preview with expand/collapse toggle */}
        <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
          <button
            type="button"
            onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {t("questionAdjustSheet.labelCurrentQuestion")}
            {isPreviewExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          <div
            className={`overflow-y-auto text-sm mt-1 transition-all ${
              isPreviewExpanded ? "max-h-96" : "max-h-64"
            }`}
          >
            <RichTextViewer content={questionText} className="prose-sm" />
            {questionOptions && questionOptions.length > 0 && (
              <OptionPreview
                options={questionOptions}
                correctOptionIndex={questionCorrectOptionIndex}
                answerLabel={t("questionAdjustSheet.labelAnswer")}
              />
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyHint}
              <br />
              {emptyExample}
            </p>
          )}

          {history.map((msg, idx) => (
            <div
              key={`${msg.role}-${msg.content}-${msg.questionText ?? "no-question-text"}`}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                {/* P0-1: Show modified question preview in collapsible */}
                {msg.role === "assistant" && msg.questionText && (
                  <div className="mt-2 space-y-2">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          {t("questionAdjustSheet.labelPreviewModified")}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1.5 p-3 rounded-md bg-background/80 border text-sm max-h-64 overflow-y-auto">
                          <RichTextViewer
                            content={msg.questionText}
                            className="prose-sm"
                          />
                          {msg.options && msg.options.length > 0 && (
                            <OptionPreview
                              options={msg.options}
                              correctOptionIndex={msg.correctOptionIndex}
                              answerLabel={t("questionAdjustSheet.labelAnswer")}
                            />
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* 최신 답변은 자동 적용됨. 이전 버전이 좋으면 그 답변에서 다시 적용. */}
                    <Button
                      size="sm"
                      variant={appliedIdx === idx ? "secondary" : "outline"}
                      className={`gap-1.5 ${appliedIdx === idx ? "bg-success-solid hover:bg-success-solid text-white" : ""}`}
                      disabled={appliedIdx === idx}
                      onClick={() => {
                        onApply({
                          text: msg.questionText!,
                          options: msg.options,
                          correctOptionIndex: msg.correctOptionIndex,
                        });
                        setAppliedIdx(idx);
                        toast.success(t("questionAdjustSheet.toastVersionApplied"));
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {appliedIdx === idx ? t("questionAdjustSheet.buttonApplied") : t("questionAdjustSheet.buttonApplyThis")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isAdjusting && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Preset buttons */}
        <div className="px-6 py-2 border-t shrink-0 flex flex-wrap gap-1.5">
              {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={isAdjusting || loadingPreset !== null}
              className="rounded-full text-xs h-7 px-3"
              onClick={async () => {
                setLoadingPreset(preset.label);
                try {
                  const result = await onSendInstruction(preset.instruction) as { questionText?: string; explanation?: string } | null;
                  if (result && typeof result === "object" && "questionText" in result) {
                    toast.success(t("questionAdjustSheet.toastPresetApplied", { label: preset.label }));
                  }
                } catch {
                  toast.error(t("questionAdjustSheet.toastAdjustFailed"));
                } finally {
                  setLoadingPreset(null);
                }
              }}
            >
              {loadingPreset === preset.label && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              )}
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-4 border-t shrink-0 flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
            className="min-h-[44px] max-h-32 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isAdjusting}
            className="shrink-0 h-[44px] w-[44px]"
          >
            {isAdjusting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
