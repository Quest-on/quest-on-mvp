"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useLocale } from "next-intl";
import { formatTime } from "@/lib/i18n/format";
import {
  highlightPastedContent,
  textToHtml,
  type PasteLog,
} from "@/lib/highlight-paste";

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
}

interface FinalAnswerCardProps {
  submission?: Submission | undefined;
  pasteLogs?: PasteLog[];
  questionId?: string;
  /**
   * 과제(assignment) 흐름의 sessions.final_answer 본문.
   * 주어지면 paste 하이라이트/`dangerouslySetInnerHTML` 분기를 타지 않고
   * plain text로 안전하게 렌더한다. (XSS 안전)
   */
  finalAnswerText?: string;
}

export function FinalAnswerCard({
  submission,
  pasteLogs,
  questionId,
  finalAnswerText,
}: FinalAnswerCardProps) {
  const t = useTranslations("authoring");
  const locale = useLocale() as "ko" | "en";
  // assignment(plain text) 분기 — paste log 미적용
  if (finalAnswerText !== undefined) {
    const text = finalAnswerText.trim();
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>{t("finalAnswerCard.cardTitlePlain")}</CardTitle>
          </div>
          <CardDescription>{t("finalAnswerCard.cardDescriptionPlain")}</CardDescription>
        </CardHeader>
        <CardContent>
          {text ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                {text}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("finalAnswerCard.emptyPlain")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // 현재 문제에 해당하는 로그만 필터링
  const relevantLogs =
    pasteLogs?.filter((log) => !questionId || log.question_id === questionId) ||
    [];
  const suspiciousLogs = relevantLogs.filter(
    (log) => log.is_internal !== true && log.suspicious
  );
  const internalLogs = relevantLogs.filter((log) => log.is_internal === true);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>{t("finalAnswerCard.cardTitle")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {suspiciousLogs.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("finalAnswerCard.badgeSuspicious", { count: suspiciousLogs.length })}
              </Badge>
            )}
            {internalLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-blue-100 text-blue-900 hover:bg-blue-200"
              >
                <FileText className="w-3 h-3" />
                {t("finalAnswerCard.badgeInternal", { count: internalLogs.length })}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{t("finalAnswerCard.cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {submission ? (
          <div className="space-y-3">
            {suspiciousLogs.length > 0 && (
              <div className="bg-destructive/10 border border-destructive rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive mb-1">
                      {t("finalAnswerCard.suspiciousTitle")}
                    </p>
                    <div className="text-xs text-destructive space-y-1">
                      {suspiciousLogs.map((log) => (
                        <p key={log.id}>
                          {t("finalAnswerCard.suspiciousLog", { chars: log.length.toLocaleString(), time: formatTime(log.timestamp, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {internalLogs.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800 mb-1">
                      {t("finalAnswerCard.internalTitle")}
                    </p>
                    <div className="text-xs text-blue-700 space-y-1">
                      {internalLogs.map((log) => (
                        <p key={log.id}>
                          {t("finalAnswerCard.internalLog", { chars: log.length.toLocaleString(), time: formatTime(log.timestamp, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {relevantLogs.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                {suspiciousLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-destructive/25" />
                    {t("finalAnswerCard.legendExternal")}
                  </span>
                )}
                {internalLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-blue-200" />
                    {t("finalAnswerCard.legendInternal")}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-destructive/15 opacity-60 border border-destructive" />
                  {t("finalAnswerCard.legendModified")}
                </span>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4">
              <div
                className="text-sm prose max-w-none whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html:
                    highlightPastedContent(
                      submission.answer || "",
                      relevantLogs
                    ) || textToHtml(t("finalAnswerCard.emptyAnswer")),
                }}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t("finalAnswerCard.noSubmission")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
