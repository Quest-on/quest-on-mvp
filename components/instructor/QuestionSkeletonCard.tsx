"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";

interface QuestionSkeletonCardProps {
  index: number;
}

export function QuestionSkeletonCard({ index }: QuestionSkeletonCardProps) {
  const t = useTranslations("authoring");
  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm text-muted-foreground">
          {t("questionSkeletonCard.title", { index: index + 1 })}
        </h4>
        <Skeleton className="size-8 rounded-md" />
      </div>

      {/* Content skeleton */}
      <div className="space-y-2.5">
        {/* Title skeleton */}
        <Skeleton className="h-5 w-3/4" />
        {/* Paragraph lines */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        {/* Sub-questions */}
        <div className="pt-2 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      {/* Expand button skeleton */}
      <Skeleton className="h-7 w-full rounded-md" />

      {/* Footer actions skeleton */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-22 rounded-md" />
        <Skeleton className="h-8 w-18 rounded-md" />
      </div>
    </div>
  );
}
