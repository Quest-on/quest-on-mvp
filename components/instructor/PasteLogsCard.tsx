"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface PasteLogsCardProps {
  pasteLogs?: PasteLog[];
  questionId?: string;
}

export function PasteLogsCard({ pasteLogs, questionId }: PasteLogsCardProps) {
  const t = useTranslations("grading");
  if (!pasteLogs || pasteLogs.length === 0) {
    return null;
  }

  // 현재 문제에 해당하는 로그만 필터링
  const relevantLogs = pasteLogs.filter(
    (log) => !questionId || log.question_id === questionId
  );

  if (relevantLogs.length === 0) {
    return null;
  }

  // 의심스러운 로그만 필터링
  const suspiciousLogs = relevantLogs.filter((log) => log.suspicious);

  // 전체 로그 개수
  const totalLogs = relevantLogs.length;
  const suspiciousCount = suspiciousLogs.length;

  return (
    <Card className={suspiciousCount > 0 ? "border-destructive bg-destructive/5" : "border-warning-border bg-warning-surface/50"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {suspiciousCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <Copy className="h-4 w-4 text-warning-text" />
          )}
          <span className={suspiciousCount > 0 ? "text-destructive" : ""}>
            {suspiciousCount > 0 ? t("pasteLogs.suspiciousTitle") : t("pasteLogs.pasteTitle")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suspiciousCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-destructive/15 border border-destructive rounded-md">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">
                {t("pasteLogs.suspiciousDetected", { count: suspiciousCount })}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("pasteLogs.totalLabel")}</span>
          <Badge variant="outline" className="text-xs">{t("pasteLogs.totalCount", { count: totalLogs })}</Badge>
        </div>
        {suspiciousCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("pasteLogs.suspiciousLabel")}</span>
            <Badge variant="destructive" className="text-xs">{t("pasteLogs.suspiciousCount", { count: suspiciousCount })}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

