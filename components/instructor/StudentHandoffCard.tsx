"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { ExamCode, resolveCodeGate, type ExamCodeQuota } from "@/components/instructor/ExamCode";
import { buildStudentNotice, studentNoticePolicyLines } from "@/lib/student-notice";
import { cn } from "@/lib/utils";

/**
 * 학생에게 시험을 건네는 한 자리 (이슈 #85 / AC-16 의 후속).
 *
 * 예전에는 입장 코드와 "학생 공지문 복사"가 접힌 아코디언 → 카드 → 카드 맨 아래에
 * 묻혀 있었다. 공지문은 이 화면에서 제일 값어치 있는 산출물인데(학생이 AI 사용을
 * 부정행위로 오해한 채 시험을 보는 걸 막는 유일한 수단) 가장 안 보이는 자리였다.
 *
 * 그리고 "공지문 복사"라는 버튼만으로는 무엇이 복사되는지 알 수 없었다. 공지문은
 * 여덟 줄짜리 평문이다 — **그냥 보여주면 설명이 필요 없다.**
 *
 * **미리보기와 클립보드는 같은 문자열이어야 한다.** 두 벌로 만들면 한쪽만 고쳐졌을 때
 * 교수자가 화면에서 본 것과 다른 글이 학생에게 나간다. 그래서 `notice` 를 한 번만
 * 만들어 렌더와 복사가 같은 값을 쓴다.
 *
 * **차단이면 문자열 자체를 만들지 않는다.** 공지문 안에 코드가 들어가므로, 코드
 * 복사만 막고 미리보기를 열어 두면 그대로 우회로다. `null` 하나로 미리보기와 복사
 * 버튼이 동시에 사라진다 — 조건을 두 군데 두면 한쪽이 반드시 빠진다.
 */
export type StudentHandoffCardProps = {
  examCode: string;
  examTitle: string;
  /**
   * 이 시험에서 학생이 AI 채팅을 쓸 수 있는가(= 서술형/CASE 문항이 있는가).
   *
   * 선택 prop 이 아니라 필수다. 기본값을 두면 호출부가 빠뜨렸을 때 조용히 잘못된
   * 공지문이 나간다 — MCQ/OX 전용 시험에 "AI에게 질문하세요"라고 적힌 안내를
   * 뿌리는 것이 정확히 그 사고다.
   */
  aiChatAvailable: boolean;
  /** 발행·학생 한도 상태. 없으면 게이트가 열린 것으로 본다(fail-open). */
  quota?: ExamCodeQuota;
  /**
   * `full` 은 공지문 본문까지 펼친다(배포 단계).
   * `compact` 는 코드와 복사 버튼만 남긴다 — 시험이 이미 돌고 있으면 지각 입장자
   * 때문에 코드는 계속 필요하지만, 화면의 주인공은 학생 목록이어야 한다.
   */
  variant?: "full" | "compact";
  className?: string;
};

export function StudentHandoffCard({
  examCode,
  examTitle,
  aiChatAvailable,
  quota,
  variant = "full",
  className,
}: StudentHandoffCardProps) {
  const t = useTranslations("authoring");
  const tExam = useTranslations("exam");

  const blocked = resolveCodeGate(quota) === "blocked";

  const notice = useMemo(() => {
    if (blocked) return null;
    return buildStudentNotice({
      heading: t("studentHandoff.noticeHeading"),
      examTitle,
      codeLabel: t("studentHandoff.noticeCodeLabel"),
      examCode,
      // MCQ/OX 전용 시험에는 채팅을 권하지 않고, 외부 AI 금지와 기록 범위를
      // 알려야 학생이 AI 정책 없이 시험에 들어가는 일이 없다.
      policyLines: studentNoticePolicyLines(aiChatAvailable, {
        allowed: tExam("preflight.aiDisclosureAllowed"),
        graded: tExam("preflight.aiDisclosureGraded"),
        visible: tExam("preflight.aiDisclosureVisible"),
        unavailable: tExam("preflight.aiDisclosureUnavailable"),
        externalAiProhibited: tExam("preflight.aiDisclosureExternalAiProhibited"),
        activityRecorded: tExam("preflight.aiDisclosureActivityRecorded"),
      }),
      footer: t("studentHandoff.noticeFooter"),
    });
  }, [blocked, examTitle, examCode, aiChatAvailable, t, tExam]);

  const handleCopyNotice = async () => {
    if (!notice) return;
    try {
      await navigator.clipboard.writeText(notice);
      toast.success(t("studentHandoff.toastNoticeCopied"), {
        id: "copy-exam-notice",
      });
    } catch {
      toast.error(t("studentHandoff.toastNoticeCopyFailed"), {
        id: "copy-exam-notice-error",
      });
    }
  };

  const copyButton = notice ? (
    <Button variant="outline" size="sm" onClick={handleCopyNotice}>
      <Megaphone className="h-4 w-4 mr-1.5" />
      {t("studentHandoff.copyNotice")}
    </Button>
  ) : null;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3",
          className
        )}
      >
        <span className="type-field-label">{t("studentHandoff.codeLabel")}</span>
        <ExamCode code={examCode} quota={quota} />
        {copyButton}
      </div>
    );
  }

  return (
    <section className={cn("rounded-lg border p-4 space-y-4", className)}>
      <div>
        <h2 className="font-semibold">{t("studentHandoff.title")}</h2>
        {/*
          부제는 "아래 공지문을 그대로 복사해…" 라고 말한다. 차단이면 아래에
          공지문이 없다(`notice === null`). 없는 것을 복사하라고 적지 않는다 —
          같은 화면의 차단 패널이 대신 사유와 해제 방법을 말한다.
        */}
        {notice && <p className="type-hint">{t("studentHandoff.subtitle")}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="type-field-label">{t("studentHandoff.codeLabel")}</span>
        <ExamCode code={examCode} quota={quota} />
      </div>

      {notice && (
        <div className="space-y-2">
          {/*
            평문 그대로 보여준다. 교수자가 실제로 쓰는 채널(LMS 공지, 카카오톡,
            이메일)이 전부 다른 서식을 쓰므로 공지문은 마크다운을 넣지 않는다 —
            미리보기도 같은 이유로 꾸미지 않는다. 화면에서 본 것이 붙여넣은 것이다.
          */}
          <pre
            data-testid="student-notice-preview"
            className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans text-sm text-foreground"
          >
            {notice}
          </pre>
          <div className="flex justify-end">{copyButton}</div>
        </div>
      )}
    </section>
  );
}
