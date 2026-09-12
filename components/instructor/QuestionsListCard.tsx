"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";

interface Question {
  id: string;
  text: string;
  type: string;
}

interface QuestionsListCardProps {
  questions: Question[];
}

/**
 * 문항 목록.
 *
 * 예전에는 `Card` 안에 제목("문제 (1)")과 설명("시험 문제 검토 및 편집")을 달고
 * 있었다. 그런데 이 컴포넌트는 이미 "문제" 제목이 붙은 섹션 안에서 렌더된다 —
 * 화면에는 제목 계층이 넷이었다:
 *
 *   문제 보기 → 문제 (1) → 시험 문제 검토 및 편집 → 문제 1
 *
 * 가운데 둘은 아무것도 더하지 않는다. 특히 "시험 문제 검토 및 편집"은 제목을
 * 되풀이하는 설명이다(`tasks/lessons.md` 2026-08-16). 바깥 껍데기를 걷어내고
 * 문항 자체만 남긴다.
 */
export function QuestionsListCard({ questions }: QuestionsListCardProps) {
  const t = useTranslations("authoring");

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p>{t("questionsListCard.emptyState")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-medium">
              {t("questionsListCard.questionTitle", { index: index + 1 })}
            </h3>
            <Badge variant="outline">
              {question.type === "essay"
                ? t("questionsListCard.typeEssay")
                : question.type === "short-answer"
                ? t("questionsListCard.typeShortAnswer")
                : question.type === "multiple-choice"
                ? t("questionsListCard.typeMcq")
                : question.type}
            </Badge>
          </div>
          <RichTextViewer content={question.text} className="type-hint" />
        </div>
      ))}
    </div>
  );
}
