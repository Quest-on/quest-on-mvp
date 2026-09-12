"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExamStatusBadge } from "@/components/instructor/ExamStatusBadge";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ExamDetailHeaderProps {
  title: string;
  code: string;
  examId: string;
  /** `exams.status`. 제목 아래 메타 줄에 배지로 나간다. */
  status: string;
  durationMinutes: number;
  /** 문항 수. 아직 못 받았으면 `null` — 모르는 수를 0 으로 적지 않는다. */
  questionsCount: number | null;
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
  /** 시작·종료처럼 이 화면의 주 행동. 헤더에 그대로 남는다. */
  primaryActions?: ReactNode;
  /**
   * 더보기 메뉴에 얹을 부차 행동(`DropdownMenuItem` 들).
   *
   * 내보내기처럼 **지금 할 일이 아닌 것**은 여기로 보낸다. 예전에는 학생이
   * 0명인 화면에도 Excel/CSV 버튼이 비활성 상태로 자리를 차지하고 있었다.
   */
  menuActions?: ReactNode;
}

// 이 헤더는 client 컴포넌트인 instructor exam-detail 페이지 안에서 렌더된다.
// 따라서 서버 전용 async getTranslations 가 아니라 client 훅 useTranslations 를 써야 한다.
// (과거 async + next-intl/server 조합은 "async Client Component" 런타임 크래시를 유발했다.)
export function ExamDetailHeader({
  title,
  code,
  examId,
  status,
  durationMinutes,
  questionsCount,
  isDemo,
  demoPreviewLabel,
  demoRestartLabel,
  demoRestartHint,
  primaryActions,
  menuActions,
}: ExamDetailHeaderProps) {
  const t = useTranslations("authoring");
  const router = useRouter();

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          {/*
            상태·소요 시간·문항 수는 제목의 속성이다. 예전에는 상태 배지가 버튼
            무리 사이에, 소요 시간과 문항 수가 각각 다른 아코디언 헤더에 흩어져
            있어서 시험 한 벌을 파악하려면 세 군데를 봐야 했다.

            구분자로 중간점을 쓰지 않는다(#320). 간격이 그 일을 한다.
          */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ExamStatusBadge status={status} />
            <span className="type-hint">
              {t("examDetailHeader.durationMin", { duration: durationMinutes })}
            </span>
            {questionsCount !== null && (
              <span className="type-hint">
                {t("examDetailHeader.questionsCountLabel", { count: questionsCount })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isDemo && demoPreviewLabel && (
            <div className="flex flex-col items-start gap-1">
              {/* 데모의 주 행동이다. 방금 온보딩을 마친 사람에게 이게 "다음 할 일"
                  로 읽혀야 한다. */}
              {demoRestartLabel ? (
                /*
                  재응시는 답안·AI 대화, 채점 결과를 복구 불가능하게 지운다
                  (restart_demo_attempt 가 grades/grading_chats/messages/
                  submissions/session_quiz_attempts/paste_logs 를 DELETE 한다).

                  RPC 가 원자적인 것과 사용자가 그걸 의도했는지는 다른 문제다.
                  링크 한 번으로 지우지 않는다. (#174 · 7)
                */
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button>{demoRestartLabel}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("examDetail.restartConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("examDetail.restartConfirmBody")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {/* 지워지는 것만 말하면 시험까지 사라지는 줄 안다. 남는 것도 적는다. */}
                    <p className="type-hint">{t("examDetail.restartConfirmKeeps")}</p>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("examDetail.restartConfirmCancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => router.push(`/exam/${code}?restartDemo=1`)}
                      >
                        {t("examDetail.restartConfirmCta")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Link href={`/exam/${code}`}>
                  <Button>{demoPreviewLabel}</Button>
                </Link>
              )}
              {demoRestartLabel && demoRestartHint && (
                <span className="type-meta">{demoRestartHint}</span>
              )}
            </div>
          )}

          {primaryActions}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("examDetailHeader.moreAria")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuActions}
              {menuActions && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <Link href={`/instructor/${examId}/edit`}>
                  {t("examDetailHeader.buttonEdit")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/instructor">{t("examDetailHeader.buttonDashboardLong")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
