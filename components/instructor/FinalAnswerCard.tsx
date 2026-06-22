import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, AlertTriangle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  FINAL_ANSWER_SPEED_ANALYSIS_ENABLED,
  describeAbnormalBurstReason,
  getExternalPasteSuspicionReason,
  getInternalPasteReason,
  excerptPastedText,
  type AbnormalBurst,
} from "@/lib/answer-integrity";
import { PasteAnalyzerVerdict } from "@/components/instructor/PasteAnalyzerVerdict";
import type { PasteAssessment } from "@/lib/answer-integrity";

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
    `<mark class="${colorClass} opacity-60 px-1 rounded" title="붙여넣기 후 수정됨">$&</mark>`
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

function highlightAbnormalBursts(answer: string, bursts: AbnormalBurst[]): string {
  if (!answer || bursts.length === 0) return textToHtml(answer);

  let htmlAnswer = textToHtml(answer);
  const sorted = [...bursts].sort((a, b) => b.startOffset - a.startOffset);

  for (const burst of sorted) {
    const start = Math.max(0, Math.min(burst.startOffset, answer.length));
    const end = Math.max(start, Math.min(burst.endOffset, answer.length));
    if (end <= start) continue;

    const plainSlice = answer.substring(start, end);
    if (!plainSlice.trim()) continue;

    const escapedSlice = escapeHtml(plainSlice);
    const idx = htmlAnswer.indexOf(escapedSlice);
    if (idx === -1) continue;

    const title = `비정상 입력 속도 (${burst.cps}자/초)`;
    htmlAnswer =
      htmlAnswer.substring(0, idx) +
      `<mark class="bg-amber-200 text-amber-900 font-semibold px-1 rounded" title="${title}">` +
      escapedSlice +
      "</mark>" +
      htmlAnswer.substring(idx + escapedSlice.length);
  }

  return htmlAnswer;
}

function renderHighlightedAnswer(answer: string, pasteLogs: PasteLog[], bursts: AbnormalBurst[]): string {
  const withPaste = highlightPastedContent(answer, pasteLogs);
  if (!FINAL_ANSWER_SPEED_ANALYSIS_ENABLED || bursts.length === 0) {
    return withPaste || textToHtml("답안이 없습니다.");
  }
  // paste 하이라이트 후 plain 기준 burst — assignment plain text 흐름
  const plainAfterPaste = stripHtml(withPaste);
  if (plainAfterPaste === answer) {
    return highlightAbnormalBursts(answer, bursts);
  }
  return withPaste;
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
   * submission 대신 사용한다.
   */
  finalAnswerText?: string;
  /** 입력 타임라인 분석 결과 (속도 분석 feature flag 가 켜져 있을 때만) */
  abnormalBursts?: AbnormalBurst[];
  /** 작성 과정 분석기의 붙여넣기 복합 판단 */
  pasteAssessment?: PasteAssessment | null;
  pasteAssessmentPending?: boolean;
}

function IntegrityAlerts({
  suspiciousLogs,
  internalLogs,
  abnormalBursts,
}: {
  suspiciousLogs: PasteLog[];
  internalLogs: PasteLog[];
  abnormalBursts: AbnormalBurst[];
}) {
  return (
    <>
      {suspiciousLogs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 mb-1">
                외부 붙여넣기 의심
              </p>
              <p className="text-xs text-red-700 mb-2">
                공통 판단 기준: {getExternalPasteSuspicionReason("ko")}
              </p>
              <div className="text-xs text-red-700 space-y-2">
                {suspiciousLogs.map((log) => (
                  <div key={log.id} className="space-y-0.5">
                    <p>
                      • {log.length.toLocaleString()}자 (
                      {new Date(log.timestamp).toLocaleString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      {typeof log.paste_start === "number" && log.paste_start >= 0
                        ? ` · 답안 ${log.paste_start}번째 글자 위치`
                        : ""}
                      )
                    </p>
                    {log.pasted_text && excerptPastedText(log.pasted_text) && (
                      <p className="pl-3 italic text-red-700/90">
                        미리보기: 「{excerptPastedText(log.pasted_text)}」
                      </p>
                    )}
                  </div>
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
                앱 내 복사 (AI 채팅 등)
              </p>
              <p className="text-xs text-blue-700 mb-2">
                판단 근거: {getInternalPasteReason("ko")}
              </p>
              <div className="text-xs text-blue-700 space-y-1">
                {internalLogs.map((log) => (
                  <p key={log.id}>
                    • {log.length.toLocaleString()}자 내부 복사 (
                    {new Date(log.timestamp).toLocaleString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    )
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                비정상 입력 속도 구간 (참고)
              </p>
              <div className="text-xs text-amber-800 space-y-1">
                {abnormalBursts.map((burst, i) => (
                  <p key={`${burst.startTs}-${i}`}>
                    • {new Date(burst.startTs).toLocaleString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    {" — "}
                    {describeAbnormalBurstReason(burst, "ko")}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function FinalAnswerCard({
  submission,
  pasteLogs,
  questionId,
  finalAnswerText,
  abnormalBursts = [],
  pasteAssessment = null,
  pasteAssessmentPending = false,
}: FinalAnswerCardProps) {
  const isAssignmentFlow = finalAnswerText !== undefined;
  const answerBody = isAssignmentFlow
    ? (finalAnswerText ?? "").trim()
    : submission?.answer || "";

  const relevantLogs =
    pasteLogs?.filter((log) => !questionId || log.question_id === questionId) ||
    [];
  const suspiciousLogs = relevantLogs.filter(
    (log) => log.is_internal !== true && log.suspicious
  );
  const internalLogs = relevantLogs.filter((log) => log.is_internal === true);
  const hasIntegritySignals =
    suspiciousLogs.length > 0 ||
    internalLogs.length > 0 ||
    (FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0);

  if (isAssignmentFlow) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              <CardTitle>최종 답안</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {suspiciousLogs.length > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  외부 붙여넣기 {suspiciousLogs.length}건
                </Badge>
              )}
              {internalLogs.length > 0 && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 bg-blue-100 text-blue-900 hover:bg-blue-200"
                >
                  <FileText className="w-3 h-3" />
                  내부 복사 {internalLogs.length}건
                </Badge>
              )}
              {FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0 && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 bg-amber-100 text-amber-900 hover:bg-amber-200"
                >
                  <Zap className="w-3 h-3" />
                  속도 이상 {abnormalBursts.length}건
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>학생이 작성한 최종답안입니다</CardDescription>
        </CardHeader>
        <CardContent>
          {answerBody ? (
            <div className="space-y-3">
              <PasteAnalyzerVerdict
                assessment={pasteAssessment}
                pending={pasteAssessmentPending}
              />
              {hasIntegritySignals && (
                <IntegrityAlerts
                  suspiciousLogs={suspiciousLogs}
                  internalLogs={internalLogs}
                  abnormalBursts={abnormalBursts}
                />
              )}
              {hasIntegritySignals && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground px-1 flex-wrap">
                  {suspiciousLogs.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded bg-red-200" />
                      외부 복사
                    </span>
                  )}
                  {internalLogs.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded bg-blue-200" />
                      내부 복사 (AI 채팅)
                    </span>
                  )}
                  {FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded bg-amber-200" />
                      비정상 입력 속도
                    </span>
                  )}
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4">
                {hasIntegritySignals ? (
                  <div
                    className="text-sm prose max-w-none whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{
                      __html: renderHighlightedAnswer(
                        answerBody,
                        relevantLogs,
                        abnormalBursts
                      ),
                    }}
                  />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                    {answerBody}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 작성되지 않음</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // exam flow — submission 기반
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>최종 답안</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {suspiciousLogs.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                외부 붙여넣기 {suspiciousLogs.length}건
              </Badge>
            )}
            {internalLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-blue-100 text-blue-900 hover:bg-blue-200"
              >
                <FileText className="w-3 h-3" />
                내부 복사 {internalLogs.length}건
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>학생이 제출한 최종 답안입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {submission ? (
          <div className="space-y-3">
            <IntegrityAlerts
              suspiciousLogs={suspiciousLogs}
              internalLogs={internalLogs}
              abnormalBursts={abnormalBursts}
            />
            {relevantLogs.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                {suspiciousLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-red-200" />
                    외부 복사
                  </span>
                )}
                {internalLogs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-blue-200" />
                    내부 복사 (AI 답변)
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-red-100 opacity-60 border border-red-200" />
                  붙여넣기 후 수정됨
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
                    ) || textToHtml("답안이 없습니다."),
                }}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>제출된 답안이 없습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
