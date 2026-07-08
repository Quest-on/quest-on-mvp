"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
// import { Button } from "@/components/ui/button";
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

export function QuestionsListCard({ questions }: QuestionsListCardProps) {
  const t = useTranslations("authoring");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("questionsListCard.cardTitle", { count: questions.length })}</CardTitle>
        <CardDescription>{t("questionsListCard.cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("questionsListCard.emptyState")}</p>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{t("questionsListCard.questionTitle", { index: index + 1 })}</h4>
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
                <RichTextViewer
                  content={question.text}
                  className="text-sm text-muted-foreground"
                />
              </div>
            ))
          )}
        </div>
        {/* <div className="mt-4">
          <Button variant="outline" size="sm">
            문제 추가
          </Button>
        </div> */}
      </CardContent>
    </Card>
  );
}
