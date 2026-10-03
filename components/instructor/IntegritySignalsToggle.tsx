"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface IntegritySignalsToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /**
   * 이 문항에서 의심 표시 대상인 기록 수(탭 전환 + 외부 붙여넣기).
   * 꺼져 있고 1건 이상이면 "숨긴 기록 N건"을 보여, 기록이 없어서 깨끗한 것과
   * 숨겨서 깨끗한 것을 구분하게 한다.
   */
  signalCount?: number;
}

/**
 * 채점 화면의 '의심 표시' 스위치. 최종 답안 카드 바로 위에 둔다.
 * 켜짐이면 탭 전환과 외부 붙여넣기 표시를 보이고, 꺼짐이면 숨긴다(기록은 그대로).
 */
export function IntegritySignalsToggle({
  checked,
  onCheckedChange,
  signalCount = 0,
}: IntegritySignalsToggleProps) {
  const t = useTranslations("authoring");
  const switchId = useId();
  const hintId = useId();

  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <div className="space-y-1">
        <Label htmlFor={switchId} className="cursor-pointer">
          {t("finalAnswerCard.integrityToggleLabel")}
        </Label>
        <p id={hintId} className="type-hint">
          {t("finalAnswerCard.integrityToggleHint")}
        </p>
        {!checked && signalCount > 0 && (
          <p className="type-meta">
            {t("finalAnswerCard.integrityHiddenCount", { count: signalCount })}
          </p>
        )}
      </div>
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hintId}
      />
    </div>
  );
}
