"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  AiDependencyAssessment,
  AiDependencySummary,
  AiDependencyRiskLevel,
} from "@/lib/types/grading";
import { Bot, RotateCcw, Loader2 } from "lucide-react";

interface AiDependencySummaryCardProps {
  mode: "instructor" | "student";
  questionAssessment?: AiDependencyAssessment | null;
  overallSummary?: AiDependencySummary | null;
  loading?: boolean;
}

function getRiskLabel(risk: AiDependencyRiskLevel, isAssignment: boolean) {
  if (isAssignment) {
    switch (risk) {
      case "high":
        return "의존 우려 높음";
      case "medium":
        return "의존 우려 있음";
      default:
        return "양호";
    }
  }
  switch (risk) {
    case "high":
      return "높음";
    case "medium":
      return "중간";
    default:
      return "낮음";
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
  const isAssignment =
    questionAssessment?.evaluationMode === "assignment" ||
    overallSummary?.evaluationMode === "assignment";

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            {isAssignment ? "리서치 참여 신호" : "AI 의존 신호"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            <p className="text-sm">채점 완료 후 분석 결과가 표시됩니다</p>
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
        ? "리서치 참여 신호"
        : "AI 의존 신호"
      : isAssignment
        ? "리서치 참여 평가"
        : "AI 활용 평가";

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
              <span className="font-medium">전체 세션 해석</span>
              <Badge variant={getRiskVariant(overallSummary.overallRisk)}>
                {isAssignment ? "AI 의존 " : "위험도 "}
                {getRiskLabel(overallSummary.overallRisk, isAssignment)}
              </Badge>
            </div>
            <p className="text-muted-foreground">{overallSummary.summary}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {isAssignment ? "리서치 질문" : "트리거"} {overallSummary.triggerCount}회
              </span>
              <span>
                {isAssignment
                  ? questionAssessment?.recoveryObserved ||
                    overallSummary.recoveryObserved
                    ? "질문 흐름 연결됨"
                    : "질문 연결 제한적"
                  : `회복 ${overallSummary.recoveryObserved ? "관찰됨" : "근거 약함"}`}
              </span>
            </div>
          </div>
        )}

        {questionAssessment && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">현재 문항 해석</span>
              <Badge variant={getRiskVariant(questionAssessment.overallRisk)}>
                {isAssignment ? "AI 의존 " : "위험도 "}
                {getRiskLabel(questionAssessment.overallRisk, isAssignment)}
              </Badge>
            </div>

            <p className="text-muted-foreground">{questionAssessment.summary}</p>

            {isAssignment && metrics ? (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>후속·확장 질문 {metrics.followUpQuestionCount}회</div>
                <div>검증·확인 질문 {metrics.verificationQuestionCount}회</div>
                <div>개념·범위 탐색 {metrics.conceptExplorationCount}회</div>
                <div>답안 위임 요청 {metrics.answerDelegationCount}회</div>
              </div>
            ) : (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>풀이 위임형 요청 {questionAssessment.delegationRequestCount}회</div>
                <div>출발점 의존 {questionAssessment.startingPointDependencyCount}회</div>
                <div>직접 답 요구 {questionAssessment.directAnswerRequestCount}회</div>
                <div>
                  답안 유사도 {(questionAssessment.finalAnswerOverlapScore * 100).toFixed(0)}%
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="flex items-center gap-2 font-medium">
                <RotateCcw className="h-4 w-4 text-primary" />
                {isAssignment
                  ? questionAssessment.recoveryObserved
                    ? "질문 흐름이 이어지며 탐색·검증이 관찰됨"
                    : "질문 연결·검증 흔적이 제한적임"
                  : questionAssessment.recoveryObserved
                    ? "독립 추론 회복이 확인됨"
                    : "독립 추론 회복 근거가 제한적임"}
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
                      ? "리서치 질문 예시"
                      : "근거 문장"
                    : isAssignment
                      ? "평가에 반영된 리서치 질문"
                      : "평가에 반영된 대화 근거"}
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
