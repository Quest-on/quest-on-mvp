"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldQuestion } from "lucide-react";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface AssignmentQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  rationale?: string;
}

export interface AssignmentQuiz {
  id: string;
  questions: AssignmentQuizQuestion[];
  answers: Record<string, number>;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  status: string;
}

/**
 * 타임어택 퀴즈 결과(읽기 전용) — 학생 리포트와 마감 과제 열람 뷰에서 공유.
 * 점수/정오답은 퀴즈 자체의 채점 결과이며, 과제 본채점(grades)과는 무관하다.
 */
export function AssignmentQuizResult({ quiz }: { quiz: AssignmentQuiz }) {
  const t = useTranslations("report.quizResult");
  const locale = useLocale() as Locale;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldQuestion className="w-5 h-5 text-amber-600" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="bg-amber-500/10 text-warning-text">
            {t("score", { score: quiz.score ?? 0 })}
          </Badge>
          <Badge variant="secondary">
            {t("meta", {
              totalQuestions: quiz.total_questions,
              timeLimitSeconds: quiz.time_limit_seconds,
            })}
          </Badge>
          {quiz.submitted_at && (
            <span className="text-sm text-muted-foreground">
              {t("completedAt", { date: formatDateTime(quiz.submitted_at, locale) })}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {quiz.questions.map((question, index) => {
            const selectedIndex = quiz.answers?.[question.id];
            const correctIndex = question.correctOptionIndex;
            const isCorrect =
              typeof correctIndex === "number" && selectedIndex === correctIndex;

            return (
              <div key={question.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-sm">
                    {index + 1}. {question.question}
                  </p>
                  {typeof correctIndex === "number" && (
                    <Badge
                      variant="outline"
                      className={
                        isCorrect
                          ? "bg-green-500/10 text-success-text"
                          : "bg-red-500/10 text-destructive"
                      }
                    >
                      {isCorrect ? t("correct") : t("incorrect")}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("selected")}{" "}
                  {typeof selectedIndex === "number"
                    ? question.options[selectedIndex] || t("noAnswer")
                    : t("noAnswer")}
                </p>
                {typeof correctIndex === "number" && (
                  <p className="text-sm text-muted-foreground">
                    {t("correctAnswer")} {question.options[correctIndex]}
                  </p>
                )}
                {question.rationale && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("rationale")} {question.rationale}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
