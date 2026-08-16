"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
  ai_context?: string;
}

interface QuestionPromptCardProps {
  question: Question | undefined;
  questionNumber: number;
}

export function QuestionPromptCard({
  question,
  questionNumber,
}: QuestionPromptCardProps) {
  const t = useTranslations("authoring");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          {t("questionPromptCard.cardTitle", { number: questionNumber })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {question ? (
          <div className="bg-muted rounded-lg p-4">
            <RichTextViewer content={question.prompt} className="text-sm" />
            {question.ai_context && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t("questionPromptCard.labelAiContext")}</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {question.ai_context}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-destructive">
            <p>{t("questionPromptCard.errorLoad")}</p>
            <p className="text-sm mt-2 text-muted-foreground">
              {t("questionPromptCard.errorIndex", { index: questionNumber - 1 })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

