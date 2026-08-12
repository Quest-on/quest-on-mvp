"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, ShieldCheck } from "lucide-react";

/**
 * 자동 관찰에 대한 별도 고지.
 *
 * 이용약관·개인정보처리방침에 끼워 넣지 않는다. 포괄 동의 안에 묻힌 관찰 고지는
 * 동의를 받은 것이 아니라 동의를 우회한 것이다. 그래서 여기서는 다섯 가지를 각각 말한다:
 * 수집 항목 · 이용 목적 · 보관 기간 · 거부할 권리 · 거부하면 달라지는 점.
 *
 * 거부 수단은 아래 '관찰 일시중지' 와 '전체 초기화' 이며, 이 고지는 그 둘을 가리킨다.
 */
export function MemoryConsentNotice() {
  const t = useTranslations("instructor.memory");

  const clauses = [
    { title: t("consent.itemsTitle"), body: t("consent.items") },
    { title: t("consent.purposeTitle"), body: t("consent.purpose") },
    { title: t("consent.retentionTitle"), body: t("consent.retention") },
    { title: t("consent.refusalTitle"), body: t("consent.refusal") },
    { title: t("consent.refusalCostTitle"), body: t("consent.refusalCost") },
  ];

  return (
    <Card data-testid="memory-consent-notice" className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <Badge variant="outline" className="border-primary/40 text-primary">
            {t("consent.sectionLabel")}
          </Badge>
        </div>
        <CardTitle className="mt-2 text-lg">{t("consent.title")}</CardTitle>
        <CardDescription>{t("consent.separateFromTerms")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          {t("consent.optInState")}
        </p>

        <dl className="grid gap-4 sm:grid-cols-2">
          {clauses.map((clause) => (
            <div key={clause.title} className="space-y-1">
              <dt className="text-sm font-semibold text-foreground">{clause.title}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {clause.body}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
          <Link
            href="/legal/terms"
            className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t("consent.termsLink")}
          </Link>
          <Link
            href="/legal/privacy"
            className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t("consent.privacyLink")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
