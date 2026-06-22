"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PasteAssessment, PasteReviewLevel } from "@/lib/answer-integrity";
import {
  PASTE_REVIEW_LEVEL_GUIDE,
  formatPasteReviewLevelLegend,
  sanitizePasteAssessmentForDisplay,
} from "@/lib/answer-integrity-display";

const LEVEL_STYLES: Record<PasteReviewLevel, string> = {
  "해당 없음": "bg-emerald-100 text-emerald-900 border-emerald-200",
  낮음: "bg-blue-100 text-blue-900 border-blue-200",
  중간: "bg-amber-100 text-amber-900 border-amber-200",
  높음: "bg-red-100 text-red-900 border-red-200",
};

interface PasteAnalyzerVerdictProps {
  assessment: PasteAssessment | null;
  pending?: boolean;
  compact?: boolean;
}

export function PasteAnalyzerVerdict({
  assessment,
  pending = false,
  compact = false,
}: PasteAnalyzerVerdictProps) {
  if (pending) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        작성 과정 분석기가 붙여넣기 여부를 검토 중입니다...
      </div>
    );
  }

  if (!assessment) return null;

  const display = sanitizePasteAssessmentForDisplay(assessment);
  const levelGuide = PASTE_REVIEW_LEVEL_GUIDE[display.review_level];

  const Icon = display.external_paste_suspected
    ? AlertTriangle
    : display.review_level === "해당 없음"
      ? CheckCircle2
      : HelpCircle;

  const borderClass = display.external_paste_suspected
    ? "border-amber-300 bg-amber-50/80"
    : "border-muted bg-muted/20";

  return (
    <div className={`rounded-md border px-3 py-3 space-y-2 ${borderClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          className={`w-4 h-4 shrink-0 ${
            display.external_paste_suspected ? "text-amber-700" : "text-emerald-700"
          }`}
        />
        <span className="text-sm font-semibold">분석기 · 붙여넣기 판단</span>
        <Badge variant="outline" className={LEVEL_STYLES[display.review_level]}>
          검토 {display.review_level}
        </Badge>
        <Badge
          variant="outline"
          className={
            display.external_paste_suspected
              ? "border-amber-400 text-amber-900"
              : "border-emerald-400 text-emerald-900"
          }
        >
          {display.external_paste_suspected ? "외부 붙여넣기 의심" : "외부 붙여넣기 의심 낮음"}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        검토 수준 안내: {formatPasteReviewLevelLegend()}
      </p>
      <p className="text-xs text-muted-foreground">{levelGuide.description}</p>
      <p className="text-sm leading-relaxed">{display.summary}</p>
      {!compact && display.evidence.length > 0 && (
        <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
          {display.evidence.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        작성 과정 분석기의 복합 판단이며 부정행위 확정이 아닙니다.
      </p>
    </div>
  );
}
