"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type MaterialFileTone = "neutral" | "success" | "danger";

const TONE_CLASS: Record<MaterialFileTone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success-text",
  danger: "text-destructive",
};

interface MaterialFileRowProps {
  name: string;
  /** 파일 종류 또는 업로드 상태 아이콘. */
  icon: ReactNode;
  /** 업로드 상태 글자(새로 올린 파일만). */
  statusText?: string;
  tone?: MaterialFileTone;
  /**
   * 학생 공개 스위치 (#544). `onShareChange` 를 넘기지 않으면 스위치를 그리지 않는다.
   * `canShare` 가 false 면(업로드가 끝나지 않았거나 실패) 비활성이다. 공개할 URL 이 아직 없다.
   */
  shared?: boolean;
  canShare?: boolean;
  onShareChange?: (shared: boolean) => void;
  /** 스위치를 설명하는 도움말 요소의 id. 스크린리더가 스위치와 함께 읽는다. */
  shareHelpId?: string;
  onRemove?: () => void;
  removeAriaLabel: string;
}

/**
 * 수업 자료 목록의 한 행: 아이콘, 이름, 상태, 학생 공개 스위치, 삭제.
 *
 * 생성 화면의 새 파일과 수정 화면의 기존 파일이 같은 행을 쓴다. 넓은 화면에서는 한 줄이고,
 * 좁은 화면에서는 공개 스위치가 둘째 줄로 내려간다. 스위치와 글자를 하나의 label 로 감싸
 * 좁은 화면에서도 누를 곳이 넉넉하다. 스위치의 접근성 이름에는 파일 이름이 들어가
 * "학생에게 공개" 가 여러 번 나와도 구분된다.
 */
export function MaterialFileRow({
  name,
  icon,
  statusText,
  tone = "neutral",
  shared = false,
  canShare = true,
  onShareChange,
  shareHelpId,
  onRemove,
  removeAriaLabel,
}: MaterialFileRowProps) {
  const t = useTranslations("authoring");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("flex shrink-0 items-center", TONE_CLASS[tone])}>{icon}</span>
        <span className="truncate text-sm">{name}</span>
        {statusText && (
          <span className={cn("type-meta shrink-0", tone !== "neutral" && TONE_CLASS[tone])}>
            {statusText}
          </span>
        )}
      </div>
      {onShareChange && (
        <Label
          className={cn(
            "order-last min-h-11 basis-full cursor-pointer text-sm font-normal sm:order-none sm:min-h-0 sm:basis-auto",
            !canShare && "cursor-not-allowed opacity-50",
          )}
        >
          <Switch
            checked={shared}
            disabled={!canShare}
            onCheckedChange={(checked) => onShareChange(checked)}
            aria-label={t("simpleExamAuthoringForm.materialShareAria", { name })}
            aria-describedby={shareHelpId}
          />
          {t("simpleExamAuthoringForm.materialShareLabel")}
        </Label>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={onRemove}
          aria-label={removeAriaLabel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}
