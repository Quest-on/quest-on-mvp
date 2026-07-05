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
import { useTranslations } from "next-intl";

// HTML 태그를 제거하고 순수 텍스트만 반환
function stripHtml(html: string): string {
  if (!html) return "";
  // 간단한 HTML 태그 제거
  return html.replace(/<[^>]*>/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FLEXIBLE_WHITESPACE_PATTERN = "(?:\\s|&nbsp;|<br\\s*/?>)*";

// 원본 텍스트 기준으로 특수문자 이스케이프를 먼저 수행한 뒤,
// HTML 이스케이프와 공백/줄바꿈 유연 매칭 패턴을 결합한다.
function buildFlexibleHtmlRegexFromRawText(rawText: string): RegExp | null {
  const normalized = rawText.replace(/\r\n?/g, "\n");
  const segments = normalized.match(/\s+|[^\s]+/g);
  if (!segments || segments.length === 0) return null;

  const pattern = segments
    .map((segment) => {
      if (/^\s+$/.test(segment)) return FLEXIBLE_WHITESPACE_PATTERN;
      const regexEscaped = escapeRegExp(segment);
      return escapeHtml(regexEscaped);
    })
    .join("");

  if (!pattern) return null;
  return new RegExp(pattern, "g");
}

function sortLogsByLengthDesc(logs: PasteLog[]): PasteLog[] {
  return [...logs].sort(
    (a, b) => (b.pasted_text?.length ?? 0) - (a.pasted_text?.length ?? 0)
  );
}

// 텍스트를 HTML로 변환 (줄바꿈 처리)
function textToHtml(text: string): string {
  if (!text) return "";
  // HTML 특수문자 이스케이프
  return escapeHtml(text).replace(/\n/g, "<br>"); // 줄바꿈을 <br>로 변환
}

function applyPositionFallback(
  htmlAnswer: string,
  log: PasteLog,
  colorClass: string
): string {
  const { paste_start, paste_end } = log;

  if (
    paste_start === undefined ||
    paste_start === null ||
    paste_end === undefined ||
    paste_end === null ||
    paste_end <= paste_start
  ) return htmlAnswer;

  const plainText = stripHtml(htmlAnswer);

  if (paste_start >= plainText.length || paste_end > plainText.length) return htmlAnswer;

  const targetText = plainText.substring(paste_start, paste_end);
  if (!targetText.trim()) return htmlAnswer;

  const escapedTarget = escapeRegExp(escapeHtml(targetText));
  const targetRegex = new RegExp(escapedTarget, "g");

  return htmlAnswer.replace(
    targetRegex,
    `<mark class="${colorClass} opacity-60 px-1 rounded" title="붙여넣기 후 수정됨">$&</mark>` // title은 HTML 속성이라 t() 적용 불가
  );
}

// 답안에서 복사-붙여넣기한 부분을 하이라이트
function highlightPastedContent(answer: string, pasteLogs: PasteLog[]): string {
  if (!answer) return "";

  // 답안이 HTML인지 텍스트인지 확인
  const isHtml = /<[^>]+>/.test(answer);

  // HTML이 아닌 경우 (textarea로 변경 후) - 텍스트를 HTML로 변환
  if (!isHtml) {
    // 먼저 텍스트를 HTML로 변환 (줄바꿈 처리)
    let htmlAnswer = textToHtml(answer);

    // 붙여넣기가 있으면 하이라이트 적용
    if (pasteLogs && pasteLogs.length > 0) {
      // 내부 복사 - 파란색 (먼저 필터링하여 외부 복사와 구분)
      const internalPastes = sortLogsByLengthDesc(
        pasteLogs.filter((log) => log.is_internal === true && log.pasted_text)
      );

      // 외부 복사 (의심스러운 붙여넣기) - 빨간색 (내부 복사가 아닌 것만)
      const externalPastes = sortLogsByLengthDesc(
        pasteLogs.filter(
          (log) => log.is_internal !== true && log.suspicious && log.pasted_text
        )
      );

      // 내부 복사 하이라이트 (파란색) - 외부 복사와 동일한 로직, 색상만 다름
      for (const log of internalPastes) {
        const pastedText = log.pasted_text!;
        const regex = buildFlexibleHtmlRegexFromRawText(pastedText);
        const beforeLength = htmlAnswer.length;

        if (regex) {
          // 이미 하이라이트되지 않은 부분만 매칭
          const parts = htmlAnswer.split(/<mark[^>]*>[\s\S]*?<\/mark>/g);
          const markers = htmlAnswer.match(/<mark[^>]*>[\s\S]*?<\/mark>/g) || [];

          // 각 부분에서 내부 복사 텍스트 찾기
          let newHtmlAnswer = "";
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const highlightedPart = part.replace(
              regex,
              `<mark class="bg-blue-200 text-blue-900 font-semibold px-1 rounded">$&</mark>`
            );
            newHtmlAnswer += highlightedPart;
            if (i < markers.length) newHtmlAnswer += markers[i];
          }
          htmlAnswer = newHtmlAnswer;
        }

        // Fallback: if regex didn't match (answer length unchanged), try position-based
        if (htmlAnswer.length === beforeLength) {
          htmlAnswer = applyPositionFallback(htmlAnswer, log, "bg-blue-100 text-blue-800");
        }
      }

      // 외부 복사 하이라이트 (빨간색) - 내부 복사와 동일한 로직, 색상만 다름
      for (const log of externalPastes) {
        const pastedText = log.pasted_text!;
        const regex = buildFlexibleHtmlRegexFromRawText(pastedText);
        const beforeLength = htmlAnswer.length;

        if (regex) {
          // 이미 하이라이트되지 않은 부분만 매칭
          const parts = htmlAnswer.split(/<mark[^>]*>[\s\S]*?<\/mark>/g);
          const markers = htmlAnswer.match(/<mark[^>]*>[\s\S]*?<\/mark>/g) || [];

          // 각 부분에서 외부 복사 텍스트 찾기
          let newHtmlAnswer = "";
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const highlightedPart = part.replace(
              regex,
              `<mark class="bg-red-200 text-red-900 font-semibold px-1 rounded">$&</mark>`
            );
            newHtmlAnswer += highlightedPart;
            if (i < markers.length) newHtmlAnswer += markers[i];
          }
          htmlAnswer = newHtmlAnswer;
        }

        // Fallback: if regex didn't match (answer length unchanged), try position-based
        if (htmlAnswer.length === beforeLength) {
          htmlAnswer = applyPositionFallback(htmlAnswer, log, "bg-red-100 text-red-800");
        }
      }
    }

    return htmlAnswer;
  }

  // HTML인 경우 (기존 데이터 호환성)
  if (!pasteLogs || pasteLogs.length === 0) return answer;

  // 내부 복사 - 파란색 (먼저 필터링하여 외부 복사와 구분)
  const internalPastes = sortLogsByLengthDesc(
    pasteLogs.filter((log) => log.is_internal === true && log.pasted_text)
  );

  // 외부 복사 (의심스러운 붙여넣기) - 빨간색 (내부 복사가 아닌 것만)
  const externalPastes = sortLogsByLengthDesc(
    pasteLogs.filter(
      (log) => log.is_internal !== true && log.suspicious && log.pasted_text
    )
  );

  if (externalPastes.length === 0 && internalPastes.length === 0) return answer;

  let highlightedAnswer = answer;
  const textBeforeHighlight = stripHtml(highlightedAnswer);

  // 내부 복사 하이라이트 (파란색) - 외부 복사와 동일한 로직, 색상만 다름
  for (const log of internalPastes) {
    if (!log.pasted_text) continue;
    const regex = buildFlexibleHtmlRegexFromRawText(log.pasted_text);
    if (!regex) continue;

    // 이미 하이라이트되지 않은 부분만 매칭
    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

    // 각 부분에서 내부 복사 텍스트 찾기
    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const highlightedPart = part.replace(
        regex,
        `<mark class="bg-blue-200 text-blue-900 font-semibold px-1 rounded">$&</mark>`
      );
      newHighlightedAnswer += highlightedPart;
      if (i < markers.length) {
        newHighlightedAnswer += markers[i];
      }
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  // 외부 복사 하이라이트 (빨간색) - 내부 복사와 동일한 로직, 색상만 다름
  for (const log of externalPastes) {
    if (!log.pasted_text) continue;
    const regex = buildFlexibleHtmlRegexFromRawText(log.pasted_text);
    if (!regex) continue;

    // 이미 하이라이트되지 않은 부분만 매칭
    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

    // 각 부분에서 외부 복사 텍스트 찾기
    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const highlightedPart = part.replace(
        regex,
        `<mark class="bg-red-200 text-red-900 font-semibold px-1 rounded">$&</mark>`
      );
      newHighlightedAnswer += highlightedPart;
      if (i < markers.length) {
        newHighlightedAnswer += markers[i];
      }
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  return highlightedAnswer;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
}

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  pasted_text?: string;
  paste_start?: number;
  paste_end?: number;
  answer_length_before?: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
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
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      {t("finalAnswerCard.suspiciousTitle")}
                    </p>
                    <div className="text-xs text-red-700 space-y-1">
                      {suspiciousLogs.map((log) => (
                        <p key={log.id}>
                          {t("finalAnswerCard.suspiciousLog", { chars: log.length.toLocaleString(), time: new Date(log.timestamp).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
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
                          {t("finalAnswerCard.internalLog", { chars: log.length.toLocaleString(), time: new Date(log.timestamp).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
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
                    <span className="inline-block w-3 h-3 rounded bg-red-200" />
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
                  <span className="inline-block w-3 h-3 rounded bg-red-100 opacity-60 border border-red-200" />
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
