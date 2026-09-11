"use client";

import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { SUPPORT_EMAIL } from "@/lib/contact";

interface FooterProps {
  mode?: "light" | "dark";
}

const COLORS = {
  light: {
    bg: "#FFFFFF",
    text: "#1F1F1F",
    textSec: "#6B7280",
    border: "#E5E5E5",
  },
  dark: {
    bg: "#0A0A0A",
    text: "#E4E4E4",
    textSec: "#A1A1AA",
    border: "rgba(255, 255, 255, 0.1)",
  },
} as const;

const FOOTER_LINKS = {
  제품: [
    { label: "메인", href: "#hero" },
    { label: "고객 후기", href: "#features" },
    { label: "파트너십", href: "#partners" },
    { label: "무료로 시작하기", href: "/sign-up" },
  ],
  리소스: [
    { label: "시작 가이드", href: "/docs/getting-started" },
    { label: "업데이트 소식", href: "/changelog" },
    { label: "API 문서", href: "/docs/api" },
    { label: "도움말 센터", href: "/help" },
    { label: "시스템 현황", href: "/status" },
  ],
  회사: [
    { label: "팀 소개", href: "/about" },
    { label: "블로그", href: "/blog" },
    { label: "채용 안내", href: "/careers" },
    { label: "파트너십", href: "/partners" },
    { label: "문의하기", href: `mailto:${SUPPORT_EMAIL}` },
  ],
  법적고지: [
    { label: "이용약관", href: "/legal/terms" },
    { label: "개인정보처리방침", href: "/legal/privacy" },
    { label: "데이터 보안", href: "/legal/security" },
    { label: "쿠키 정책", href: "/legal/cookies" },
  ],
} as const;

export default function Footer({ mode = "light" }: FooterProps) {
  const colors = COLORS[mode];
  const isDark = mode === "dark";

  return (
    <footer
      className="w-full px-6 py-16 lg:px-12 lg:py-24 border-t"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <div className="mx-auto max-w-7xl">
        {/* Brand & Links Grid */}
        <div className="grid grid-cols-2 gap-12 md:grid-cols-5 lg:gap-16 mb-20">
          <div
            className="col-span-2 md:col-span-1 border-r pr-8"
            style={{
              borderColor: isDark
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.05)",
            }}
          >
            <div className="flex items-center gap-2 mb-6 text-zinc-900 dark:text-white">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On Logo"
                width={32}
                height={32}
                sizes="32px"
                className="h-8 w-8"
              />
              <span
                className="font-bold text-xl tracking-tight"
                style={{ color: colors.text }}
              >
                Quest-On
              </span>
            </div>
            <p
              className="text-sm leading-relaxed max-w-[160px] font-medium"
              style={{ color: colors.textSec }}
            >
              AI와 함께하는 차세대 교육 평가 시스템. 사고의 과정을 데이터로
              증명합니다.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h3
                className="mb-6 text-sm font-bold uppercase tracking-widest opacity-40"
                style={{ color: colors.text }}
              >
                {category}
              </h3>
              <ul className="space-y-4">
                {links.map((link) => {
                  const isAnchorLink = link.href.startsWith("#");
                  const handleClick = (
                    e: React.MouseEvent<HTMLAnchorElement>
                  ) => {
                    if (isAnchorLink) {
                      e.preventDefault();
                      const targetId = link.href.substring(1);
                      const element = document.getElementById(targetId);
                      if (element) {
                        element.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }
                  };

                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        onClick={handleClick}
                        className="text-sm transition-all hover:text-blue-600 font-medium cursor-pointer"
                        style={{ color: colors.textSec }}
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div
          className="pt-12 border-t flex flex-col items-start justify-between gap-8 md:flex-row md:items-center"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
          }}
        >
          {/* Copyright & Badges */}
          <div
            className="flex flex-wrap items-center gap-6 text-sm"
            style={{ color: colors.textSec }}
          >
            <span className="font-bold opacity-60">© 2025 Quest-On Inc.</span>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <ShieldCheck className="w-3 h-3 text-blue-500" />
              <span className="text-[10px] font-bold">
                SOC 2 TYPE II 정식 인증
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                All Systems Operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
