"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Pencil, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinalAnswerButtonProps {
  hasContent: boolean;
  attention: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * 우측 하단 floating 버튼.
 * - 비어있고 attention=true: shake + 빨간 테두리 + 펄스 링 (제출 차단 시 강조)
 * - 비어있음 (기본): 점선 테두리 + 펜 아이콘
 * - 작성됨: 초록 체크 아이콘
 */
export function FinalAnswerButton({
  hasContent,
  attention,
  onClick,
  disabled,
}: FinalAnswerButtonProps) {
  const t = useTranslations("assignment");
  return (
    <div className="fixed bottom-6 right-6 z-40 pointer-events-none">
      <div className="relative pointer-events-auto">
        {/* attention 시 펄스 링 */}
        {attention && !hasContent && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl border-2 border-destructive animate-ping"
          />
        )}
        <Button
          onClick={onClick}
          disabled={disabled}
          aria-label={hasContent ? t("finalAnswerButton.ariaHasContent") : t("finalAnswerButton.ariaNoContent")}
          className={cn(
            "h-auto px-4 py-3 rounded-2xl rounded-br-sm shadow-lg hover:shadow-xl transition-all duration-200 gap-2 border-2 font-medium",
            hasContent
              ? "bg-success-surface hover:bg-success-surface text-white border-emerald-700"
              : "bg-background hover:bg-muted text-foreground",
            !hasContent && !attention && "border-dashed border-primary/60",
            !hasContent && attention && "border-destructive bg-destructive/10 animate-shake",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          {hasContent ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Pencil className="w-5 h-5" />
          )}
          <span>{hasContent ? t("finalAnswerButton.labelHasContent") : t("finalAnswerButton.labelNoContent")}</span>
        </Button>
      </div>
    </div>
  );
}
