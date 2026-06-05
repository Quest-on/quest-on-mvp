"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Minus, Quote, Plus } from "lucide-react";
import { LoadingMessage } from "@/components/ui/loading-message";
import type { SummaryData } from "@/lib/types/grading";

export type { SummaryData } from "@/lib/types/grading";

interface AIOverallSummaryProps {
  summary: SummaryData | null;
  loading: boolean;
}

export function AIOverallSummary({
  summary,
  loading,
}: AIOverallSummaryProps) {
  if (!summary && !loading) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="w-10 h-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">CASE 종합 평가</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            CASE 답안과 관련 채팅 흐름을 분석해 요약합니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            CASE 종합 평가 분석 중
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8">
            <LoadingMessage
              loading={loading}
              messages={[
                "학생의 답안을 전체적으로 검토하고 있습니다...",
                "주요 강점과 개선점을 분석하고 있습니다...",
                "답안에서 핵심 인용구를 추출하고 있습니다...",
                "종합적인 평가 의견을 작성하고 있습니다...",
              ]}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card className="overflow-hidden border-2 border-primary/10">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
            CASE 종합 평가
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wider">
              종합 의견
            </h4>
            <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {summary.summary}
            </p>
          </div>

          {summary.keyQuotes && summary.keyQuotes.length > 0 && (
            <div className="bg-yellow-50/50 p-4 rounded-lg border border-yellow-100">
              <h4 className="font-semibold text-yellow-700 mb-3 flex items-center gap-2 text-sm">
                <Quote className="w-4 h-4" /> 핵심 인용구 (Highlight)
              </h4>
              <ul className="space-y-3">
                {summary.keyQuotes.map((quote, i) => (
                  <li key={i} className="relative pl-4 italic text-gray-700">
                    <span className="absolute left-0 top-0 text-yellow-400 text-xl font-serif">
                      &quot;
                    </span>
                    {quote}
                    <span className="text-yellow-400 text-xl font-serif ml-1">
                      &quot;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onGenerate}>
              <Sparkles className="w-3 h-3 mr-2" />
              다시 분석하기
            </Button>
          </div> */}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
            <h4 className="font-semibold text-blue-700 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> 강점
            </h4>
            <ul className="space-y-2 text-sm">
              {(summary.strengths ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
            <h4 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
              <Minus className="w-4 h-4" /> 개선점
            </h4>
            <ul className="space-y-2 text-sm">
              {(summary.weaknesses ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
