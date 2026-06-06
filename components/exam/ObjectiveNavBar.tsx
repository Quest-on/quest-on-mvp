"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ObjectiveNavBarProps {
  currentIndex: number;
  total: number;
  onNavigate: (index: number) => void;
  className?: string;
}

export function ObjectiveNavBar({
  currentIndex,
  total,
  onNavigate,
  className,
}: ObjectiveNavBarProps) {
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= total - 1;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 border-t border-border bg-background px-4 py-3",
        className,
      )}
    >
      <Button
        variant="outline"
        aria-label="이전 문제"
        disabled={isFirst}
        onClick={() => onNavigate(currentIndex - 1)}
        className="min-h-[44px] gap-1.5"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        이전
      </Button>

      <span className="text-sm font-medium tabular-nums text-muted-foreground select-none">
        {currentIndex + 1} / {total}
      </span>

      <Button
        variant="default"
        aria-label="다음 문제"
        disabled={isLast}
        onClick={() => onNavigate(currentIndex + 1)}
        className="min-h-[44px] gap-1.5"
      >
        다음
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
