"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExamCode, type ExamCodeQuota } from "@/components/instructor/ExamCode";
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
  /**
   * 재응시가 무엇을 지우는지 알리는 문구. 서버는 이전 제출·채점·대화를
   * 실제로 삭제하므로(UNIQUE(exam_id, student_id) 아래 새 세션을 못 만든다),
   * 누르기 전에 알려야 한다. 라벨만 있고 이 경고가 없으면 안 된다.
   */
  demoRestartHint?: string;
  /** 발행 한도 상태. 없으면 게이트가 열린 것으로 본다(fail-open). */
  quota?: ExamCodeQuota;
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
  demoRestartHint,
  quota,
  extraActions,
}: ExamDetailHeaderProps) {
  const t = useTranslations("authoring");
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          {/* 코드는 ExamCode 만 내보낸다. 여기서 직접 그리면 발행 한도 게이트를
              우회하게 되고, 교수자가 코드를 배포한 뒤 학생 전원이 튕긴다. */}
          <ExamCode code={code} quota={quota} className="mt-1" />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isDemo && demoPreviewLabel && (
            <div className="flex flex-col items-start gap-1">
              <Link
                href={
                  demoRestartLabel
                    ? `/exam/${code}?restartDemo=1`
                    : `/exam/${code}`
                }
              >
                {/* 데모의 주 행동이다. 방금 온보딩을 마친 사람에게 이게 "다음 할 일"
                    로 읽혀야 하는데 size="sm" 이면 헤더 버튼 무리에 묻힌다. */}
                <Button>{demoRestartLabel ?? demoPreviewLabel}</Button>
              </Link>
              {demoRestartLabel && demoRestartHint && (
                <span className="type-meta">
                  {demoRestartHint}
                </span>
              )}
            </div>
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
