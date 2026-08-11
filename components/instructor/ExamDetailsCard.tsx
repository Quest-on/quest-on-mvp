"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { buildStudentNotice, studentNoticePolicyLines } from "@/lib/student-notice";

interface ExamDetailsCardProps {
  description: string;
  duration: number;
  createdAt: string;
  examCode: string;
  /** 발행 한도에 걸려 코드 반출을 막아야 하는가 (이슈 #84). */
  codeGateBlocked?: boolean;
  examTitle?: string;
  /**
   * 이 시험에서 학생이 AI 채팅을 쓸 수 있는가(= 서술형/CASE 문항이 있는가).
   *
   * 선택 prop 이 아니라 필수다. 기본값을 두면 호출부가 빠뜨렸을 때 조용히
   * 잘못된 공지문이 나간다 — MCQ/OX 전용 시험에 "AI에게 질문하세요"라고
   * 적힌 안내를 뿌리는 것이 정확히 그 사고다.
   */
  aiChatAvailable: boolean;
}

export function ExamDetailsCard({
  description,
  duration,
  createdAt,
  examCode,
  codeGateBlocked,
  examTitle = "",
  aiChatAvailable,
}: ExamDetailsCardProps) {
  const t = useTranslations("authoring");
  const tExam = useTranslations("exam");
  const handleCopyCode = async () => {
    // 발행 한도에 걸린 미발행 시험의 코드는 복사시키지 않는다 (이슈 #84).
    // 복사해 수업 자료에 붙인 뒤에 막으면 수업 중에 학생 전원이 튕긴다.
    if (codeGateBlocked) {
      toast.error(t("examDetailsCard.toastCodeBlocked"), {
        id: "copy-exam-code-blocked",
      });
      return;
    }
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
        // MCQ/OX 전용 시험은 학생 화면에 AI 채팅이 아예 렌더되지 않는다
        // (exam/[code]/page.tsx 가 !isCurrentObjective 일 때만 ExamChatSidebar 노출).
        // 그런 시험의 공지문에 "AI에게 질문하세요"를 넣으면 문구 자체가 거짓이 된다.
        // 판정은 studentNoticePolicyLines 가 갖고 있고 테스트로 고정돼 있다.
        policyLines: studentNoticePolicyLines(aiChatAvailable, {
          allowed: tExam("preflight.aiDisclosureAllowed"),
          graded: tExam("preflight.aiDisclosureGraded"),
          visible: tExam("preflight.aiDisclosureVisible"),
        }),
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
