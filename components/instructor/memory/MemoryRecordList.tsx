"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";
import type { InstructorMemoryRecord } from "@/lib/instructor-memory";
import { MemoryRecordCard } from "./MemoryRecordCard";

export interface MemoryRecordListProps {
  status: "pending" | "error" | "success";
  records: readonly InstructorMemoryRecord[];
  onDelete: (memoryId: string) => void;
  onRetry?: () => void;
  deletingId?: string | null;
}

/** 스켈레톤은 최종 레이아웃과 같은 모양이어야 한다 (uiux.mdc §7). */
function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <Card key={row}>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-5 w-2/3" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * 빈 목록은 빈 화면이 아니라 설명이다.
 *
 * 아무것도 없는 목록을 그냥 비워 두면 교수는 "고장인가, 아직 없는 건가" 를 구분할 수 없다.
 * 왜 비었는지, 무엇을 하면 채워지는지, 이게 오류가 아닌지를 같이 말한다.
 */
function EmptyState() {
  const t = useTranslations("instructor.memory");

  return (
    <Card data-testid="memory-empty-state" className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h3 className="text-base font-semibold text-foreground">{t("empty.title")}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("empty.body")}
        </p>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("empty.how")}
        </p>
        <Badge variant="secondary">{t("empty.note")}</Badge>
      </CardContent>
    </Card>
  );
}

export function MemoryRecordList({
  status,
  records,
  onDelete,
  onRetry,
  deletingId = null,
}: MemoryRecordListProps) {
  const t = useTranslations("instructor.memory");

  return (
    <section className="space-y-4" data-testid="memory-record-list">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">{t("list.title")}</CardTitle>
            {status === "success" && (
              <Badge variant="secondary" data-testid="memory-record-count">
                {t("list.countLabel", { count: records.length })}
              </Badge>
            )}
          </div>
          <CardDescription>{t("list.description")}</CardDescription>
        </CardHeader>
      </Card>

      {status === "pending" && <ListSkeleton label={t("list.loading")} />}

      {status === "error" && (
        <Alert variant="destructive" data-testid="memory-error-state">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>{t("error.title")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <span>{t("error.body")}</span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {t("error.retry")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {status === "success" && records.length === 0 && <EmptyState />}

      {status === "success" && records.length > 0 && (
        <div className="space-y-4">
          {records.map((record) => (
            <MemoryRecordCard
              key={record.id}
              record={record}
              onDelete={onDelete}
              isDeleting={deletingId === record.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
