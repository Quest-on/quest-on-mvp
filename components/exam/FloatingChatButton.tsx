"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Sparkle } from "@/components/animate-ui/icons/sparkle";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

export function FloatingChatButton() {
  const t = useTranslations("exam");
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  if (isOpen) return null;

  return (
    <Button
      onClick={toggleSidebar}
      className="ai-chat-button fixed bottom-6 right-6 h-auto px-4 py-3 rounded-2xl rounded-br-sm shadow-lg hover:shadow-xl transition-all duration-200 z-40 border-2 border-primary flex items-center justify-center"
      aria-label={t("chat.openChatAriaLabel")}
    >
      <span className="text-lg font-bold relative inline-block">
        AI
        <AnimateIcon
          animateOnHover="path-loop"
          animation="path-loop"
          loop={true}
          persistOnAnimateEnd={true}
        >
          <Sparkle
            size={10}
            className="absolute -top-1 -right-2.5 text-white fill-white scale-70"
          />
        </AnimateIcon>
      </span>
    </Button>
  );
}
