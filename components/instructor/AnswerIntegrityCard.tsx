"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import type {
  AnswerIntegrityAnalysis,
  AnswerIntegrityMetrics,
  IntegrityClassification,
  PasteAssessment,
} from "@/lib/answer-integrity";
import { resolvePasteAssessment } from "@/lib/answer-integrity";
import { PasteAnalyzerVerdict } from "@/components/instructor/PasteAnalyzerVerdict";
import {
  formatMetricsSummaryLines,
  formatScoreRangeLegend,
  getAuthenticityScoreBand,
  sanitizeAnalysisForDisplay,
} from "@/lib/answer-integrity-display";

const CLASSIFICATION_STYLES: Record<IntegrityClassification, string> = {
  정상: "bg-emerald-100 text-emerald-900",
  "낮은 검토 필요": "bg-blue-100 text-blue-900",
  "검토 권장": "bg-amber-100 text-amber-900",
  "우선 검토 필요": "bg-red-100 text-red-900",
};

interface AnswerIntegrityCardProps {
  sessionId: string;
  /** 시험 문항 채점 시 필수 */
  questionId?: string;
  qIdx?: number;
  onPasteAssessmentChange?: (assessment: PasteAssessment | null) => void;
  onAnalyzingChange?: (analyzing: boolean) => void;
  hidePasteVerdict?: boolean;
  /** 과제는 기본 true, 시험은 기본 false */
  autoAnalyze?: boolean;
  compact?: boolean;
}

export function AnswerIntegrityCard({
  sessionId,
  questionId,
  qIdx,
  onPasteAssessmentChange,
  onAnalyzingChange,
  hidePasteVerdict = false,
  autoAnalyze,
  compact = false,
}: AnswerIntegrityCardProps) {
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (questionId) params.set("questionId", questionId);
    if (typeof qIdx === "number") params.set("qIdx", String(qIdx));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [questionId, qIdx]);

  const shouldAutoAnalyze = autoAnalyze ?? !questionId;

  const [analysis, setAnalysis] = useState<AnswerIntegrityAnalysis | null>(null);
  const [metrics, setMetrics] = useState<AnswerIntegrityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncPasteAssessment = useCallback(
    (a: AnswerIntegrityAnalysis | null, m: AnswerIntegrityMetrics | null) => {
      onPasteAssessmentChange?.(resolvePasteAssessment(a, m));
    },
    [onPasteAssessmentChange]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/answer-integrity${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "불러오기 실패");
      setMetrics(data.metrics ?? null);
      setAnalysis(data.analysis ?? null);
      syncPasteAssessment(
        data.analysis ?? null,
        data.metrics ?? data.analysis?.metrics_snapshot ?? null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, query, syncPasteAssessment]);

  const runAnalysis = useCallback(
    async (force = false) => {
      setAnalyzing(true);
      setError(null);
      try {
        const res = await fetch(`/api/session/${sessionId}/answer-integrity${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force,
            ...(questionId ? { questionId, qIdx } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "분석 실패");
        setAnalysis(data.analysis ?? null);
        setMetrics(data.metrics ?? data.analysis?.metrics_snapshot ?? null);
        syncPasteAssessment(
          data.analysis ?? null,
          data.metrics ?? data.analysis?.metrics_snapshot ?? null
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
      } finally {
        setAnalyzing(false);
      }
    },
    [sessionId, query, questionId, qIdx, syncPasteAssessment]
  );

  useEffect(() => {
    onAnalyzingChange?.(analyzing);
  }, [analyzing, onAnalyzingChange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (
      shouldAutoAnalyze &&
      !loading &&
      !analysis &&
      metrics &&
      !analyzing &&
      !error
    ) {
      void runAnalysis(false);
    }
  }, [shouldAutoAnalyze, loading, analysis, metrics, analyzing, error, runAnalysis]);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          답안 작성 과정 지표 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  if (compact && !analysis && !metrics?.paste.occurred) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-primary/10">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          답안 작성 과정 분석
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          disabled={analyzing}
          onClick={() => void runAnalysis(true)}
        >
          {analyzing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span className="ml-1.5">재분석</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {analyzing && !analysis && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            복합 지표를 검토하고 있습니다...
          </div>
        )}

        {!hidePasteVerdict && (
          <PasteAnalyzerVerdict
            assessment={resolvePasteAssessment(analysis, metrics)}
            pending={analyzing && !analysis}
            compact={compact}
          />
        )}

        {analysis && (() => {
          const display = sanitizeAnalysisForDisplay(analysis);
          const band = getAuthenticityScoreBand(display.authenticity_score);
          return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={CLASSIFICATION_STYLES[display.classification]}>
                {display.classification}
              </Badge>
              <span className="text-sm text-muted-foreground">
                검토 점수 {display.authenticity_score}/100
                <span className="text-xs"> ({band.min}~{band.max}점 구간)</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed rounded-md bg-muted/40 px-2.5 py-2">
              <span className="font-medium text-foreground">점수 구간 안내: </span>
              {formatScoreRangeLegend()}
              {band.reviewRecommended && (
                <span className="block mt-1 text-amber-800">
                  현재 점수는 「{band.classification}」 구간으로, 답안·작성 과정을 추가로 확인하는 것을 권장합니다.
                </span>
              )}
            </p>
            <p className="text-sm leading-relaxed">{display.reasoning_summary}</p>
            {display.evidence.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">복합 근거</p>
                <ul className="text-sm space-y-1 list-disc pl-4">
                  {display.evidence.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {display.risk_factors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">우려 요소</p>
                <ul className="text-sm space-y-1 list-disc pl-4 text-amber-900/90">
                  {display.risk_factors.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          );
        })()}

        {metrics && !compact && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">수집된 복합 지표 요약</summary>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              {formatMetricsSummaryLines(metrics).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          부정행위 판정이 아닌 검토 참고용입니다. 단일 지표가 아닌 복합 행동 데이터를 기반으로 합니다.
        </p>
      </CardContent>
    </Card>
  );
}

/** @deprecated AnswerIntegrityCard 사용 */
export { AnswerIntegrityCard as AnswerAuthenticityCard };
