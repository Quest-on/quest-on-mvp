"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { CopyMessageButton } from "@/components/chat/CopyMessageButton";
import { ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";

type InstructorChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export interface InstructorChatSidebarProps {
  context: string;
  sessionIdSeed: string;
  scopeDescription?: string;
  title?: string;
  subtitle?: string;
}

export function InstructorChatSidebar({
  context,
  sessionIdSeed,
  scopeDescription,
  title,
  subtitle,
}: InstructorChatSidebarProps) {
  const t = useTranslations("grading");
  const resolvedScopeDescription = scopeDescription ?? (t("chatSidebar.defaultScope") as string);
  const resolvedTitle = title ?? (t("chatSidebar.defaultTitle") as string);
  const resolvedSubtitle = subtitle ?? (t("chatSidebar.defaultSubtitle") as string);
  return (
    <>
      <InternalSidebar
        context={context}
        sessionIdSeed={sessionIdSeed}
        scopeDescription={resolvedScopeDescription}
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
      />
      <FloatingTrigger />
    </>
  );
}

function FloatingTrigger() {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const t = useTranslations("grading");
  const isOpen = isMobile ? openMobile : open;
  const [scrollY, setScrollY] = useState(0);
  const [delayedScrollY, setDelayedScrollY] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);

      // 기존 타이머가 있으면 취소
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // 약간의 지연 후 위치 업데이트 (150ms 지연)
      timeoutRef.current = setTimeout(() => {
        setDelayedScrollY(currentScrollY);
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // 스크롤 차이에 따라 약간의 오프셋 적용 (최대 20px) - 방향 반대
  const offsetY = (delayedScrollY - scrollY) * 0.3;
  const clampedOffset = Math.max(-20, Math.min(20, offsetY));

  if (isOpen) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 transition-transform duration-300 ease-out"
      style={{
        transform: `translateY(${clampedOffset}px)`,
      }}
    >
      <AnimateIcon animateOnHover="path-loop" loop={true} asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t("chatSidebar.openAriaLabel")}
          className="gradient-animated flex h-14 w-14 items-center justify-center rounded-3xl rounded-br-none text-white shadow-lg hover:shadow-xl transition-shadow"
        >
          <BotMessageSquare size={32} className="-scale-x-100" />
        </button>
      </AnimateIcon>
    </div>
  );
}

function InternalSidebar({
  context,
  sessionIdSeed,
  scopeDescription,
  title,
  subtitle,
}: Required<InstructorChatSidebarProps>) {
  return (
    <Sidebar side="right" variant="floating" collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-none truncate">
              {title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {subtitle}
            </div>
          </div>
          <SidebarCloseButton />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <ChatPanel
          context={context}
          sessionIdSeed={sessionIdSeed}
          scopeDescription={scopeDescription}
        />
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarCloseButton() {
  const { setOpen, isMobile, setOpenMobile } = useSidebar();
  const t = useTranslations("grading");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
      aria-label={t("chatSidebar.closeAriaLabel")}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

function ChatPanel({
  context,
  sessionIdSeed,
  scopeDescription,
}: {
  context: string;
  sessionIdSeed: string;
  scopeDescription: string;
}) {
  const t = useTranslations("grading");
  const { user, profile } = useAppUser();
  const userId = user?.id ?? "instructor_unknown";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<InstructorChatMessage[]>([]);

  const sessionId = useMemo(
    () => `temp_instructor_${sessionIdSeed}_${userId}`,
    [sessionIdSeed, userId]
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/instructor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          context,
          scopeDescription,
          userId,
        }),
      });

      // 405 에러를 명시적으로 처리
      if (res.status === 405) {
        throw new Error(t("chatSidebar.methodNotAllowed"));
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Chat request failed (${res.status})`);
      }
      return data as { response: string };
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response, ts: Date.now() },
      ]);
      scrollToBottom();
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error
          ? err.message.includes("405") ||
            err.message.includes("Method Not Allowed")
            ? t("chatSidebar.genericError")
            : err.message.includes(t("chatSidebar.methodNotAllowed"))
            ? t("chatSidebar.genericError")
            : t("chatSidebar.errorWithMsg", { message: err.message })
          : t("chatSidebar.genericError");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          ts: Date.now(),
          content: errorMessage,
        },
      ]);
      scrollToBottom();
    },
  });

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, ts: Date.now() },
    ]);
    setInput("");
    scrollToBottom();

    mutation.mutate(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-4 space-y-3">
          {messages.length === 0 && !mutation.isPending && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-sm">
                <BotMessageSquare className="h-6 w-6 -scale-x-100" />
              </div>
              <div className="space-y-1 max-w-[260px]">
                <p className="text-sm font-medium text-foreground">
                  {t("chatSidebar.emptyTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("chatSidebar.emptyDesc", { scope: scopeDescription })}
                </p>
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            if (m.role === "assistant") {
              return (
                <div key={`${m.ts}-${idx}`} className="flex justify-start">
                  <AIMessageRenderer
                    content={m.content}
                    timestamp={new Date(m.ts).toISOString()}
                    variant="plain"
                  />
                </div>
              );
            }

            return (
              <div key={`${m.ts}-${idx}`} className="flex justify-end">
                <div className="group max-w-[90%] rounded-2xl rounded-br-none bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap relative">
                  {m.content}
                  <CopyMessageButton
                    text={m.content}
                    className="absolute -top-1 -left-1 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                  />
                </div>
              </div>
            );
          })}

          {mutation.isPending && (
            <div className="flex justify-start">
              <AIMessageRenderer
                content={t("chatSidebar.thinking")}
                timestamp={new Date().toISOString()}
                variant="plain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 pt-2">
        <div className="rounded-[26px] border bg-background shadow-sm p-2 flex items-center justify-between gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chatSidebar.placeholder")}
            className="min-h-[42px] resize-none border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 px-2 py-2 text-base"
            disabled={mutation.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />

          <Button
            type="button"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={send}
            disabled={mutation.isPending || !input.trim()}
            aria-label={t("chatSidebar.sendAriaLabel")}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
