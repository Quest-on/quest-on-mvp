"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Minus, Quote, Plus } from "lucide-react";
import { LoadingMessage } from "@/components/ui/loading-message";
import type { SummaryData } from "@/lib/types/grading";
import { useTranslations } from "next-intl";

export type { SummaryData } from "@/lib/types/grading";

interface AIOverallSummaryProps {
  summary: SummaryData | null;
  loading: boolean;
}

export function AIOverallSummary({
  summary,
  loading,
}: AIOverallSummaryProps) {
  const t = useTranslations("grading");
  if (!summary && !loading) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="w-10 h-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t("aiOverallSummary.emptyTitle")}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {t("aiOverallSummary.emptyDesc")}
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
            {t("aiOverallSummary.loadingTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8">
            <LoadingMessage
              loading={loading}
              messages={[
                t("aiOverallSummary.loadingMsg0"),
                t("aiOverallSummary.loadingMsg1"),
                t("aiOverallSummary.loadingMsg2"),
                t("aiOverallSummary.loadingMsg3"),
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
            {t("aiOverallSummary.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wider">
              {t("aiOverallSummary.overallOpinion")}
            </h4>
            <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
              {summary.summary}
            </p>
          </div>

          {summary.keyQuotes && summary.keyQuotes.length > 0 && (
            <div className="bg-warning-surface/50 p-4 rounded-lg border border-warning-border">
              <h4 className="font-semibold text-warning-text mb-3 flex items-center gap-2 text-sm">
                <Quote className="w-4 h-4" /> {t("aiOverallSummary.keyQuotes")}
              </h4>
              <ul className="space-y-3">
                {summary.keyQuotes.map((quote, i) => (
                  <li key={i} className="relative pl-4 italic text-foreground">
                    <span className="absolute left-0 top-0 text-warning-solid text-xl font-serif">
                      &quot;
                    </span>
                    {quote}
                    <span className="text-warning-solid text-xl font-serif ml-1">
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
          <div className="bg-info-surface/50 p-4 rounded-lg border border-info-border">
            <h4 className="font-semibold text-info-text mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t("aiOverallSummary.strengths")}
            </h4>
            <ul className="space-y-2 text-sm">
              {(summary.strengths ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-info-solid mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-warning-surface/50 p-4 rounded-lg border border-warning-border">
            <h4 className="font-semibold text-warning-text mb-3 flex items-center gap-2">
              <Minus className="w-4 h-4" /> {t("aiOverallSummary.weaknesses")}
            </h4>
            <ul className="space-y-2 text-sm">
              {(summary.weaknesses ?? []).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-warning-text mt-1">•</span>
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
