"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, Quote, Plus, Minus, Loader2 } from "lucide-react";
import type { QuestionSummaryData } from "@/lib/types/grading";

const SENTIMENT_STYLES: Record<
  "positive" | "negative" | "neutral",
  { label: string; className: string }
> = {
  positive: { label: "긍정적", className: "bg-green-100 text-green-700 border-green-200" },
  negative: { label: "부정적", className: "bg-red-100 text-red-700 border-red-200" },
  neutral: { label: "중립적", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

interface QuestionAiSummaryCardProps {
  summary: QuestionSummaryData | null;
  loading?: boolean;
}

export function QuestionAiSummaryCard({
  summary,
  loading = false,
}: QuestionAiSummaryCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            CASE 문항 평가
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          CASE 문항 평가 생성 중…
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card data-testid="grade-ai-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            CASE 문항 평가
          </CardTitle>
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${SENTIMENT_STYLES[summary.sentiment].className}`}
          >
            {SENTIMENT_STYLES[summary.sentiment].label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.summary && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {summary.summary}
          </p>
        )}

        {summary.keyQuotes && summary.keyQuotes.length > 0 && (
          <div className="space-y-1.5">
            {summary.keyQuotes.map((quote, idx) => (
              <div
                key={idx}
                className="flex gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-2 dark:bg-yellow-950/20 dark:border-yellow-900"
              >
                <Quote className="h-3.5 w-3.5 text-yellow-700 shrink-0 mt-0.5" />
                <p className="text-xs italic">{quote}</p>
              </div>
            ))}
          </div>
        )}

        {summary.strengths.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">강점</span>
            </div>
            <ul className="space-y-0.5 pl-4 list-disc text-xs">
              {summary.strengths.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {summary.weaknesses.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Minus className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-xs font-semibold text-orange-700">개선점</span>
            </div>
            <ul className="space-y-0.5 pl-4 list-disc text-xs">
              {summary.weaknesses.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
