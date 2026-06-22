"use client";

import { AlertTriangle, FileText, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  FINAL_ANSWER_SPEED_ANALYSIS_ENABLED,
  describeAbnormalBurstReason,
  hasAnswerIntegritySignals,
  type AbnormalBurst,
  type ExternalPasteSuspicionDetail,
  type AnswerIntegritySnapshot,
} from "@/lib/answer-integrity";

export type FinalAnswerIntegrityDisplay = Pick<
  AnswerIntegritySnapshot,
  | "externalPasteCount"
  | "externalPasteChars"
  | "internalPasteCount"
  | "internalPasteChars"
  | "abnormalBursts"
  | "externalPasteDetails"
>;

interface FinalAnswerIntegrityNoteProps {
  integrity: FinalAnswerIntegrityDisplay | null | undefined;
  className?: string;
}

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * CASE 종합 평가 등 상단에 표시하는 최종답안 무결성 요약.
 */
export function FinalAnswerIntegrityNote({
  integrity,
  className = "",
}: FinalAnswerIntegrityNoteProps) {
  if (!integrity || !hasAnswerIntegritySignals(integrity as AnswerIntegritySnapshot)) {
    return null;
  }

  const {
    externalPasteCount,
    externalPasteChars,
    internalPasteCount,
    abnormalBursts,
    externalPasteDetails = [],
  } = integrity;

  return (
    <div
      className={`rounded-lg border border-muted bg-muted/20 px-4 py-3 space-y-3 ${className}`}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        최종답안 입력 참고 신호
      </p>
      <div className="flex flex-wrap gap-2">
        {externalPasteCount > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            외부 붙여넣기 {externalPasteCount}회 ({externalPasteChars.toLocaleString()}자)
          </Badge>
        )}
        {internalPasteCount > 0 && (
          <Badge
            variant="secondary"
            className="gap-1 bg-blue-100 text-blue-900 hover:bg-blue-200"
          >
            <FileText className="w-3 h-3" />
            앱 내 복사 {internalPasteCount}회
          </Badge>
        )}
        {FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0 && (
          <Badge
            variant="secondary"
            className="gap-1 bg-amber-100 text-amber-900 hover:bg-amber-200"
          >
            <Zap className="w-3 h-3" />
            속도 이상 {abnormalBursts.length}건
          </Badge>
        )}
      </div>

      {externalPasteDetails.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 space-y-2">
          <p className="text-xs font-semibold text-red-800">외부 붙여넣기 판단 근거</p>
          <ul className="text-xs text-red-800/90 space-y-2">
            {externalPasteDetails.map((detail, i) => (
              <li key={`${detail.timestamp}-${i}`} className="space-y-0.5">
                <p>
                  •{" "}
                  {detail.timestamp ? `${formatEventTime(detail.timestamp)}, ` : ""}
                  {detail.length > 0 ? `${detail.length.toLocaleString()}자` : "외부 붙여넣기"}
                  {detail.pasteStart !== null && detail.pasteStart >= 0
                    ? ` · 답안 ${detail.pasteStart}번째 글자 위치`
                    : ""}
                </p>
                <p className="pl-3 text-red-700/90">근거: {detail.reason}</p>
                {detail.textPreview && (
                  <p className="pl-3 text-red-700/80 italic">
                    미리보기: 「{detail.textPreview}」
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {FINAL_ANSWER_SPEED_ANALYSIS_ENABLED && abnormalBursts.length > 0 && (
        <div className="text-xs text-amber-900/90 space-y-1">
          <p className="font-medium">속도 이상 참고 근거</p>
          {abnormalBursts.slice(0, 5).map((burst, i) => (
            <p key={`${burst.startTs}-${i}`} className="pl-1">
              • {formatEventTime(new Date(burst.startTs).toISOString())} —{" "}
              {describeAbnormalBurstReason(burst, "ko")}
            </p>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        AI 종합 평가 생성 시 위 신호와 판단 근거를 함께 참고합니다. 앱 내 복사(AI 채팅)는
        허용된 행동입니다.
      </p>
    </div>
  );
}
