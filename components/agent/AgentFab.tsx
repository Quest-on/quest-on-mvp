"use client";

/**
 * AgentFab — 우측 하단 고정(sticky) 플로팅 버튼. AI 에이전트 채팅 패널을 연다.
 *
 * - 데스크톱/태블릿(≥768px) 전용. 모바일은 MobileBottomNav 의 에이전트 아이템 사용.
 * - 패널이 열려 있으면 숨는다 — 열린 우측 패널 위에 겹치지 않도록.
 * - 에이전트 실행 중이면 ping dot 으로 표시.
 *
 * AgentPanelProvider + AgentRunControllerProvider 하위(강사 레이아웃)에 마운트한다.
 */

import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import { useAgentPanel } from "@/components/agent/AgentPanelProvider";
import { useAgentRunController } from "@/components/agent/AgentRunController";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function AgentFab() {
  const t = useTranslations("admin");
  const { open, setOpen } = useAgentPanel();
  const { phase } = useAgentRunController();
  const running = phase === "running";

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("agent.fab.ariaLabel")}
      className={cn(
        "fixed bottom-6 right-6 z-50 hidden md:flex h-14 w-14 items-center justify-center",
        "rounded-full bg-primary text-primary-foreground shadow-lg",
        "transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // 패널이 열려 있으면 숨김 (겹침 방지)
        open
          ? "pointer-events-none scale-0 opacity-0"
          : "scale-100 opacity-100",
      )}
    >
      <BotMessageSquare className="h-6 w-6 -scale-x-100" />
      {running && (
        <span className="absolute right-1 top-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-solid opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-success-solid ring-2 ring-primary" />
        </span>
      )}
    </button>
  );
}
