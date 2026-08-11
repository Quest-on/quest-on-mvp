"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

interface ExamDetailHeaderProps {
  title: string;
  code: string;
  examId: string;
  isDemo?: boolean;
  demoPreviewLabel?: string;
  /**
   * 이미 제출한 데모를 다시 풀기 위한 라벨. 있으면 CTA 가 재응시 요청을 실어
   * 보낸다 — 이게 없으면 제출 후에는 읽기 전용 화면만 떠서 "연습용인데 한 번
   * 내면 끝"이 된다.
   */
  demoRestartLabel?: string;
  extraActions?: ReactNode;
}

// 이 헤더는 client 컴포넌트인 instructor exam-detail 페이지 안에서 렌더된다.
// 따라서 서버 전용 async getTranslations 가 아니라 client 훅 useTranslations 를 써야 한다.
// (과거 async + next-intl/server 조합은 "async Client Component" 런타임 크래시를 유발했다.)
export function ExamDetailHeader({
  title,
  code,
  examId,
  isDemo,
  demoPreviewLabel,
  demoRestartLabel,
  extraActions,
}: ExamDetailHeaderProps) {
  const t = useTranslations("authoring");
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">
            {t("examDetailHeader.examCode", { code })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isDemo && demoPreviewLabel && (
            <Link
              href={
                demoRestartLabel
                  ? `/exam/${code}?restartDemo=1`
                  : `/exam/${code}`
              }
            >
              <Button size="sm">{demoRestartLabel ?? demoPreviewLabel}</Button>
            </Link>
          )}
          {extraActions}
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/instructor">
              <Button variant="outline" size="sm">
                <span className="sm:hidden">{t("examDetailHeader.buttonDashboardShort")}</span>
                <span className="hidden sm:inline">{t("examDetailHeader.buttonDashboardLong")}</span>
              </Button>
            </Link>
            <Link href={`/instructor/${examId}/edit`}>
              <Button variant="outline" size="sm">{t("examDetailHeader.buttonEdit")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
