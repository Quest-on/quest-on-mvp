"use client";

/**
 * 분석 턴의 실행 기록 블록 (이슈 #545)
 *
 * 학생 채팅(응시 화면)과 교수 채점 화면이 같이 쓴다. 읽기 전용이다.
 *   - 안내: 환경 재시작, 중단(셀 수, 시간), 잔액 소진 같은 턴 결과를 한 줄로 보인다.
 *   - 셀: 코드는 기본 접힘("코드 보기"), 실행 결과는 짧으면 그대로, 길면 접힘. 그림은 권한 확인 라우트로 열고
 *     누르면 크게 본다.
 * 소유자 결정: 코드는 접어서 보여 주되 전부 기록한다. 기록(저장)은 서버가 하고 이 블록은 보여 주기만 한다.
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { SyntaxHighlighterProps } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { AlertTriangle, ChevronDown, Code2, ImageOff, Maximize2, RotateCcw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AnalysisErrorCode } from "@/lib/analysis-exec/client-events";
import type { AnalysisOutcome, ClientAnalysisCell, ClientAnalysisFigure, ClientAnalysisTurn } from "@/lib/analysis-exec/metadata";

/** 실행 결과가 이 줄 수를 넘으면 접어서 보여 준다. */
const LOGS_COLLAPSE_LINES = 12;

type NoticeKey =
  | "environmentRestarted"
  | "errors.limitExceeded"
  | "errors.quotaExhausted"
  | "errors.rateLimited"
  | "errors.toolUnavailable"
  | "errors.failed"
  | "errors.timeout";

/** 턴 결과를 안내 문구 키로 바꾼다. 정상 완료는 안내가 없다. */
export function outcomeNoticeKey(outcome: AnalysisOutcome): NoticeKey | null {
  switch (outcome) {
    case "cell_limit":
    case "time_limit":
      return "errors.limitExceeded";
    case "quota_exhausted":
      return "errors.quotaExhausted";
    case "rate_limited":
      return "errors.rateLimited";
    case "upstream_error":
      return "errors.failed";
    default:
      return null;
  }
}

/** 스트림 오류 코드를 안내 문구 키로 바꾼다. */
export function errorCodeNoticeKey(code: AnalysisErrorCode | "timeout"): NoticeKey {
  switch (code) {
    case "limit_exceeded":
      return "errors.limitExceeded";
    case "quota_exhausted":
      return "errors.quotaExhausted";
    case "rate_limited":
      return "errors.rateLimited";
    case "tool_unavailable":
      return "errors.toolUnavailable";
    case "timeout":
      return "errors.timeout";
    default:
      return "errors.failed";
  }
}

function Notice({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  const Icon = tone === "info" ? RotateCcw : AlertTriangle;
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "info"
          ? "border-info-border bg-info-surface text-info-text"
          : "border-warning-border bg-warning-surface text-warning-text"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function Figure({ figure, index }: { figure: ClientAnalysisFigure; index: number }) {
  const t = useTranslations("exam");
  const [failed, setFailed] = useState(false);
  const alt = t("analysis.figureAlt", { number: index });

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 type-meta">
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        {t("analysis.figureError")}
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group/figure relative block w-full overflow-hidden rounded-md border border-border/50 bg-white"
          aria-label={t("analysis.figureExpand")}
        >
          {/* 서명 URL 로 가는 권한 확인 라우트라 next/image 최적화를 거치지 않는다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={figure.url}
            alt={alt}
            loading="lazy"
            className="h-auto max-h-80 w-full object-contain"
            onError={() => setFailed(true)}
          />
          <span className="absolute right-2 top-2 rounded bg-background/80 p-1 opacity-70 group-hover/figure:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-[min(95vw,64rem)] overflow-auto">
        <DialogTitle className="type-section-title">{alt}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={figure.url} alt={alt} className="h-auto w-full bg-white object-contain" />
      </DialogContent>
    </Dialog>
  );
}

function CellView({ cell }: { cell: ClientAnalysisCell }) {
  const t = useTranslations("exam");
  const [codeOpen, setCodeOpen] = useState(false);
  const logLines = cell.logs ? cell.logs.split("\n").length : 0;
  const longLogs = logLines > LOGS_COLLAPSE_LINES;
  const [logsOpen, setLogsOpen] = useState(false);
  const logsId = useId();
  const codeLines = cell.code ? cell.code.split("\n").length : 0;
  const failed = cell.status !== "completed";

  return (
    <li className="space-y-2 rounded-md border border-border/50 bg-background/60 p-2">
      <Collapsible open={codeOpen} onOpenChange={setCodeOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-[36px] w-full items-center gap-2 rounded px-1 text-left text-sm hover:bg-muted/60"
          >
            <Code2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{t("analysis.cellLabel", { index: cell.index })}</span>
            <span className="type-meta">{t("analysis.codeLines", { lines: codeLines })}</span>
            <span className="ml-auto flex items-center gap-1 type-meta">
              {codeOpen ? t("analysis.hideCode") : t("analysis.showCode")}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", codeOpen && "rotate-180")}
                aria-hidden="true"
              />
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 overflow-hidden rounded-md border border-border/50">
            <SyntaxHighlighter
              style={vscDarkPlus as SyntaxHighlighterProps["style"]}
              language="python"
              PreTag="div"
              className="!m-0 max-h-96 !rounded-none !bg-[#1e1e1e] text-xs"
              showLineNumbers
            >
              {cell.code}
            </SyntaxHighlighter>
          </div>
          {cell.codeTruncated && <p className="mt-1 type-meta">{t("analysis.codeTruncated")}</p>}
        </CollapsibleContent>
      </Collapsible>

      {failed && <p className="px-1 text-sm text-warning-text">{t("analysis.cellFailed")}</p>}

      {cell.logs ? (
        <div>
          <pre
            id={logsId}
            className={cn(
              "whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground/90",
              longLogs && !logsOpen && "max-h-40 overflow-hidden"
            )}
          >
            {cell.logs}
          </pre>
          {longLogs && (
            <button
              type="button"
              aria-expanded={logsOpen}
              aria-controls={logsId}
              onClick={() => setLogsOpen((open) => !open)}
              className="mt-1 min-h-[32px] px-1 type-meta underline-offset-2 hover:underline"
            >
              {logsOpen ? t("analysis.hideLogs") : t("analysis.showLogs", { lines: logLines })}
            </button>
          )}
        </div>
      ) : null}
      {cell.logsTruncated && <p className="px-1 type-meta">{t("analysis.logsTruncated")}</p>}

      {cell.figures.length > 0 && (
        <div className="grid gap-2">
          {cell.figures.map((figure, i) => (
            <Figure key={figure.url} figure={figure} index={i + 1} />
          ))}
        </div>
      )}
      {cell.figuresDropped > 0 && (
        <p className="px-1 type-meta">{t("analysis.figuresDropped", { count: cell.figuresDropped })}</p>
      )}
    </li>
  );
}

export interface AnalysisTurnBlockProps {
  analysis: ClientAnalysisTurn;
  /** 스트림 오류로 끝난 턴의 안내(저장된 결과에 없는 실시간 오류). */
  errorNotice?: AnalysisErrorCode | "timeout";
}

export function AnalysisTurnBlock({ analysis, errorNotice }: AnalysisTurnBlockProps) {
  const t = useTranslations("exam");
  const restarted = analysis.notices.includes("environment_restarted");
  const outcomeKey = outcomeNoticeKey(analysis.outcome);
  const errorKey = errorNotice ? errorCodeNoticeKey(errorNotice) : null;
  const warningKey = errorKey ?? outcomeKey;

  return (
    <div className="not-prose mt-3 space-y-2" data-testid="analysis-turn-block">
      {restarted && <Notice tone="info">{t("analysis.environmentRestarted")}</Notice>}
      {warningKey && <Notice tone="warning">{t(`analysis.${warningKey}`)}</Notice>}
      {analysis.cells.length > 0 && (
        <section aria-label={t("analysis.recordTitle")} className="space-y-2">
          <h4 className="type-meta font-semibold">{t("analysis.recordTitle")}</h4>
          <ol className="space-y-2">
            {analysis.cells.map((cell) => (
              <CellView key={cell.index} cell={cell} />
            ))}
          </ol>
        </section>
      )}
      {analysis.figures.length > 0 && (
        <div className="grid gap-2">
          {analysis.figures.map((figure, i) => (
            <Figure key={figure.url} figure={figure} index={analysis.cells.reduce((n, c) => n + c.figures.length, 0) + i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 오류만 있고 저장된 턴이 없을 때(아무 셀도 실행되지 않음) 보이는 안내. */
export function AnalysisErrorNotice({ code }: { code: AnalysisErrorCode | "timeout" }) {
  const t = useTranslations("exam");
  return (
    <div className="not-prose mt-1">
      <Notice tone="warning">{t(`analysis.${errorCodeNoticeKey(code)}`)}</Notice>
    </div>
  );
}
