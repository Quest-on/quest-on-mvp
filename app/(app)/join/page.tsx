"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";

export default function ExamCodeEntry() {
  const t = useTranslations("auth.join");
  const [examCode, setExamCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // URL에서 에러 파라미터 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (!errorParam) return;

    const errorMessages: Record<string, string> = {
      already_submitted: t("alreadySubmitted"),
      exam_not_found: t("examNotFound"),
      exam_not_available: t("examNotAvailable"),
      entry_window_closed: t("entryWindowClosed"),
      unauthorized: t("unauthorized"),
      server_error: t("serverError"),
      network_error: t("networkError"),
      // 한도 초과. 학생 잘못이 아니고 코드도 맞다는 걸 먼저 말한다.
      // 사유와 해제 방법은 교수자 표면에만 있다 — 학생에게 요금제를
      // 설명하는 건 도움이 안 된다.
      publish_limit: t("publishLimitReached"),
      student_limit: t("studentLimitReached"),
    };

    // 코드를 복원한다. 이게 없으면 학생이 코드를 다시 받아야 재시도할 수 있다.
    const codeParam = params.get("code");
    if (codeParam) setExamCode(codeParam.toUpperCase());

    setError(
      errorMessages[errorParam] ||
        t("unknownError")
    );
  }, [t]);

  /**
   * 서버 코드로 문구를 고른다.
   *
   * 예전에는 errData.message 를 그대로 썼다. 서버 메시지는 영문이고
   * 개발자용이라 학생 화면에 "Exam not found" 가 그대로 떴다.
   * 모르는 코드는 일반 문구로 떨어뜨린다 - 원문을 흘리지 않는다.
   */
  const resolveJoinError = (code?: string): string => {
    switch (code) {
      case "EXAM_NOT_FOUND":
        return t("examNotFound");
      case "EXAM_NOT_AVAILABLE":
        return t("examNotAvailable");
      case "ENTRY_WINDOW_CLOSED":
        return t("entryWindowClosed");
      case "ALREADY_SUBMITTED":
        return t("alreadySubmitted");
      case "STUDENT_LIMIT_REACHED":
        return t("studentLimitReached");
      case "PUBLISH_LIMIT_REACHED":
        return t("publishLimitReached");
      case "UNAUTHORIZED":
        return t("unauthorized");
      default:
        return t("codeCheckFailed");
    }
  };

  const navigateToCode = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_exam", data: { code } }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(resolveJoinError(errData?.error));
      }
      const data = await res.json();
      const examType = data.exam?.type;
      if (examType && examType !== "exam") {
        router.push(`/assignment/${code}`);
      } else {
        router.push(`/exam/${code}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (examCode.length !== 6) return;
    navigateToCode(examCode);
  };

  return (
    <CenteredViewportShell
      className="surface-page-gradient"
      contentClassName="max-w-4xl"
    >
      <div className="w-full">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl">{t("cardTitle")}</CardTitle>
              <CardDescription className="text-base">
                {t("cardDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <ErrorAlert message={error} />}
                <div className="space-y-2 mb-12">
                  <div className="flex justify-center">
                    <InputOTP
            autoFocus
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={examCode}
                      onChange={(value) => {
                        const upper = value.toUpperCase();
                        setExamCode(upper);
                        setError(null);
                        // Auto-submit on 6 character completion
                        if (upper.length === 6 && !isLoading) {
                          navigateToCode(upper);
                        }
                      }}
                      className="gap-1"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {t("inputHint")}
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || examCode.length !== 6}
                >
                  {isLoading ? t("loadingBtn") : t("enterBtn")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-muted-foreground mb-4">
            {t("helpText")}
          </p>
          <Link href="/">
            <Button variant="outline">{t("homeBtn")}</Button>
          </Link>
        </div>
      </div>
    </CenteredViewportShell>
  );
}
