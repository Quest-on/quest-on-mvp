"use client";

/**
 * AgentFab — 우측 하단 고정(sticky) 플로팅 버튼. AI 에이전트 채팅 패널을 연다.
 *
 * - 데스크톱/태블릿(≥768px) 전용. 모바일(<768px)은 에이전트를 **의도적으로
 *   지원하지 않는다**(#460) — 좁은 화면에서는 패널이 편집기를 덮어 타이핑
 *   연출을 볼 수 없다. 모바일 내비의 에이전트 버튼도 같은 폭에서 숨는다.
 *   모바일 출제를 지원하게 되면 #500 부터 읽는다.
 * - 에이전트 패널이 열려 있거나, 다른 우측 드로어(CASE AI 가채점 등)가 우하단을
 *   점유하면 숨는다 — 드로어의 전송 버튼을 덮어 누를 수 없게 만들었다(#495).
 * - 에이전트 실행 중이면 ping dot 으로 표시.
 *
 * AgentPanelProvider + AgentRunControllerProvider 하위(강사 레이아웃)에 마운트한다.
 */

import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import {
  shouldHideAgentFab,
  useAgentPanel,
} from "@/components/agent/AgentPanelProvider";
import { useAgentRunController } from "@/components/agent/AgentRunController";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function AgentFab() {
  const t = useTranslations("admin");
  const { open, setOpen, cornerClaimed } = useAgentPanel();
  const { phase } = useAgentRunController();
  const running = phase === "running";
  const hidden = shouldHideAgentFab({ panelOpen: open, cornerClaimed });

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("agent.fab.ariaLabel")}
      // 숨었을 때 키보드 포커스도 받지 않는다 — 보이지 않는 버튼으로 Tab 이 가지 않게.
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className={cn(
        "fixed bottom-6 right-6 z-50 hidden md:flex h-14 w-14 items-center justify-center",
        "rounded-full bg-primary text-primary-foreground shadow-lg",
        "transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // 겹침 방지 — 에이전트 패널이나 다른 우측 드로어가 열려 있으면 숨김
        hidden
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
