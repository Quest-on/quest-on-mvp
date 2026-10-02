"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useLocale } from "next-intl";
import { formatTime } from "@/lib/i18n/format";
import {
  highlightPastedContent,
  textToHtml,
  type PasteLog,
} from "@/lib/highlight-paste";
import { partitionPasteLogs, selectLogsForHighlight } from "@/lib/integrity-signals";

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
  /**
   * 의심 표시(탭 전환, 외부 붙여넣기)를 보일지. 기본 true(현행 동작).
   * false 면 빨간 뱃지, 경고 박스, 범례의 의심 항목, 본문의 외부 붙여넣기 하이라이트를
   * 숨긴다. 내부 복사(파란색)는 채점 정보라 계속 보인다. 로그 자체는 지우지 않는다.
   */
  showIntegritySignals?: boolean;
}

export function FinalAnswerCard({
  submission,
  pasteLogs,
  questionId,
  finalAnswerText,
  showIntegritySignals = true,
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
            <FileText className="w-5 h-5 text-success-text" />
            <CardTitle>{t("finalAnswerCard.cardTitlePlain")}</CardTitle>
          </div>
          <CardDescription>{t("finalAnswerCard.cardDescriptionPlain")}</CardDescription>
        </CardHeader>
        <CardContent>
          {text ? (
            <div className="bg-muted rounded-lg p-4">
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
  // 탭 전환은 서버에서 suspicious=true 로 저장되지만 외부 붙여넣기가 아니므로
  // 표시 단계에서 갈라 따로 센다. (데이터는 그대로 둔다.)
  const partitioned = partitionPasteLogs(relevantLogs);
  const internalLogs = partitioned.internal;
  const suspiciousLogs = showIntegritySignals ? partitioned.external : [];
  const tabSwitchLogs = showIntegritySignals ? partitioned.tabSwitch : [];
  const highlightLogs = selectLogsForHighlight(relevantLogs, showIntegritySignals);
  // 범례는 본문에 칠해지는 종류가 있을 때만 그린다. 탭 전환은 본문을 칠하지 않는다.
  const hasLegend = suspiciousLogs.length > 0 || internalLogs.length > 0;
  const formatLogTime = (timestamp: string) =>
    formatTime(timestamp, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-success-text" />
            <CardTitle>{t("finalAnswerCard.cardTitle")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {suspiciousLogs.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("finalAnswerCard.badgeSuspicious", { count: suspiciousLogs.length })}
              </Badge>
            )}
            {tabSwitchLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-warning-subtle text-warning-text hover:bg-warning-subtle"
              >
                <ArrowLeftRight className="w-3 h-3" />
                {t("finalAnswerCard.badgeTabSwitch", { count: tabSwitchLogs.length })}
              </Badge>
            )}
            {internalLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-info-subtle text-info-text hover:bg-info-subtle"
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
                          {t("finalAnswerCard.suspiciousLog", { chars: log.length.toLocaleString(), time: formatLogTime(log.timestamp) })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {tabSwitchLogs.length > 0 && (
              <div className="bg-warning-surface border border-warning-border rounded-md p-3">
                <div className="flex items-start gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-warning-text flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-warning-text mb-1">
                      {t("finalAnswerCard.tabSwitchTitle")}
                    </p>
                    {/* 탭 전환은 수십 번도 쌓이므로 목록 높이를 제한한다. */}
                    <div className="text-xs text-warning-text space-y-1 max-h-32 overflow-y-auto">
                      {tabSwitchLogs.map((log) => (
                        <p key={log.id}>
                          {t("finalAnswerCard.tabSwitchLog", { time: formatLogTime(log.timestamp) })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {internalLogs.length > 0 && (
              <div className="bg-info-surface border border-info-border rounded-md p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-info-text flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-info-text mb-1">
                      {t("finalAnswerCard.internalTitle")}
                    </p>
                    <div className="text-xs text-info-text space-y-1">
                      {internalLogs.map((log) => (
                        <p key={log.id}>
                          {t("finalAnswerCard.internalLog", { chars: log.length.toLocaleString(), time: formatLogTime(log.timestamp) })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {hasLegend && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                {suspiciousLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-destructive/25" />
                    {t("finalAnswerCard.legendExternal")}
                  </span>
                )}
                {internalLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-info-subtle" />
                    {t("finalAnswerCard.legendInternal")}
                  </span>
                )}
                {showIntegritySignals && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-destructive/15 opacity-60 border border-destructive" />
                    {t("finalAnswerCard.legendModified")}
                  </span>
                )}
              </div>
            )}
            <div className="bg-muted rounded-lg p-4">
              <div
                className="text-sm prose max-w-none whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html:
                    highlightPastedContent(
                      submission.answer || "",
                      highlightLogs
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
