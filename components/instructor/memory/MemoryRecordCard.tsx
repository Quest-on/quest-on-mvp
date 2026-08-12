"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpCircle, Loader2, Trash2 } from "lucide-react";
import type { InstructorMemoryRecord } from "@/lib/instructor-memory";
import { MemoryDeletionDisclosure } from "./MemoryDeletionDisclosure";

/** jsonb 값을 사람이 읽을 형태로. 문구가 아니라 데이터이므로 번역 대상이 아니다. */
export function formatMemoryValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

/** 서버가 준 ISO 를 UTC 로 고정 표기한다. 서버/클라이언트 타임존 차이로 값이 흔들리면 증거로 못 쓴다. */
export function formatProvenanceTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export interface MemoryRecordCardProps {
  record: InstructorMemoryRecord;
  onDelete: (memoryId: string) => void;
  isDeleting?: boolean;
}

export function MemoryRecordCard({ record, onDelete, isDeleting = false }: MemoryRecordCardProps) {
  const t = useTranslations("instructor.memory");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // null 은 "typed" 가 아니라 "모름" 이다. 모르는 출처를 직접 입력으로 보여 주면
  // 교수는 자기가 하지 않은 말에 책임지게 된다.
  const originUnknown = record.source.inputOrigin === null;
  const originLabel = originUnknown
    ? t("origin.unknown")
    : t(`origin.${record.source.inputOrigin}`);
  const sourceLabel = record.source.table
    ? t(`source.${record.source.table}`)
    : t("source.unknown");
  const scopeLabel = record.scope ? t(`scope.${record.scope}`) : t("scope.unknown");
  const statusLabel = record.status ? t(`status.${record.status}`) : t("status.unknown");
  const observedAt = formatProvenanceTimestamp(record.source.occurredAt);

  return (
    <Card data-testid="memory-record" data-memory-id={record.id}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("record.valueLabel")}
            </p>
            <p className="text-base font-medium leading-relaxed break-words text-foreground">
              {formatMemoryValue(record.value)}
            </p>
          </div>
          <Badge variant={record.status === "quarantined" ? "outline" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label={t("record.predicateLabel")}>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {record.predicate}
            </code>
          </Field>

          <Field label={t("record.scopeLabel")}>
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{scopeLabel}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {record.scopeId ?? t("record.scopeIdUnknown")}
              </span>
            </span>
          </Field>

          <Field label={t("record.provenanceLabel")}>
            <span className="block">{sourceLabel}</span>
            <span className="mt-1 block font-mono text-xs text-muted-foreground">
              {t("record.messageLabel")}:{" "}
              {record.source.messageId ?? t("record.messageUnknown")}
            </span>
            {observedAt && (
              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                {t("record.observedAtLabel")}: {observedAt}
              </span>
            )}
          </Field>

          <Field label={t("record.originLabel")}>
            {originUnknown ? (
              <Badge
                variant="outline"
                data-testid="memory-origin-unknown"
                className="border-destructive/50 text-destructive"
              >
                <HelpCircle className="size-3" aria-hidden="true" />
                {originLabel}
              </Badge>
            ) : (
              <Badge variant="secondary">{originLabel}</Badge>
            )}
          </Field>
        </dl>

        <div className="flex justify-end border-t border-border pt-3">
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                {isDeleting ? t("record.deletePending") : t("record.deleteAction")}
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent data-testid="memory-delete-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("delete.confirmIntro")}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <MemoryDeletionDisclosure variant="record" />

              <AlertDialogFooter>
                <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="memory-delete-confirm"
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => onDelete(record.id)}
                >
                  {t("delete.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
