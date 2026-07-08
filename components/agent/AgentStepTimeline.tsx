"use client";

import {
  Brain,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Hammer,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AgentStep, AgentStepType } from "@/lib/agent/types";

/** stepType 별 아이콘 + 번역 키 */
const STEP_META: Record<
  AgentStepType,
  { icon: typeof Brain; labelKey: string }
> = {
  user_input: { icon: MessageSquare, labelKey: "agent.timeline.step.userInput" },
  plan: { icon: ClipboardList, labelKey: "agent.timeline.step.plan" },
  data_fetch: { icon: Database, labelKey: "agent.timeline.step.dataFetch" },
  analysis: { icon: Brain, labelKey: "agent.timeline.step.analysis" },
  tool_call: { icon: Hammer, labelKey: "agent.timeline.step.toolCall" },
  draft: { icon: FileText, labelKey: "agent.timeline.step.draft" },
  approval: { icon: ThumbsUp, labelKey: "agent.timeline.step.approval" },
  final: { icon: CheckCircle2, labelKey: "agent.timeline.step.final" },
};

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const t = useTranslations("admin");
  const meta = STEP_META[step.stepType] ?? STEP_META.analysis;
  const Icon = meta.icon;

  return (
    <li className="flex gap-3 animate-fade-in-up-xs">
      {/* 아이콘 + 세로 연결선 */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* 본문 */}
      <div className={isLast ? "pb-1" : "pb-4"}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(meta.labelKey)}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {step.title}
        </p>
        {/* user_input 스텝은 입력 프롬프트를 quote 스타일로 표시 */}
        {step.content && step.stepType === "user_input" ? (
          <p className="mt-1 rounded-lg bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
            {step.content}
          </p>
        ) : step.content ? (
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {step.content}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 진행 중 인디케이터 — 타임라인 마지막 스텝 아래에 붙는 맥동 행.
 * 스텝 사이 공백(OpenAI 호출 대기) 동안에도 "살아있는" 느낌을 준다.
 */
function PendingRow({ hasSteps }: { hasSteps: boolean }) {
  const t = useTranslations("admin");
  return (
    <li className="flex gap-3" aria-live="polite">
      {/* 위 스텝과 이어지는 연결선 + 맥동 점 */}
      <div className="flex flex-col items-center">
        {hasSteps && <div className="mb-1 h-3 w-px bg-border" />}
        <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
      </div>

      {/* 본문 */}
      <div className="flex items-center pb-1">
        <span className="animate-pulse text-sm font-medium text-muted-foreground">
          {t("agent.timeline.pending")}
        </span>
      </div>
    </li>
  );
}

export function AgentStepTimeline({
  steps,
  pending = false,
}: {
  steps: AgentStep[];
  /** queued/running 동안 true — 마지막 스텝 아래에 맥동 인디케이터 표시 */
  pending?: boolean;
}) {
  const t = useTranslations("admin");
  if (steps.length === 0) {
    if (pending) {
      return (
        <ol className="px-1">
          <PendingRow hasSteps={false} />
        </ol>
      );
    }
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        {t("agent.timeline.noSteps")}
      </p>
    );
  }

  return (
    <ol className="px-1">
      {steps.map((step, idx) => (
        <StepRow
          key={step.id}
          step={step}
          // pending 이면 마지막 스텝도 아래로 연결선이 이어진다
          isLast={idx === steps.length - 1 && !pending}
        />
      ))}
      {pending && <PendingRow hasSteps />}
    </ol>
  );
}
