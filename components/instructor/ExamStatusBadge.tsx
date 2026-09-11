"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

/**
 * 시험 상태 배지.
 *
 * `ExamControlButtons` 안에서 시작/종료 버튼과 한 줄에 붙어 있었다. 그러니 버튼
 * 무리 사이에 낀 회색 알약이 돼서 누를 수 있는 것처럼 보였다. 상태는 행동이
 * 아니라 제목의 속성이므로 제목 아래 메타 줄로 옮긴다.
 */
const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-warning-subtle text-warning-text",
  draft: "bg-secondary text-secondary-foreground",
  joinable: "bg-info-subtle text-info-text",
  running: "bg-success-subtle text-success-text",
  entry_closed: "bg-warning-subtle text-warning-text",
  closed: "bg-secondary text-secondary-foreground",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  scheduled: "statusScheduled",
  draft: "statusDraft",
  joinable: "statusJoinable",
  running: "statusRunning",
  entry_closed: "statusEntryClosed",
  closed: "statusClosed",
};

export function ExamStatusBadge({ status }: { status: string }) {
  const t = useTranslations("authoring.examControlButtons");
  const labelKey = STATUS_LABEL_KEY[status];

  return (
    <Badge
      variant="secondary"
      className={STATUS_TONE[status] ?? "bg-secondary text-secondary-foreground"}
    >
      {/* 모르는 status 를 화면에 그대로 뱉지 않는다. 교수자에게 `entry_closed_v2`
          같은 내부 값을 보여 봐야 알 수 있는 게 없다. */}
      {labelKey ? t(labelKey) : t("statusUnknown")}
    </Badge>
  );
}
