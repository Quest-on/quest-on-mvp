"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ExamQuestionNavItem {
  type: string;
  hasAnswer: boolean;
  hasChat: boolean;
}

interface ExamQuestionNavProps {
  questions: ExamQuestionNavItem[];
  currentQuestion: number;
  onExit: () => void;
  className?: string;
}

/** 문항 유형 → 네비 우측 상단 배지 라벨 */
export function questionNavTypeBadge(type: string): string | null {
  switch (type) {
    case "multiple-choice":
      return "MCQ";
    case "true-false":
      return "O/X";
    case "essay":
      return "CASE";
    case "short-answer":
      return "SHORT";
    default:
      return null;
  }
}

/**
 * 좌측 세로 문항 타임라인 + 하단 나가기. md 이상에서 좌측 고정.
 * 단방향 진행 정책: 문항은 클릭으로 이동할 수 없는 '진행 표시' 전용이다.
 * (이전 문제로 되돌아가거나 앞 문제로 점프하는 것을 막는다.)
 */
export function ExamQuestionNav({
  questions,
  currentQuestion,
  onExit,
  className,
}: ExamQuestionNavProps) {
  return (
    <>
      {/* Desktop: left vertical timeline */}
      <nav
        className={cn(
          "hidden md:flex h-full flex-col shrink-0 border-r border-border bg-muted/30 w-16 lg:w-20",
          className,
        )}
        aria-label="문항 진행 상황"
      >
        <div className="flex flex-col items-center gap-2 py-4 px-2 overflow-y-auto hide-scrollbar flex-1 min-h-0">
          {questions.map((q, idx) => (
            <QuestionPill
              key={idx}
              index={idx}
              questionType={q.type}
              isCurrent={idx === currentQuestion}
              hasAnswer={q.hasAnswer}
              hasChat={q.hasChat}
              layout="vertical"
            />
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="w-full min-h-[44px] flex flex-col gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 px-1"
            aria-label="시험 나가기"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            <span>나가기</span>
          </Button>
        </div>
      </nav>

      {/* Mobile: bottom horizontal timeline */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm"
        aria-label="문항 진행 상황"
      >
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto hide-scrollbar">
          {questions.map((q, idx) => (
            <QuestionPill
              key={idx}
              index={idx}
              questionType={q.type}
              isCurrent={idx === currentQuestion}
              hasAnswer={q.hasAnswer}
              hasChat={q.hasChat}
              layout="horizontal"
            />
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={onExit}
            className="shrink-0 min-h-[40px] text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
            aria-label="시험 나가기"
          >
            나가기
          </Button>
        </div>
      </nav>
    </>
  );
}

/** 진행 표시 전용 칩(비대화형). 단방향 진행이므로 클릭 이동을 제공하지 않는다. */
function QuestionPill({
  index,
  questionType,
  isCurrent,
  hasAnswer,
  hasChat,
  layout,
}: {
  index: number;
  questionType: string;
  isCurrent: boolean;
  hasAnswer: boolean;
  hasChat: boolean;
  layout: "vertical" | "horizontal";
}) {
  const typeBadge = questionNavTypeBadge(questionType);

  return (
    <div
      data-testid={layout === "vertical" ? `exam-question-nav-${index}` : undefined}
      className={cn(
        "relative flex items-center justify-center rounded-lg text-xs font-semibold border shrink-0 cursor-default select-none",
        layout === "vertical" ? "w-10 h-10 lg:w-11 lg:h-11" : "w-10 h-10",
        isCurrent
          ? "ring-2 ring-primary bg-primary text-primary-foreground border-primary"
          : hasAnswer
            ? "bg-primary/15 border-primary/30 text-primary"
            : "bg-background border-border text-muted-foreground",
      )}
      aria-label={`문제 ${index + 1}${typeBadge ? ` (${typeBadge})` : ""}${isCurrent ? " (현재)" : ""}${hasAnswer ? " (작성됨)" : " (미작성)"}${hasChat ? " (채팅 있음)" : ""}`}
      aria-current={isCurrent ? "step" : undefined}
    >
      {index + 1}
      {typeBadge && (
        <span
          className={cn(
            "absolute -top-1 -right-1 rounded px-0.5 py-px text-[7px] font-bold leading-none tracking-tight border",
            isCurrent
              ? "bg-primary-foreground text-primary border-primary-foreground/80"
              : "bg-muted text-muted-foreground border-border",
          )}
          aria-hidden="true"
        >
          {typeBadge}
        </span>
      )}
      {hasChat && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-2.5 bg-blue-500 rounded-full border border-background"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
