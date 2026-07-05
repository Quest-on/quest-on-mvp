"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldQuestion } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTime } from "@/lib/i18n/format";

export interface SessionQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  rationale?: string;
}

export interface SessionQuizAttempt {
  id: string;
  questions: SessionQuizQuestion[];
  answers: Record<string, number>;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  submitted_at?: string | null;
}

interface SessionQuizResultsCardProps {
  quiz: SessionQuizAttempt;
  /** Omit rationale in compact sidebar mode */
  compact?: boolean;
}

export function SessionQuizResultsCard({
  quiz,
  compact = false,
}: SessionQuizResultsCardProps) {
  const t = useTranslations("grading");
  const locale = useLocale() as "ko" | "en";
  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldQuestion className="w-5 h-5 text-amber-600" />
          {t("sessionQuiz.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            {t("sessionQuiz.scoreBadge", { score: quiz.score ?? 0 })}
          </Badge>
          <Badge variant="secondary">
            {t("sessionQuiz.metaBadge", { questions: quiz.total_questions, seconds: quiz.time_limit_seconds })}
          </Badge>
          {quiz.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {t("sessionQuiz.completedLabel")}{" "}
              {formatDateTime(quiz.submitted_at, locale, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {quiz.questions.map((question, index) => {
            const selectedIndex = quiz.answers?.[question.id];
            const correctIndex = question.correctOptionIndex;
            const isCorrect =
              typeof correctIndex === "number" && selectedIndex === correctIndex;

            return (
              <div key={question.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug">
                    {index + 1}. {question.question}
                  </p>
                  {typeof correctIndex === "number" && (
                    <Badge
                      variant="outline"
                      className={
                        isCorrect
                          ? "bg-green-500/10 text-green-700 dark:text-green-400 shrink-0"
                          : "bg-red-500/10 text-red-700 dark:text-red-400 shrink-0"
                      }
                    >
                      {isCorrect ? t("sessionQuiz.badgeCorrect") : t("sessionQuiz.badgeWrong")}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("sessionQuiz.choiceLabel")}{" "}
                  {typeof selectedIndex === "number"
                    ? question.options[selectedIndex] || t("sessionQuiz.noAnswer")
                    : t("sessionQuiz.noAnswer")}
                </p>
                {typeof correctIndex === "number" && (
                  <p className="text-xs text-muted-foreground">
                    {t("sessionQuiz.answerLabel")} {question.options[correctIndex]}
                  </p>
                )}
                {!compact && question.rationale && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("sessionQuiz.rationaleLabel")} {question.rationale}
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
