"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { type NavItem } from "@/components/layout/dashboard-sidebar";
import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import { useAgentPanelOptional } from "@/components/agent/AgentPanelProvider";
import { useAgentRunController } from "@/components/agent/AgentRunController";
import { useTranslations } from "next-intl";

interface MobileBottomNavProps {
  navItems: NavItem[];
  /** instructor layout에서만 true — AI 에이전트 버튼을 우측 끝에 표시 */
  showAgentButton?: boolean;
}

/**
 * 에이전트 버튼 내부 컴포넌트 — AgentRunControllerProvider 하위에서만 렌더.
 * showAgentButton=true일 때만 호출되므로 항상 provider 안에 있다.
 */
function AgentNavButton() {
  const panelCtx = useAgentPanelOptional();
  const controller = useAgentRunController();
  const t = useTranslations("instructor");

  if (!panelCtx) return null;

  const { open, toggle } = panelCtx;
  const running = controller.phase === "running";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("nav.aiAgent")}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
        open
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {/* running 중 ping dot */}
      {running && (
        <span className="absolute top-2 right-[calc(50%-10px)] flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      <BotMessageSquare
        className={cn(
          "w-5 h-5 -scale-x-100",
          open ? "text-primary" : "text-muted-foreground"
        )}
        aria-hidden="true"
      />
      <span>{t("nav.aiAgent")}</span>
    </button>
  );
}

export function MobileBottomNav({ navItems, showAgentButton = false }: MobileBottomNavProps) {
  const t = useTranslations("instructor");
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav.mobileNavLabel")}
    >
      <div className="flex items-stretch h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                item.active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  item.active ? "text-primary" : "text-muted-foreground"
                )}
                aria-hidden="true"
              />
              <span>{item.title}</span>
            </Link>
          );
        })}

        {/* AI 에이전트 버튼 — instructor layout에서만 */}
        {showAgentButton && <AgentNavButton />}
      </div>
    </nav>
  );
}
