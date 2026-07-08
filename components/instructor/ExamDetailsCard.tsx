"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface ExamDetailsCardProps {
  description: string;
  duration: number;
  createdAt: string;
  examCode: string;
}

export function ExamDetailsCard({
  description,
  duration,
  createdAt,
  examCode,
}: ExamDetailsCardProps) {
  const t = useTranslations("authoring");
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(examCode);
      toast.success(t("examDetailsCard.toastCodeCopied"), {
        id: "copy-exam-code", // 중복 방지
      });
    } catch {
      toast.error(t("examDetailsCard.toastCodeCopyFailed"), {
        id: "copy-exam-code-error",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("examDetailsCard.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="font-medium">{t("examDetailsCard.labelDescription")}</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-medium">{t("examDetailsCard.labelTime")}</Label>
            <p className="text-sm text-muted-foreground">{t("examDetailsCard.durationMin", { duration })}</p>
          </div>
        </div>
        <div>
          <Label className="font-medium">{t("examDetailsCard.labelCreatedAt")}</Label>
          <p className="text-sm text-muted-foreground">
            {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <Label className="font-medium">{t("examDetailsCard.labelExamCode")}</Label>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground exam-code">
              {examCode}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="h-8"
            >
              <Copy className="w-3 h-3 mr-1" />
              {t("examDetailsCard.buttonCopy")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
