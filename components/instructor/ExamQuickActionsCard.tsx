"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface ExamQuickActionsCardProps {
  examCode: string;
}

export function ExamQuickActionsCard({ examCode }: ExamQuickActionsCardProps) {
  const t = useTranslations("authoring");
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(examCode);
      toast.success(t("examQuickActionsCard.toastCodeCopied"), {
        id: "copy-exam-code", // 중복 방지
      });
    } catch {
      toast.error(t("examQuickActionsCard.toastCodeCopyFailed"), {
        id: "copy-exam-code-error",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("examQuickActionsCard.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button className="w-full" variant="outline" onClick={handleCopyCode}>
          <Copy className="w-4 h-4 mr-2" />
          {t("examQuickActionsCard.buttonCopyCode")}
        </Button>
      </CardContent>
    </Card>
  );
}
