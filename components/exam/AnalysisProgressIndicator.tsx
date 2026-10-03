"use client";

/**
 * 분석 턴 진행 표시 (이슈 #545)
 *
 * 코드 실행이 붙은 분석 턴은 30~60초, 길면 몇 분이 걸린다. 학생이 멈춘 줄 알고 다시 보내지 않도록 지금 단계
 * (환경 준비, 코드 실행 n 회째, 결과 정리)와 경과 시간을 보인다. 값은 서버가 SSE 로 보낸 진행 이벤트다.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { AnalysisProgress } from "@/hooks/useExamChat";

export function AnalysisProgressIndicator({ progress }: { progress: AnalysisProgress }) {
  const t = useTranslations("exam");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  const label =
    progress.phase === "running"
      ? t("analysis.runningCode", { count: Math.max(1, progress.cell) })
      : progress.phase === "restarting"
        ? t("analysis.restarting")
        : progress.phase === "writing"
          ? t("analysis.writing")
          : t("analysis.preparing");

  return (
    <div
      className="flex max-w-[85%] flex-col gap-2 rounded-2xl bg-muted/80 px-4 py-3 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label={t("analysis.progressAriaLabel")}
      data-testid="analysis-progress"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm text-foreground">{label}</span>
        {/* 경과 시간은 매초 바뀐다. 화면 낭독기가 계속 읽지 않게 알림 영역에서 뺀다(단계 글자만 알린다). */}
        <span className="ml-auto type-meta tabular-nums" aria-hidden="true">
          {t("analysis.elapsed", { seconds })}
        </span>
      </div>
      {progress.preview && (
        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-muted-foreground" aria-hidden="true">
          {progress.preview.slice(-600)}
        </p>
      )}
    </div>
  );
}
