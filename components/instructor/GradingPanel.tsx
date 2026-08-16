"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Check, Sparkles, Quote, Plus, Minus, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { StageKey, QuestionSummaryData } from "@/lib/types/grading";
import { useTranslations } from "next-intl";

interface GradingPanelProps {
  questionNumber: number;
  stageScores: Partial<Record<StageKey, number>>;
  stageComments: Partial<Record<StageKey, string>>;
  overallScore: number;
  isGraded: boolean;
  isAiGradedOnly?: boolean; // 가채점만 있는 경우
  aiGradedScore?: number; // 가채점 점수
  aiSummary?: QuestionSummaryData | null; // 문제별 AI 종합평가 (read-only 표시)
  showAiSummary?: boolean;
  saving: boolean;
  isGradingInProgress?: boolean;
  mode?: "exam" | "assignment";
  onStageScoreChange: (stage: StageKey, value: number) => void;
  onStageCommentChange: (stage: StageKey, value: string) => void;
  onOverallScoreChange: (value: number) => void;
  onAcceptAiScore?: () => void; // 가채점 점수 승인 핸들러
  onSave: () => void;
}

const SENTIMENT_CLASS: Record<"positive" | "negative" | "neutral", string> = {
  positive: "bg-green-100 text-green-700 border-green-200",
  negative: "bg-destructive/15 text-destructive border-destructive",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

export function GradingPanel({
  questionNumber,
  // stageScores,
  // stageComments,
  overallScore,
  isGraded,
  isAiGradedOnly = false,
  aiGradedScore,
  aiSummary,
  showAiSummary = true,
  saving,
  isGradingInProgress = false,
  mode = "exam",
  // onStageScoreChange,
  // onStageCommentChange,
  onOverallScoreChange,
  onAcceptAiScore,
  onSave,
}: GradingPanelProps) {
  const t = useTranslations("grading");
  // 입력 중에는 문자열로 관리하여 "020" 같은 문제 방지
  const [scoreInput, setScoreInput] = useState<string>(overallScore.toString());
  const isAssignmentMode = mode === "assignment";

  // overallScore가 외부에서 변경되면 (예: 다른 문제로 이동) input 값 업데이트
  useEffect(() => {
    setScoreInput(overallScore.toString());
  }, [overallScore]);

  if (isGradingInProgress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-600" />
            {t("gradingPanel.inProgressTitle", { number: questionNumber })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">{t("gradingPanel.inProgressDesc")}</p>
            <p className="text-xs text-muted-foreground">
              {t("gradingPanel.inProgressNote")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-600" />
          {t("gradingPanel.title", { number: questionNumber })}
        </CardTitle>
        <CardDescription>
          {isAssignmentMode
            ? t("gradingPanel.descAssignment")
            : isAiGradedOnly
            ? t("gradingPanel.descAiOnly")
            : isGraded && overallScore > 0
            ? t("gradingPanel.descAiDone")
            : t("gradingPanel.descDefault")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* <div className="space-y-4">
          {stageOrder.map((stageKey) => {
            const stage = stageMeta[stageKey];
            const stageScore = stageScores[stageKey] ?? "";
            const stageComment = stageComments[stageKey] ?? "";

            return (
              <div
                key={stageKey}
                className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-start gap-3">
                  <stage.icon className={`h-5 w-5 ${stage.accentClass}`} />
                  <div>
                    <h4 className="text-sm font-semibold">{stage.label}</h4>
                    <p className="text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label
                      htmlFor={`${stageKey}-score-${questionNumber}`}
                      className="text-xs font-medium"
                    >
                      점수 (0-100)
                    </Label>
                    <input
                      type="number"
                      id={`${stageKey}-score-${questionNumber}`}
                      min="0"
                      max="100"
                      value={stageScore}
                      onChange={(e) =>
                        onStageScoreChange(
                          stageKey,
                          Number.isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label
                      htmlFor={`${stageKey}-comment-${questionNumber}`}
                      className="text-xs font-medium"
                    >
                      상세 피드백
                    </Label>
                    <Textarea
                      id={`${stageKey}-comment-${questionNumber}`}
                      value={stageComment}
                      onChange={(e) =>
                        onStageCommentChange(stageKey, e.target.value)
                      }
                      placeholder={t("gradingPanel.stageCommentPlaceholder")}
                      className="mt-1 min-h-[100px] resize-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Separator /> */}

        <div className="space-y-4">
          <div>
            <Label htmlFor="score" className="text-sm font-medium">
              {t("gradingPanel.scoreLabel")}
            </Label>
            <div className="mt-1 flex gap-2">
              <input
                  type="number"
                  id="score"
                  data-testid="grade-score-input"
                  min="0"
                  max="100"
                  value={scoreInput}
                  onFocus={(e) => {
                    // 값이 0일 때만 전체 선택하여 쉽게 삭제되도록 함
                    if (scoreInput === "0") {
                      e.target.select();
                    }
                  }}
                  onChange={(e) => {
                    let value = e.target.value;

                    // 빈 문자열 허용 (입력 중)
                    if (value === "") {
                      setScoreInput("");
                      return;
                    }

                    // 숫자가 아닌 문자는 무시
                    if (!/^\d*$/.test(value)) {
                      return;
                    }

                    // "020", "002" 같은 경우를 방지: 0으로 시작하는 여러 자리 숫자는 첫 번째 0 제거
                    // 단, "0" 자체는 허용
                    if (value.length > 1 && value.startsWith("0")) {
                      value = value.replace(/^0+/, "") || "0";
                    }

                    // 입력 중에는 문자열로 유지
                    setScoreInput(value);

                    // 숫자로 변환하여 범위 체크 및 부모 컴포넌트에 전달
                    const numValue = Number(value);
                    if (!Number.isNaN(numValue)) {
                      // 0-100 범위로 제한
                      const clampedValue = Math.max(0, Math.min(100, numValue));
                      onOverallScoreChange(clampedValue);

                      // 클램핑된 값이 원래 값과 다르면 input 업데이트
                      if (clampedValue !== numValue) {
                        setScoreInput(clampedValue.toString());
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;

                    // blur 시 빈 값이거나 유효하지 않은 값이면 0으로 설정
                    if (value === "" || Number.isNaN(Number(value))) {
                      setScoreInput("0");
                      onOverallScoreChange(0);
                      return;
                    }

                    const numValue = Number(value);
                    // 0-100 범위로 제한하고 정규화
                    const clampedValue = Math.max(0, Math.min(100, numValue));
                    setScoreInput(clampedValue.toString());
                    onOverallScoreChange(clampedValue);
                  }}
                  className={`flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isAiGradedOnly ? "bg-gray-100 text-gray-500" : ""
                  }`}
                />
              {isAiGradedOnly && aiGradedScore !== undefined && onAcceptAiScore && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onAcceptAiScore}
                  className="shrink-0"
                  title={t("gradingPanel.acceptAiScoreTitle")}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
            {isAiGradedOnly && aiGradedScore !== undefined && (
              <p className="text-xs text-gray-500 mt-1">
                {t("gradingPanel.aiScoreHint", { score: aiGradedScore })}
              </p>
            )}
          </div>

        </div>

        {showAiSummary && aiSummary && (
          <div
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
            data-testid="grade-ai-summary"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <h4 className="text-sm font-semibold">{t("gradingPanel.aiSummaryTitle")}</h4>
              <span
                className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${SENTIMENT_CLASS[aiSummary.sentiment]}`}
              >
                {t(`gradingPanel.sentiment${aiSummary.sentiment.charAt(0).toUpperCase() + aiSummary.sentiment.slice(1)}` as `gradingPanel.sentiment${"Positive"|"Negative"|"Neutral"}`)}
              </span>
            </div>

            {aiSummary.summary && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {aiSummary.summary}
              </p>
            )}

            {aiSummary.keyQuotes && aiSummary.keyQuotes.length > 0 && (
              <div className="space-y-1.5">
                {aiSummary.keyQuotes.map((quote, idx) => (
                  <div
                    key={idx}
                    className="flex gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-2"
                  >
                    <Quote className="h-3.5 w-3.5 text-yellow-700 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 italic">{quote}</p>
                  </div>
                ))}
              </div>
            )}

            {aiSummary.strengths.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Plus className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700">{t("questionAiSummary.strengths")}</span>
                </div>
                <ul className="space-y-1 pl-5 list-disc">
                  {aiSummary.strengths.map((s, idx) => (
                    <li key={idx} className="text-xs text-gray-700">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.weaknesses.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Minus className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700">{t("questionAiSummary.weaknesses")}</span>
                </div>
                <ul className="space-y-1 pl-5 list-disc">
                  {aiSummary.weaknesses.map((w, idx) => (
                    <li key={idx} className="text-xs text-gray-700">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={onSave}
          disabled={saving || isAiGradedOnly}
          className="w-full"
          data-testid="grade-save-btn"
        >
          {saving
            ? t("gradingPanel.savingLabel")
            : isAiGradedOnly
            ? t("gradingPanel.enterScoreButton")
            : t("gradingPanel.saveButton")}
        </Button>

        {isGraded && (
          <div
            className={`text-sm text-center ${
              isAiGradedOnly
                ? "text-gray-500"
                : overallScore > 0
                ? "text-green-600"
                : "text-green-600"
            }`}
          >
            {isAssignmentMode
              ? t("gradingPanel.currentScore", { score: overallScore })
              : isAiGradedOnly
              ? t("gradingPanel.badgeAiOnly")
              : overallScore > 0
              ? t("gradingPanel.badgeAiDone")
              : t("gradingPanel.badgeDone")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
