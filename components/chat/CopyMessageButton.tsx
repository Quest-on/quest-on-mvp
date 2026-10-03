"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInternalCopyScope } from "@/components/providers/InternalCopyScopeProvider";
import { wrapInternalCopy } from "@/lib/internal-copy";
import toast from "react-hot-toast";

interface CopyMessageButtonProps {
  text: string;
  className?: string;
}

export function CopyMessageButton({ text, className }: CopyMessageButtonProps) {
  const t = useTranslations("assignment");
  const [copied, setCopied] = useState(false);

  // 내부 복사 표식은 시험 응시 화면(범위가 있을 때)에서만 붙인다(#560). 이 버튼은 과제 AI 대화, 과제 기록,
  // 시험 리포트, 교수 화면에도 있어서, 거기서 복사한 글이 시험 답안에서 내부 복사로 기록되면 안 된다.
  const scope = useInternalCopyScope();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scope === null ? text : wrapInternalCopy(text, scope));
      setCopied(true);
      toast.success(t("chat.copySuccess"), { id: "copy-message" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("chat.copyError"), { id: "copy-message-error" });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label={t("chat.copyAriaLabel")}
      className={cn(
        "opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success-solid" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
