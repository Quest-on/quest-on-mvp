"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, Quote, Plus, Minus, Loader2 } from "lucide-react";
import type { QuestionSummaryData } from "@/lib/types/grading";
import { useTranslations } from "next-intl";

const SENTIMENT_CLASS: Record<"positive" | "negative" | "neutral", string> = {
  positive: "bg-success-subtle text-success-text border-success-border",
  negative: "bg-destructive/15 text-destructive border-destructive",
  neutral: "bg-secondary text-secondary-foreground border-border",
};

interface QuestionAiSummaryCardProps {
  summary: QuestionSummaryData | null;
  loading?: boolean;
}

export function QuestionAiSummaryCard({
  summary,
  loading = false,
}: QuestionAiSummaryCardProps) {
  const t = useTranslations("grading");

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-info-text" />
            {t("questionAiSummary.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("questionAiSummary.loadingDesc")}
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const sentimentKey = summary.sentiment.charAt(0).toUpperCase() + summary.sentiment.slice(1);
  const sentimentLabel = t(`questionAiSummary.sentiment${sentimentKey}` as Parameters<typeof t>[0]);

  return (
    <Card data-testid="grade-ai-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-info-text" />
            {t("questionAiSummary.title")}
          </CardTitle>
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${SENTIMENT_CLASS[summary.sentiment]}`}
          >
            {sentimentLabel}
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
                className="flex gap-2 rounded-md bg-warning-surface border border-warning-border p-2"
              >
                <Quote className="h-3.5 w-3.5 text-warning-text shrink-0 mt-0.5" />
                <p className="text-xs italic">{quote}</p>
              </div>
            ))}
          </div>
        )}

        {summary.strengths.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Plus className="h-3.5 w-3.5 text-info-text" />
              <span className="text-xs font-semibold text-info-text">{t("questionAiSummary.strengths")}</span>
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
              <span className="text-xs font-semibold text-orange-700">{t("questionAiSummary.weaknesses")}</span>
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
