"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ObjectiveGradeCardProps {
  type: string;
  options?: string[];
  correctOptionIndex?: number;
  /** 학생이 제출한 답안 문자열 — 선택지 인덱스("2"). */
  studentAnswer?: string;
  embedded?: boolean;
}

/**
 * 강사 채점 검토 화면의 객관식/OX 문제 표시 카드.
 *
 * 학생이 고른 선택지와 정답 선택지를 나란히 보여준다. 채팅 단계 UI 없음 —
 * 객관식은 결정론적으로 채점되므로 강사는 결과만 확인한다.
 */
export function ObjectiveGradeCard({
  type,
  options,
  correctOptionIndex,
  studentAnswer,
  embedded = false,
}: ObjectiveGradeCardProps) {
  const t = useTranslations("grading");
  const resolvedOptions =
    options && options.length > 0
      ? options
      : type === "true-false"
        ? ["O", "X"]
        : [];

  const selectedIndex = (() => {
    const raw = (studentAnswer ?? "").trim();
    if (!raw) return null;

    const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;

    const optionIndex = resolvedOptions.findIndex((option) => option.trim() === raw);
    return optionIndex >= 0 ? optionIndex : null;
  })();

  const hasCorrect =
    typeof correctOptionIndex === "number" && correctOptionIndex >= 0;
  const isCorrect =
    hasCorrect && selectedIndex !== null && selectedIndex === correctOptionIndex;

  const titleBlock = (
    <div className={embedded ? "mb-4" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          {type === "true-false" ? t("objectiveGrade.titleTrueFalse") : t("objectiveGrade.titleMultipleChoice")}
        </h3>
        {hasCorrect && selectedIndex !== null && (
          <Badge variant={isCorrect ? "default" : "destructive"}>
            {isCorrect ? t("objectiveGrade.badgeCorrect") : t("objectiveGrade.badgeWrong")}
          </Badge>
        )}
        {selectedIndex === null && (
          <Badge variant="outline">{t("objectiveGrade.badgeNoAnswer")}</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("objectiveGrade.description")}
      </p>
    </div>
  );

  const content = (
    <>
      {resolvedOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("objectiveGrade.noOptions")}
        </p>
      ) : (
        <ul className="space-y-2">
          {resolvedOptions.map((option, index) => {
            const isStudentPick = selectedIndex === index;
            const isAnswer = correctOptionIndex === index;
            return (
              <li
                key={index}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 text-sm",
                  isAnswer
                    ? "border-success-border bg-success-surface"
                    : isStudentPick
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="flex-1">{option}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isStudentPick && (
                    <Badge variant="outline" className="gap-1">
                      {isAnswer ? (
                        <CheckCircle2 className="h-3 w-3 text-success-text" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      {t("objectiveGrade.badgeStudentPick")}
                    </Badge>
                  )}
                  {isAnswer && (
                    <Badge className="bg-success-solid hover:bg-success-solid">
                      {t("objectiveGrade.badgeAnswer")}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!hasCorrect && (
        <p className="mt-3 text-sm text-warning-text">
          {t("objectiveGrade.noCorrectInfo")}
        </p>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border bg-background p-4">
        {titleBlock}
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          {type === "true-false" ? t("objectiveGrade.titleTrueFalse") : t("objectiveGrade.titleMultipleChoice")}
          {hasCorrect && selectedIndex !== null && (
            <Badge variant={isCorrect ? "default" : "destructive"}>
              {isCorrect ? t("objectiveGrade.badgeCorrect") : t("objectiveGrade.badgeWrong")}
            </Badge>
          )}
          {selectedIndex === null && (
            <Badge variant="outline">{t("objectiveGrade.badgeNoAnswer")}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t("objectiveGrade.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
