"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function RegradePage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, isLoaded } = useAppUser();
  const examId = params.examId as string;
  const studentId = params.studentId as string;
  const t = useTranslations("grading");
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "no-session"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const triggerRegrade = async () => {
      if (!isLoaded || !user || !examId || !studentId) return;

      try {
        // Note: studentId in URL is actually sessionId (see grade page.tsx:148)
        const sessionId = studentId;

        // AI 채점 재실행
        const gradeResponse = await fetch(`/api/session/${sessionId}/grade`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            forceRegrade: true,
          }),
        });

        if (!gradeResponse.ok) {
          const errorData = await gradeResponse.json().catch(() => ({}));
          throw new Error(
            errorData.error || errorData.message || t("regradePage.regradeRunFailed")
          );
        }

        const gradeData = await gradeResponse.json();
        setStatus("success");
        setMessage(
          gradeData.skipped
            ? t("regradePage.alreadyGraded")
            : t("regradePage.regradeComplete", { count: gradeData.gradesCount || 0 })
        );

        // 2초 후 채점 페이지로 리다이렉트
        setTimeout(() => {
          router.push(`/instructor/${examId}/grade/${studentId}`);
        }, 2000);
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : t("regradePage.regradeRunError")
        );
      }
    };

    triggerRegrade();
  }, [examId, studentId, user, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">{t("regradePage.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t("regradePage.loginRequired")}</CardTitle>
            <CardDescription>
              {t("regradePage.loginRequiredDesc")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            {status === "loading" && (
              <Loader2 className="w-16 h-16 animate-spin text-primary" />
            )}
            {status === "success" && (
              <CheckCircle2 className="w-16 h-16 text-green-600" />
            )}
            {(status === "error" || status === "no-session") && (
              <AlertCircle className="w-16 h-16 text-destructive" />
            )}
          </div>
          <CardTitle>
            {status === "loading" && t("regradePage.statusLoading")}
            {status === "success" && t("regradePage.statusSuccess")}
            {status === "error" && t("regradePage.statusError")}
            {status === "no-session" && t("regradePage.statusNoSession")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <CardDescription className="mb-4">{message}</CardDescription>
          {status === "success" && (
            <p className="text-sm text-muted-foreground">
              {t("regradePage.redirecting")}
            </p>
          )}
          {status === "error" && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t("regradePage.retry")}
            </button>
          )}
          {status === "no-session" && (
            <button
              onClick={() => router.push(`/instructor/${examId}/grade/${studentId}`)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t("regradePage.backToGrade")}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

