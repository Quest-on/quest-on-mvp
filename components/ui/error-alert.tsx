"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  const t = useTranslations("common.errorAlert");

  return (
    <div className="flex items-start gap-3 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-7 px-2 text-xs text-destructive hover:text-destructive"
          >
            {t("retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
