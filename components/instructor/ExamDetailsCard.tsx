"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { buildStudentNotice } from "@/lib/student-notice";

interface ExamDetailsCardProps {
  description: string;
  duration: number;
  createdAt: string;
  examCode: string;
  examTitle?: string;
}

export function ExamDetailsCard({
  description,
  duration,
  createdAt,
  examCode,
  examTitle = "",
}: ExamDetailsCardProps) {
  const t = useTranslations("authoring");
  const tExam = useTranslations("exam");
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

  // AC-16 (#85): 교수자가 학생에게 뿌릴 문구를 제품이 대신 써준다.
  // "알아서 공지하세요"라고 하면 대부분 안 하고, 그러면 학생은 AI 질문을
  // 부정행위로 오해한 채 시험을 본다. 대학생 54%가 그렇게 인식한다.
  const handleCopyNotice = async () => {
    try {
      const notice = buildStudentNotice({
        heading: t("examDetailsCard.noticeHeading"),
        examTitle,
        codeLabel: t("examDetailsCard.noticeCodeLabel"),
        examCode,
        policyLines: [
          tExam("preflight.aiDisclosureAllowed"),
          tExam("preflight.aiDisclosureGraded"),
          tExam("preflight.aiDisclosureVisible"),
        ],
        footer: t("examDetailsCard.noticeFooter"),
      });
      await navigator.clipboard.writeText(notice);
      toast.success(t("examDetailsCard.toastNoticeCopied"), {
        id: "copy-exam-notice",
      });
    } catch {
      toast.error(t("examDetailsCard.toastNoticeCopyFailed"), {
        id: "copy-exam-notice-error",
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyNotice}
            className="h-8 mt-2"
          >
            <Megaphone className="w-3 h-3 mr-1" />
            {t("examDetailsCard.buttonCopyNotice")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
