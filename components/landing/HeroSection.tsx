"use client";

import { useState, useEffect, useRef } from "react";
// framer-motion 제거됨 - 성능 최적화를 위해 애니메이션 제거
// 이전: import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Play,
  MessageSquare,
  Sparkles,
  Brain,
  ShieldCheck,
  ArrowRight,
  Plus,
  TriangleAlert,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import {
  TypingText,
  TypingTextCursor,
} from "@/components/animate-ui/primitives/texts/typing";
import { useTranslations } from "next-intl";

// ============================================================================
// TYPES
// ============================================================================

interface HeroSectionProps {
  headline: React.ReactNode;
  subheadline: React.ReactNode;

  ctaText?: string;
  onCtaClick?: () => void;
  variant?: "default" | "cheating" | "grading" | "innovation";
  mode?: "light" | "dark";
}

// ============================================================================
// STYLES & CONFIG
// ============================================================================

const COLORS = {
  light: {
    bg: "#FFFFFF",
    text: "#1F1F1F",
    textSec: "#52525B", // Improved contrast: changed from #6B7280 to #52525B (zinc-600) for better WCAG AA compliance
    primary: "#2563EB",
    card: "#F5F5F5",
    cardBorder: "#E5E5E5",
    editorBg: "#FFFFFF",
    chromeBg: "#FAFAFA",
    glass: "backdrop-blur-md bg-background/70 border border-black/5",
    navBg: "rgba(255, 255, 255, 0.8)",
  },
  dark: {
    bg: "#0A0A0A",
    text: "#E4E4E4",
    textSec: "#A1A1AA",
    primary: "#2563EB",
    card: "rgba(255, 255, 255, 0.05)",
    cardBorder: "rgba(255, 255, 255, 0.1)",
    editorBg: "#0F0F0F",
    chromeBg: "#141414",
    glass: "backdrop-blur-md bg-background/5 border border-white/10",
    navBg: "rgba(0, 0, 0, 0.5)",
  },
} as const;

// ============================================================================
// COMPONENTS
// ============================================================================

// 이전 CountUp 컴포넌트 - SlidingNumber로 교체됨
// Number count up animation component (removed)
// const CountUp = ({ to, duration = 2 }: { to: number; duration?: number }) => {
//   const [count, setCount] = useState(0);
//
//   useEffect(() => {
//     let startTime: number;
//     let animationFrame: number;
//
//     const animate = (timestamp: number) => {
//       if (!startTime) startTime = timestamp;
//       const progress = timestamp - startTime;
//       const percentage = Math.min(progress / (duration * 1000), 1);
//
//       // Ease out quart
//       const ease = 1 - Math.pow(1 - percentage, 4);
//
//       setCount(Math.floor(to * ease));
//
//       if (progress < duration * 1000) {
//         animationFrame = requestAnimationFrame(animate);
//       }
//     };
//
//     animationFrame = requestAnimationFrame(animate);
//     return () => cancelAnimationFrame(animationFrame);
//   }, [to, duration]);
//
//   return <>{count}</>;
// };

const ProductSimulation = ({ mode }: { mode: "light" | "dark" }) => {
  const colors = COLORS[mode];
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const t = useTranslations("landing");
  const [typingState, setTypingState] = useState<{
    isTyping: boolean;
    text: string;
    messageId: number;
  } | null>(null);
  const [shownStudentMessages, setShownStudentMessages] = useState<Set<number>>(
    new Set()
  );
  const [shownAIResponses, setShownAIResponses] = useState<Set<number>>(
    new Set()
  );

  const studentMessages = [
    "경쟁사 제품 대비 그린휠의 제품은 얼마나 가벼워? 얼마나 경량화가 됐어?",
    "전기 자전거가 경량화가 되면 뭐가 좋아?",
    "배터리 수명은 어느 정도야?",
  ];

  // Intersection Observer로 섹션이 보일 때 감지
  useEffect(() => {
    const currentRef = sectionRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isInView) {
          setIsInView(true);
        }
      },
      {
        threshold: 0.1, // 섹션의 10%가 보일 때 트리거
        rootMargin: "0px 0px -100px 0px", // 뷰포트 하단 100px 전에 트리거
      }
    );

    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, [isInView]);

  // Sequence the chat - 섹션이 보일 때만 시작
  useEffect(() => {
    if (!isInView) {
      // 섹션이 보이지 않을 때 상태 초기화
      setTypingState(null);
      setShownStudentMessages(new Set());
      setShownAIResponses(new Set());
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    let currentTime = 1000; // 1초 후 시작

    // 각 학생 메시지를 순차적으로 타이핑 시작
    studentMessages.forEach((message, index) => {
      const typingDuration = message.length * 50; // 각 글자당 50ms

      // 타이핑 시작
      timers.push(
        setTimeout(() => {
          setTypingState({
            isTyping: true,
            text: message,
            messageId: index,
          });
        }, currentTime)
      );

      // 타이핑 완료 후 메시지 표시
      currentTime += typingDuration;
      timers.push(
        setTimeout(() => {
          setTypingState(null);
          setShownStudentMessages((prev) => new Set([...prev, index]));
        }, currentTime)
      );

      // 메시지 표시 후 다음 단계를 위한 딜레이
      // 마지막 메시지가 아닌 경우: AI 응답 표시
      if (index < studentMessages.length - 1) {
        currentTime += 800; // 메시지 전송 후 AI 응답까지의 대기 시간
        timers.push(
          setTimeout(() => {
            setShownAIResponses((prev) => new Set([...prev, index]));
          }, currentTime)
        );
        // AI 응답 표시 후 다음 학생 메시지까지의 대기 시간
        currentTime += 1200;
      } else {
        // 마지막 메시지 후 약간의 딜레이 후 "메시지를 입력하세요" 다시 표시 (이미 typingState가 null이므로 자동으로 표시됨)
        currentTime += 500;
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  // Helper for card styling
  const cardStyle = {
    backgroundColor: colors.chromeBg,
    borderColor: colors.cardBorder,
    boxShadow:
      mode === "dark"
        ? "0 4px 20px -5px rgba(0, 0, 0, 0.5)"
        : "0 10px 30px -10px rgba(0, 0, 0, 0.1)",
  };

  return (
      <div ref={sectionRef} className="relative w-full max-w-[1400px] mx-auto mt-16 lg:mt-24 perspective-1000 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PANEL: EXAM (3 cols) - Redesigned as Student Final Answer & Cheating Detection */}
        <div
          id="cheating-detection-panel"
          className="lg:col-span-3 rounded-xl overflow-hidden border flex flex-col min-h-[400px] lg:h-[500px] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)]"
          style={{
            ...cardStyle,
            opacity: isInView ? 1 : 0,
            transform: isInView ? "translateY(0)" : "translateY(20px)",
            transitionDelay: isInView ? "0.1s" : "0s",
            pointerEvents: isInView ? "auto" : "none",
          }}
        >
          {/* Header */}
          <div
            className="h-14 border-b flex items-center justify-between px-4 bg-background"
            style={{ borderColor: colors.cardBorder }}
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-success-solid text-success-solid-foreground">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground">
                  {t("demo.finalAnswer.heading")}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {t("demo.finalAnswer.subtitle")}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-3 flex-1 flex flex-col gap-3 overflow-hidden text-xs bg-muted/50">
            {/* Status Badges */}
            <div className="flex gap-2">
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border bg-destructive/10 border-destructive/30 text-destructive">
                <TriangleAlert className="w-3 h-3" />
                <span className="font-semibold text-[10px]">
                  {t("demo.cheating.externalPaste")}
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border bg-info-surface border-primary text-info-text">
                <Copy className="w-3 h-3" />
                <span className="font-semibold text-[10px]">
                  {t("demo.cheating.internalCopy")}
                </span>
              </div>
            </div>

            {/* Suspicious Activity Box (Red) */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-center gap-1.5 mb-2 text-destructive">
                <TriangleAlert className="w-3.5 h-3.5" />
                <span className="font-bold text-[11px]">
                  {t("demo.cheating.suspiciousHeading")}
                </span>
              </div>
              <ul className="space-y-1 text-[10px] text-destructive/80 font-mono">
                <li>• 84자 외부 붙여넣기 (오전 12:18:12)</li>
                <li>• 380자 외부 붙여넣기 (오전 12:35:10)</li>
                <li>• 112자 외부 붙여넣기 (오전 12:38:22)</li>
              </ul>
            </div>

            {/* Internal Copy Box (Blue) */}
            <div className="rounded-lg border border-primary bg-info-surface p-3">
              <div className="flex items-center gap-1.5 mb-2 text-info-text">
                <Copy className="w-3.5 h-3.5" />
                <span className="font-bold text-[11px]">{t("demo.cheating.internalCopyHeading")}</span>
              </div>
              <ul className="space-y-1 text-[10px] text-info-text/80 font-mono">
                <li>• 149자 내부 복사 (오전 12:22:23)</li>
                <li>• 116자 내부 복사 (오전 12:23:08)</li>
                <li>• 80자 내부 복사 (오전 12:23:39)</li>
              </ul>
            </div>

            {/* Answer Content Snippet */}
            <div
              className="flex-1 rounded-lg border bg-background/50 p-3 space-y-2 overflow-hidden shadow-sm"
              style={{ borderColor: colors.cardBorder }}
            >
              <div className="font-bold text-muted-foreground text-[11px]">
                0. 문제 제시 후 사고 과정
              </div>
              <div className="text-[10px] leading-relaxed text-muted-foreground">
                - 뛰어난 기술을 돋보이게 할 수 있는 프로모션(마케팅)이
                필요하고...
                <br />
                <span className="bg-danger-subtle text-danger-text px-1 py-0.5 rounded box-decoration-clone">
                  - 프리미엄 전기자전거라면 불가피하게 가격을 고가로 설정하거나,
                  프리미엄 이미지를 설정해야 하고
                </span>
                이에 따라 그 가격을 받아들일 타겟을 설정해야겠다고 생각함.
              </div>
            </div>
          </div>
        </div>

        {/* CENTER PANEL: CHAT HISTORY (5 cols) */}
        <div
          className="lg:col-span-5 rounded-xl overflow-hidden border flex flex-col min-h-[500px] lg:h-[700px] shadow-2xl z-10 relative bg-background transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_25px_70px_-15px_rgba(59,130,246,0.35)]"
          style={{
            backgroundColor: mode === "dark" ? colors.chromeBg : "#ffffff",
            boxShadow:
              mode === "dark"
                ? "0 0 60px -15px rgba(59, 130, 246, 0.2)"
                : "0 20px 60px -15px rgba(0, 0, 0, 0.15)",
            borderColor:
              mode === "dark" ? "rgba(59, 130, 246, 0.3)" : colors.cardBorder,
            opacity: isInView ? 1 : 0,
            transform: isInView ? "translateY(0)" : "translateY(20px)",
            transitionDelay: isInView ? "0.2s" : "0s",
            pointerEvents: isInView ? "auto" : "none",
          }}
        >
          {/* Header */}
          <div
            className="h-16 border-b flex items-center justify-between px-5 bg-background/90 backdrop-blur-sm"
            style={{ borderColor: colors.cardBorder }}
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-info-text" />
              <div>
                <div className="text-sm font-bold text-foreground">
                  {t("demo.chat.heading")}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {t("demo.chat.subtitle")}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6 bg-muted/50 font-sans">
            {/* Timestamp Separator */}
            <div className="flex justify-center">
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">
                오전 1:07:08
              </span>
            </div>

            {/* Message 1: Student */}
            {shownStudentMessages.has(0) && (
              <div className="flex justify-end gap-2 animate-fade-in-up-xs">
                <div className="flex flex-col items-end max-w-[85%]">
                  <div className="bg-primary text-white px-4 py-3 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-sm">
                    경쟁사 제품 대비 그린휠의 제품은 얼마나 가벼워? 얼마나
                    경량화가 됐어?
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 mr-1">
                    오전 1:08:57
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <div className="w-4 h-4 rounded-full border-2 border-primary" />
                </div>
              </div>
            )}

            {/* Message 2: AI */}
            {shownAIResponses.has(0) && (
              <div className="flex justify-start gap-2 animate-fade-in-up-xs">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col items-start max-w-[85%]">
                  <div className="bg-background border px-4 py-3 rounded-2xl rounded-tl-sm text-xs leading-relaxed text-foreground shadow-sm">
                    그린휠 E-Prime One은 평균{" "}
                    <span className="font-bold">17kg</span>으로 경쟁사 평균(약
                    21~23kg) 대비{" "}
                    <span className="font-bold">약 20% 경량화</span>
                    되었습니다.
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 ml-1">
                    오전 1:08:58
                  </span>
                </div>
              </div>
            )}

            {/* Message 3: Student */}
            {shownStudentMessages.has(1) && (
              <div className="flex justify-end gap-2 animate-fade-in-up-xs">
                <div className="flex flex-col items-end max-w-[85%]">
                  <div className="bg-primary text-white px-4 py-3 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-sm">
                    전기 자전거가 경량화가 되면 뭐가 좋아?
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 mr-1">
                    오전 1:13:00
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <div className="w-4 h-4 rounded-full border-2 border-primary" />
                </div>
              </div>
            )}

            {/* Message 4: AI */}
            {shownAIResponses.has(1) && (
              <div className="flex justify-start gap-2 animate-fade-in-up-xs">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col items-start max-w-[85%]">
                  <div className="bg-background border px-4 py-3 rounded-2xl rounded-tl-sm text-xs leading-relaxed text-foreground shadow-sm">
                    전기자전거가 경량화되면{" "}
                    <span className="font-bold">
                      휴대성·가속성·주행 효율성이 향상되고 배터리 소모가 감소
                    </span>
                    합니다.
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 ml-1">
                    오전 1:13:03
                  </span>
                </div>
              </div>
            )}

            {/* New Student Message (last - after typing) */}
            {shownStudentMessages.has(2) && (
              <div className="flex justify-end gap-2 animate-fade-in-up-xs">
                <div className="flex flex-col items-end max-w-[85%]">
                  <div className="bg-primary text-white px-4 py-3 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-sm">
                    배터리 수명은 어느 정도야?
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 mr-1">
                    오전 1:13:45
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <div className="w-4 h-4 rounded-full border-2 border-primary" />
                </div>
              </div>
            )}
          </div>

          {/* Input Area (Mock) */}
          <div
            className="p-3 border-t bg-white dark:bg-zinc-900"
            style={{ borderColor: colors.cardBorder }}
          >
            <div
              className="h-10 rounded-full border bg-zinc-50 dark:bg-zinc-800/50 flex items-center px-4 justify-between"
              style={{ borderColor: colors.cardBorder }}
            >
              {typingState?.text ? (
                <span className="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1">
                  <TypingText
                    text={typingState?.text || ""}
                    duration={50}
                    delay={0}
                    inView={true}
                    inViewOnce={false}
                  >
                    <TypingTextCursor />
                  </TypingText>
                </span>
              ) : (
                <span className="text-xs text-zinc-400">
                  {t("demo.chat.placeholder")}
                </span>
              )}
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                <ArrowRight className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: GRADING (4 cols) */}
        <div
          id="ai-grading-panel"
          className="lg:col-span-4 rounded-xl overflow-hidden border flex flex-col min-h-[400px] lg:h-[500px] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)]"
          style={{
            ...cardStyle,
            opacity: isInView ? 1 : 0,
            transform: isInView ? "translateY(0)" : "translateY(20px)",
            transitionDelay: isInView ? "0.3s" : "0s",
            pointerEvents: isInView ? "auto" : "none",
          }}
        >
          {/* Header */}
          <div
            className="h-10 border-b flex items-center px-4 gap-2"
            style={{ borderColor: colors.cardBorder }}
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              {t("demo.grading.heading")}
            </span>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col gap-3 text-xs overflow-hidden">
            {/* 1. Score & Opinion */}
            <div className="flex gap-4 items-start">
              <div className="flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-3 min-w-[70px]">
                <div className="text-2xl font-black font-mono text-zinc-800 dark:text-white">
                  <SlidingNumber
                    number={92}
                    fromNumber={0}
                    inView={isInView}
                    inViewOnce={true}
                    transition={{ stiffness: 200, damping: 20, mass: 0.4 }}
                    delay={0.4}
                  />
                </div>
                <div className="text-[9px] opacity-60 uppercase tracking-tight">
                  Total Score
                </div>
              </div>
              <div className="flex-1 opacity-80 leading-relaxed line-clamp-3">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {t("demo.grading.opinionLabel")}{" "}
                </span>
                이 학생의 답안은 전반적으로 논리적이며 마케팅 이론의 구조를
                충실히 따르고 있습니다. 3C와 SWOT 분석이 구체적으로 연결되어
                높은 설득력을 가집니다.
              </div>
            </div>

            {/* 2. Key Quote (Yellow) */}
            <div className="rounded-lg bg-yellow-400/10 border border-yellow-400/20 p-3 text-yellow-700 dark:text-yellow-400 relative">
              <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
                <MessageSquare className="w-3 h-3 fill-current" />
                <span className="text-[10px] font-bold uppercase">
                  {t("demo.grading.highlightLabel")}
                </span>
              </div>
              <div className="italic leading-relaxed opacity-90">
                &quot;기술 중심 브랜드를 선호하면서도 친환경 소비에 민감한
                MZ세대를 타겟으로 설정...&quot;
              </div>
            </div>

            {/* 3. Strengths & Improvements Grid */}
            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
              {/* Strengths (Blue) */}
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex flex-col gap-2">
                <div className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1">
                  <Plus className="w-3 h-3" /> {t("demo.grading.strengthsLabel")}
                </div>
                <ul className="list-disc pl-3 space-y-1.5 opacity-80 leading-snug">
                  <li>3C 및 SWOT 분석 간 논리적 일관성 우수</li>
                  <li>타겟 세그먼트 선정의 구체성</li>
                  <li>차별점 명확히 제시함</li>
                </ul>
              </div>

              {/* Improvements (Orange) */}
              <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-3 flex flex-col gap-2">
                <div className="text-orange-600 dark:text-orange-400 font-bold flex items-center gap-1">
                  <div className="w-2.5 h-0.5 bg-current rounded-full" /> {t("demo.grading.improvementsLabel")}
                </div>
                <ul className="list-disc pl-3 space-y-1.5 opacity-80 leading-snug">
                  <li>유통전략(Place)의 구체성 부족</li>
                  <li>옴니채널 전략 미흡</li>
                  <li>프로모션 실행 메커니즘 모호</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background Decor Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-[500px] bg-blue-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
    </div>
  );
};

export default function HeroSection({
  headline,
  subheadline,

  ctaText,
  //   onCtaClick,
  mode = "light",
}: HeroSectionProps) {
  const colors = COLORS[mode];
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const t = useTranslations("landing");
  const resolvedCtaText = ctaText ?? t("hero.cta.start");

  return (
    <div
      className="min-h-screen overflow-x-hidden transition-colors duration-300"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {/* Navbar removed to use global Header */}

      <main className="container mx-auto px-4 pt-16 pb-16 md:pt-24 md:pb-24 lg:pt-32 lg:pb-32 relative">
        {/* Text Content */}
        <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">
          {/* Badge removed */}

          {/* Headline */}
          <h1
            className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.2] animate-fade-in-up-sm"
            style={{ 
              color: colors.text, 
              animationDelay: "0.1s",
              letterSpacing: "-0.01em"
            }}
          >
            {headline}
          </h1>

          {/* Subheadline */}
          <p
            className="text-base md:text-lg max-w-2xl mx-auto leading-[1.6] animate-fade-in-up-sm"
            style={{ 
              color: colors.textSec, 
              animationDelay: "0.2s",
              letterSpacing: "-0.3px"
            }}
          >
            {subheadline}
          </p>

          {/* Buttons */}
          <div
            className="flex flex-col items-center justify-center gap-4 pt-4 animate-fade-in-up-sm"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className={cn(
                  "group relative inline-flex items-center justify-center gap-2 px-8 py-4 text-sm font-semibold transition-all duration-200 rounded-full text-white border-transparent shadow-lg",
                  "bg-gradient-to-r from-primary via-primary/90 to-primary/80",
                  "hover:from-primary/90 hover:via-primary hover:to-primary/90",
                  "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {resolvedCtaText}
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </Link>

              <button
                onClick={() => setIsVideoOpen(!isVideoOpen)}
                className="text-sm font-semibold px-6 py-4 flex items-center gap-2 transition-all duration-200 rounded-full shadow-sm hover:shadow-md active:scale-[0.98]"
                style={{
                  color: colors.text,
                  backgroundColor: mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                  border: `1px solid ${mode === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`,
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                {t("hero.cta.watchDemo")}
              </button>
            </div>

            {/* Video Section */}
            {isVideoOpen && (
              <div className="w-full max-w-4xl mt-6 animate-fade-in-up-sm">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-2xl">
                  <iframe
                    src="https://www.youtube.com/embed/yjKH4Nzy_Xk"
                    title={t("hero.cta.demoVideoTitle")}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hero Visual (Simulating Quest-On) */}
        <ProductSimulation mode={mode} />
      </main>

      {mode === "dark" && (
        <div className="fixed inset-0 pointer-events-none -z-50 bg-gradient-to-b from-black via-transparent to-black" />
      )}
    </div>
  );
}
