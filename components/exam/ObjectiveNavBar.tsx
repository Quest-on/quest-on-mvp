"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ObjectiveNavBarProps {
  currentIndex: number;
  total: number;
  onNavigate: (index: number) => void;
  /** 다음 버튼 활성화 여부. 객관식은 답 선택 시 true, CASE는 항상 true. */
  canNext: boolean;
  /** '이전' 버튼 노출 여부. CASE 블록 내 양방향 이동용. 미전달 시 단방향(기존 동작). */
  canPrev?: boolean;
  onPrev?: () => void;
  className?: string;
}

/**
 * 시험 문항 하단 진행 바(객관식·CASE 공통). 기본은 단방향 진행 정책:
 * - '다음'은 canNext일 때만 활성(객관식 선택 강제).
 * - 마지막 문항에선 다음 버튼을 숨긴다(제출은 상단 툴바 사용).
 * - 기본적으로 '이전' 버튼 없음(되돌아가기 불가). 단, canPrev/onPrev가 주어지면
 *   '이전' 버튼을 노출한다(CASE 블록 내 양방향 이동 한정).
 */
export function ObjectiveNavBar({
  currentIndex,
  total,
  onNavigate,
  canNext,
  canPrev,
  onPrev,
  className,
}: ObjectiveNavBarProps) {
  const isLast = currentIndex >= total - 1;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 border-t border-border bg-background px-4 py-3",
        className,
      )}
    >
      {canPrev && onPrev && (
        <Button
          variant="outline"
          aria-label="이전 문제"
          onClick={onPrev}
          data-testid="exam-prev-btn"
          className="min-h-[44px] gap-1.5"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          이전
        </Button>
      )}

      <span className="text-sm font-medium tabular-nums text-muted-foreground select-none">
        {currentIndex + 1} / {total}
      </span>

      {!isLast && (
        <Button
          variant="default"
          aria-label="다음 문제"
          disabled={!canNext}
          onClick={() => onNavigate(currentIndex + 1)}
          data-testid="exam-next-btn"
          className="min-h-[44px] gap-1.5"
        >
          다음
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
