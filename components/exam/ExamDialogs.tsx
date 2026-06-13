"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle } from "lucide-react";

const UNANSWERED_SUBMIT_COOLDOWN_SECONDS = 3;
const UNANSWERED_SUBMIT_COOLDOWN_MS = UNANSWERED_SUBMIT_COOLDOWN_SECONDS * 1000;

interface ExamDialogsProps {
  showExitConfirm: boolean;
  setShowExitConfirm: (open: boolean) => void;
  onExitConfirm: () => void;
  unansweredDialog: { open: boolean; indices: number[] };
  setUnansweredDialog: (value: { open: boolean; indices: number[] }) => void;
  setCurrentQuestion: (idx: number) => void;
  /** 표시순서 → 원본인덱스 매핑. 셔플 시 미작성 라벨/정렬을 표시번호로 보정. */
  displayOrder?: number[];
  setShowSubmitConfirm: (open: boolean) => void;
  autoSubmitFailed: boolean;
  setAutoSubmitFailed: (open: boolean) => void;
  onAutoSubmitRetry: () => void;
  onAutoSubmitExit: () => void;
  manualSubmitFailed: boolean;
  setManualSubmitFailed: (open: boolean) => void;
  onManualSubmitRetry: () => void;
  submitErrorMessage?: string | null;
}

export function ExamDialogs({
  showExitConfirm,
  setShowExitConfirm,
  onExitConfirm,
  unansweredDialog,
  setUnansweredDialog,
  setCurrentQuestion,
  displayOrder,
  setShowSubmitConfirm,
  autoSubmitFailed,
  setAutoSubmitFailed,
  onAutoSubmitRetry,
  onAutoSubmitExit,
  manualSubmitFailed,
  setManualSubmitFailed,
  onManualSubmitRetry,
  submitErrorMessage,
}: ExamDialogsProps) {
  const [now, setNow] = useState(() => Date.now());
  const [unansweredSubmitDeadline, setUnansweredSubmitDeadline] = useState<number | null>(null);

  useEffect(() => {
    if (!unansweredDialog.open) {
      const resetTimer = window.setTimeout(() => setUnansweredSubmitDeadline(null), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const deadline = Date.now() + UNANSWERED_SUBMIT_COOLDOWN_MS;
    const startTimer = window.setTimeout(() => setUnansweredSubmitDeadline(deadline), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 250);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, [unansweredDialog.open]);

  let unansweredSubmitRemainingMs = 0;
  if (unansweredDialog.open) {
    if (unansweredSubmitDeadline === null) {
      unansweredSubmitRemainingMs = UNANSWERED_SUBMIT_COOLDOWN_MS;
    } else {
      unansweredSubmitRemainingMs = Math.max(0, unansweredSubmitDeadline - now);
    }
  }
  const unansweredSubmitRemainingSeconds = Math.ceil(unansweredSubmitRemainingMs / 1000);
  const isUnansweredSubmitCoolingDown = unansweredSubmitRemainingSeconds > 0;

  // 셔플 시 미작성 라벨/정렬을 화면 표시번호로 보정한다(idx는 항상 원본 q_idx).
  const displayNumber = (idx: number) => {
    const pos = displayOrder ? displayOrder.indexOf(idx) : idx;
    return (pos >= 0 ? pos : idx) + 1;
  };

  return (
    <>
      {/* 그만두기 확인 다이얼로그 */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent data-testid="exit-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 그만두시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              진행한 내용은 저장됩니다. 시험을 종료하고 학생 대시보드로 이동합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 응시</AlertDialogCancel>
            <AlertDialogAction
              onClick={onExitConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              그만두기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 미작성 문제 안내 다이얼로그 */}
      <AlertDialog open={unansweredDialog.open} onOpenChange={(open) => setUnansweredDialog({ ...unansweredDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>미작성 문제가 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredDialog.indices.length}개의 문제에 답안이 작성되지 않았습니다. 해당 문제로 이동하거나, 현재 상태로 제출할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {[...unansweredDialog.indices]
              .sort((a, b) => displayNumber(a) - displayNumber(b))
              .map((idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => {
                    setCurrentQuestion(idx);
                    setUnansweredDialog({ open: false, indices: [] });
                  }}
                >
                  문제 {displayNumber(idx)}
                </Button>
              ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (isUnansweredSubmitCoolingDown) return;
                setUnansweredDialog({ open: false, indices: [] });
                setShowSubmitConfirm(true);
              }}
              disabled={isUnansweredSubmitCoolingDown}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isUnansweredSubmitCoolingDown ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-destructive-foreground border-t-transparent" aria-hidden="true" />
                  미작성 상태로 제출하기 ({unansweredSubmitRemainingSeconds}초)
                </>
              ) : (
                "미작성 상태로 제출하기"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 자동 제출 실패 알림 */}
      <AlertDialog open={autoSubmitFailed} onOpenChange={setAutoSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              자동 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              시간 만료로 인한 자동 제출에 실패했습니다. 아래 버튼을 눌러 수동으로 제출해주세요. 답안은 이미 저장되어 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onAutoSubmitExit}>
              저장 후 나가기
            </AlertDialogCancel>
            <AlertDialogAction onClick={onAutoSubmitRetry}>
              수동 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 수동 제출 실패 알림 */}
      <AlertDialog open={manualSubmitFailed} onOpenChange={setManualSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              답안 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              {submitErrorMessage || "답안 제출에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={onManualSubmitRetry}>
              다시 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
