"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { ChevronsDown } from "lucide-react";

interface Question {
  id: string;
  text: string;
  type: string;
  points?: number;
  options?: string[];
  correctOptionIndex?: number;
  title?: string;
  ai_context?: string;
}

/** 문제 유형 → i18n 키. 비-exhaustive 분기 방지용 단일 소스. */
export function questionTypeKey(type: string): string {
  switch (type) {
    case "essay":
      return "questionPanel.typeEssay";
    case "short-answer":
      return "questionPanel.typeShortAnswer";
    case "multiple-choice":
      return "questionPanel.typeMultipleChoice";
    case "true-false":
      return "questionPanel.typeTrueFalse";
    default:
      return "questionPanel.typeDefault";
  }
}

/** 하위 호환용 래퍼 — 훅 외부에서 정적 라벨이 필요한 경우만 사용. */
export function questionTypeLabel(type: string): string {
  switch (type) {
    case "essay":
      return "서술형 문제";
    case "short-answer":
      return "단답형 문제";
    case "multiple-choice":
      return "객관식 문제";
    case "true-false":
      return "O/X 문제";
    default:
      return "문제";
  }
}

interface QuestionPanelProps {
  question: Question;
  questionNumber: number;
}

export function QuestionPanel({
  question,
  questionNumber,
}: QuestionPanelProps) {
  const t = useTranslations("exam");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  return (
    <div className="relative h-full flex flex-col border-b border-border bg-muted/20">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto hide-scrollbar animate-in slide-in-from-top-2 duration-300"
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
        }}
      >
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
              {t("questionPanel.questionLabel", { number: questionNumber })}
            </span>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              {t(questionTypeKey(question.type) as Parameters<typeof t>[0])}
            </span>
            {typeof question.points === "number" && (
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t("questionPanel.points", { points: question.points })}
              </span>
            )}
          </div>

          {question.title && (
            <div className="bg-muted/40 p-3 sm:p-4 rounded-lg border border-border">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">
                {question.title}
              </h3>
            </div>
          )}

          <div className="bg-card p-4 sm:p-5 rounded-lg border border-border shadow-sm">
            <CopyProtector>
              <RichTextViewer
                content={question.text || ""}
                className="text-sm sm:text-base leading-relaxed"
              />
            </CopyProtector>
          </div>
        </div>
      </div>

      {scrollTop === 0 && (
        <div className="sticky bottom-0 left-0 right-0 z-20 flex justify-center pb-2 pt-2 bg-gradient-to-t from-muted/20 via-muted/20 to-transparent backdrop-blur-sm pointer-events-none">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              scrollRef.current?.scrollTo({
                top: 100,
                behavior: "smooth",
              });
            }}
            className="rounded-full bg-transparent hover:bg-transparent border-transparent hover:border-transparent min-h-[44px] px-4 gap-2 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
            aria-label={t("questionPanel.scrollMoreAriaLabel")}
          >
            <ChevronsDown
              className="w-4 h-4 animate-bounce"
              aria-hidden="true"
            />
          </Button>
        </div>
      )}
    </div>
  );
}
