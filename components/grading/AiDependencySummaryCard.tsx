"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  AiDependencyAssessment,
  AiDependencySummary,
  AiDependencyRiskLevel,
} from "@/lib/types/grading";
import { Bot, RotateCcw, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface AiDependencySummaryCardProps {
  mode: "instructor" | "student";
  questionAssessment?: AiDependencyAssessment | null;
  overallSummary?: AiDependencySummary | null;
  loading?: boolean;
}

function getRiskLabel(
  risk: AiDependencyRiskLevel,
  isAssignment: boolean,
  t: ReturnType<typeof useTranslations<"grading">>
) {
  if (isAssignment) {
    switch (risk) {
      case "high":
        return t("aiDependency.riskHighAssignment");
      case "medium":
        return t("aiDependency.riskMediumAssignment");
      default:
        return t("aiDependency.riskLowAssignment");
    }
  }
  switch (risk) {
    case "high":
      return t("aiDependency.riskHigh");
    case "medium":
      return t("aiDependency.riskMedium");
    default:
      return t("aiDependency.riskLow");
  }
}

function getRiskVariant(risk: AiDependencyRiskLevel) {
  switch (risk) {
    case "high":
      return "destructive" as const;
    case "medium":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function AiDependencySummaryCard({
  mode,
  questionAssessment,
  overallSummary,
  loading,
}: AiDependencySummaryCardProps) {
  const t = useTranslations("grading");
  const isAssignment =
    questionAssessment?.evaluationMode === "assignment" ||
    overallSummary?.evaluationMode === "assignment";

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            {isAssignment ? t("aiDependency.titleResearchLoading") : t("aiDependency.titleAiLoading")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            <p className="text-sm">{t("aiDependency.loadingDesc")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!questionAssessment && !overallSummary) {
    return null;
  }

  const title =
    mode === "instructor"
      ? isAssignment
        ? t("aiDependency.titleResearchInstructor")
        : t("aiDependency.titleAiInstructor")
      : isAssignment
        ? t("aiDependency.titleResearchStudent")
        : t("aiDependency.titleAiStudent");

  const metrics = questionAssessment?.assignmentMetrics;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {overallSummary && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{t("aiDependency.overallSessionLabel")}</span>
              <Badge variant={getRiskVariant(overallSummary.overallRisk)}>
                {isAssignment ? t("aiDependency.badgePrefixAssignment") : t("aiDependency.badgePrefixExam")}
                {getRiskLabel(overallSummary.overallRisk, isAssignment, t)}
              </Badge>
            </div>
            <p className="text-muted-foreground">{overallSummary.summary}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {isAssignment
                  ? t("aiDependency.triggerCountAssignment", { count: overallSummary.triggerCount })
                  : t("aiDependency.triggerCountExam", { count: overallSummary.triggerCount })}
              </span>
              <span>
                {isAssignment
                  ? questionAssessment?.recoveryObserved ||
                    overallSummary.recoveryObserved
                    ? t("aiDependency.recoveryConnected")
                    : t("aiDependency.recoveryLimited")
                  : overallSummary.recoveryObserved
                    ? t("aiDependency.recoveryObserved")
                    : t("aiDependency.recoveryWeak")}
              </span>
            </div>
          </div>
        )}

        {questionAssessment && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{t("aiDependency.currentQuestionLabel")}</span>
              <Badge variant={getRiskVariant(questionAssessment.overallRisk)}>
                {isAssignment ? t("aiDependency.badgePrefixAssignment") : t("aiDependency.badgePrefixExam")}
                {getRiskLabel(questionAssessment.overallRisk, isAssignment, t)}
              </Badge>
            </div>

            <p className="text-muted-foreground">{questionAssessment.summary}</p>

            {isAssignment && metrics ? (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>{t("aiDependency.followUpCount", { count: metrics.followUpQuestionCount })}</div>
                <div>{t("aiDependency.verificationCount", { count: metrics.verificationQuestionCount })}</div>
                <div>{t("aiDependency.conceptExplorationCount", { count: metrics.conceptExplorationCount })}</div>
                <div>{t("aiDependency.answerDelegationCount", { count: metrics.answerDelegationCount })}</div>
              </div>
            ) : (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>{t("aiDependency.delegationRequestCount", { count: questionAssessment.delegationRequestCount })}</div>
                <div>{t("aiDependency.startingPointCount", { count: questionAssessment.startingPointDependencyCount })}</div>
                <div>{t("aiDependency.directAnswerCount", { count: questionAssessment.directAnswerRequestCount })}</div>
                <div>
                  {t("aiDependency.overlapScore", { percent: (questionAssessment.finalAnswerOverlapScore * 100).toFixed(0) })}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="flex items-center gap-2 font-medium">
                <RotateCcw className="h-4 w-4 text-primary" />
                {isAssignment
                  ? questionAssessment.recoveryObserved
                    ? t("aiDependency.recoveryFlowGood")
                    : t("aiDependency.recoveryFlowLimited")
                  : questionAssessment.recoveryObserved
                    ? t("aiDependency.independentRecovery")
                    : t("aiDependency.independentRecoveryWeak")}
              </div>
              {questionAssessment.recoveryEvidence.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {questionAssessment.recoveryEvidence.slice(0, 2).map((evidence, index) => (
                    <li key={`${evidence}-${index}`}>• {evidence}</li>
                  ))}
                </ul>
              )}
            </div>

            {questionAssessment.triggerEvidence.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {mode === "instructor"
                    ? isAssignment
                      ? t("aiDependency.triggerEvidenceInstructor")
                      : t("aiDependency.triggerEvidenceExamInstructor")
                    : isAssignment
                      ? t("aiDependency.triggerEvidenceStudent")
                      : t("aiDependency.triggerEvidenceExamStudent")}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {questionAssessment.triggerEvidence.slice(0, 3).map((evidence, index) => (
                    <li key={`${evidence}-${index}`}>• {evidence}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
