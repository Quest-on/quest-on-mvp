"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { qk } from "@/lib/query-keys";

export default function SettingsPage() {
  const t = useTranslations("auth.settings");
  const { user, isLoaded } = useAppUser();
  const router = useRouter();

  const consentQuery = useQuery({
    queryKey: qk.consent.status(user?.id ?? "anonymous"),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const response = await fetch("/api/consents/onboarding");
      if (!response.ok) throw new Error("Consent status unavailable");
      return (await response.json()) as {
        collecting: boolean;
        complete: boolean;
        policyVersion?: string;
      };
    },
  });

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="type-page-title">{t("heading")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          {/* 비밀번호 변경 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                {t("passwordSectionTitle")}
              </CardTitle>
              <CardDescription>
                {t("passwordSectionDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          <Card id="privacy">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                {t("privacySectionTitle")}
              </CardTitle>
              <CardDescription>{t("privacySectionDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {consentQuery.isPending ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-5 w-56" />
                </div>
              ) : consentQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {t("consentStatusError")}
                </p>
              ) : (
                <div className="space-y-2">
                  <Badge variant={consentQuery.data.complete ? "secondary" : "destructive"}>
                    {consentQuery.data.complete
                      ? t("consentComplete")
                      : t("consentRequired")}
                  </Badge>
                  {consentQuery.data.policyVersion && (
                    <p className="type-hint">
                      {t("policyVersion", { version: consentQuery.data.policyVersion })}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {/*
                  동의가 끝나면 이 버튼이 통째로 사라져서 온보딩을 다시 볼 방법이
                  없었다. 진입을 항상 남긴다.

                  목적지를 가른다.

                    동의 미완료  ?redirect=/settings  — 동의만 받고 여기로 돌아온다.
                    동의 완료    redirect 없음        — 프로필→JTBD→데모까지 전부 걷는다.

                  redirect 를 붙이면 프로필 저장 직후 되돌아와서 JTBD 도 데모도
                  안 거친다. "다시 보기"인데 아무것도 안 보이는 셈이다.
                  데모 생성은 멱등이라(기존 데모가 있으면 그걸 돌려준다) 재실행이 안전하다.
                */}
                <Button
                  asChild
                  variant={consentQuery.data?.complete ? "outline" : "default"}
                >
                  <Link
                    href={
                      consentQuery.data?.complete
                        ? "/onboarding"
                        : "/onboarding?redirect=/settings"
                    }
                  >
                    {consentQuery.data?.complete
                      ? t("reopenOnboarding")
                      : t("reviewConsent")}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/legal/privacy">{t("privacyPolicy")}</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/legal/terms">{t("terms")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
