"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import { logError } from "@/lib/logger";

export default function InstructorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("auth.error");

  useEffect(() => {
    logError("Instructor error boundary caught error", error, {
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      additionalData: { digest: error.digest },
    });
  }, [error]);

  const message = getErrorMessage(error, t("instructorFallback"));

  return (
    <div data-testid="error-boundary-instructor" className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <div className="rounded-full bg-destructive/10 p-4">
        <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">{message}</p>
      <Button data-testid="error-retry-btn" onClick={reset} variant="outline">
        {t("retryBtn")}
      </Button>
    </div>
  );
}
