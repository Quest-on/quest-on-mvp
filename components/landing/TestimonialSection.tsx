"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Quote } from "lucide-react";
import { useTranslations } from "next-intl";

const MARQUEE_FAST_MS = 36000;
const MARQUEE_SLOW_MS = 50000;

/**
 * =============================================================================
 * TESTIMONIAL CARD 디자인 스펙
 * =============================================================================
 *
 * 각 카드는 3레이어 구조 (뒤→앞):
 *
 * 1) 카드 컨테이너 (가장 바깥 div)
 *    - 레이아웃: flex flex-col, relative, overflow-hidden
 *    - 모서리: rounded-[2.5rem] (40px)
 *    - 패딩: p-8 md:p-10 (32px / 40px)
 *    - 테두리: border, light → border-border, dark → border-border
 *    - 배경: light → bg-background, dark → bg-muted/40
 *    - 그림자: light → shadow-xl shadow-zinc-200/50
 *    - 호버: hover:shadow-2xl hover:-translate-y-2, transition-all
 *    - 애니메이션: animate-fade-in-up-sm, animationDelay = index * 0.15s
 *
 * 2) 아바타 배경 레이어 (z-0)
 *    - 위치: absolute bottom-0 right-0
 *    - 크기: w-48 h-48 → md:w-56 md:h-56 → lg:w-64 lg:h-64
 *    - 투명도: opacity-70, group-hover:opacity-80
 *    - 이미지: object-contain object-right-bottom (오른쪽 하단 정렬)
 *    - 역할: 카드 오른쪽 하단에 교수님 실루엣으로 시각적 포인트
 *
 * 3) 그라데이션 오버레이 (z-[5])
 *    - 위치: absolute inset-0, pointer-events-none
 *    - light: from-white/95 via-white/70 to-transparent
 *    - dark:  from-zinc-900/90 via-zinc-900/50 to-transparent
 *    - 역할: 아바타 위에 텍스트가 잘 읽이도록 왼쪽→오른쪽 그라데이션
 *
 * 4) 콘텐츠 영역 (z-10, relative)
 *    - 최소 높이: min-h-[280px] md:min-h-[320px]
 *    - 구성 (위→아래):
 *      a) Quote 아이콘: w-8 h-8 md:w-10 md:h-10, blue 계열, hover 시 진해짐
 *      b) 인용문(blockquote): text-base~xl, font-bold, leading-[1.6], letterSpacing -0.3px
 *         - 텍스트 가독성용 textShadow (light/dark 각각)
 *      c) 교수 정보: 로고(8x8 md:10x10) + 이름 + 소속(uppercase, tracking-[0.2em])
 *
 * 그리드: grid-cols-1 / md:grid-cols-3, gap-8
 *
 * =============================================================================
 */

const TESTIMONIALS = [
  {
    quote:
      "단순 암기를 넘어 문제 해결에 몰입하게 만드는 변화, AI의 실시간 피드백이 교수 설계의 새로운 영감을 줍니다.",
    name: "강현정 교수님",
    title: "홍익대학교",
    avatar: "/kang_pf-removebg-preview.png",
    logo: "/hongik_emblem_blue.png",
  },
  {
    quote:
      "AI시대 새롭게 요구되는 인재상에 대비할 수 있는 방법입니다. 많은 교수자님께서도 관심과 응원 부탁드립니다.",
    name: "이중학 교수님",
    title: "동국대학교",
    avatar: "/lee_pf-avatar.png",
    logo: "/dongguk_emblem.png",
    avatarFade: true, // 정장 하단이 딱 잘려 보여 아랫면만 흐림 처리(크기는 기본 규격)
  },
  {
    quote:
      "AI 시대에 꼭 필요한 '사고 과정' 평가의 해답. 공정성과 설명 가능성을 모두 갖춘 혁신적인 플랫폼입니다.",
    name: "권효찬 교수님",
    title: "경기과학기술대학교",
    avatar: "/kwan_pf-removebg-preview.png",
    logo: "/gtec_logo.svg",
  },
  {
    quote:
      "기존 시험으로는 불가능했던 '추론 과정의 가시화', Quest-On을 통해 진정한 의미의 평가가 시작되었습니다.",
    name: "최인대 교수님",
    title: "경기과학기술대학교",
    avatar: "/choi_pf-removebg-preview.png",
    logo: "/gtec_logo.svg",
  },
  {
    quote: "학생-교수 모두에게 의미가 있는 가치있는 시도입니다",
    name: "장진욱 교수님",
    title: "고려대학교",
    avatar: "/jangjinook-removebg-preview.png",
    logo: "/korea_logo.svg",
    avatarSize: "small" as const, // 이미지 스타일 차이로 비율 맞추기
  },
];

type Testimonial = (typeof TESTIMONIALS)[number];

function TestimonialCard({
  testimonial,
}: {
  testimonial: Testimonial;
}) {
  return (
    <div
      className={`group relative flex flex-col w-[320px] md:w-[380px] flex-shrink-0 rounded-[2.5rem] p-8 md:p-10 border transition-all hover:shadow-2xl hover:-translate-y-2 overflow-hidden ${
        "bg-background border-border shadow-xl shadow-zinc-200/50"
      }`}
    >
      {/* 이미지 배경 - 오른쪽 하단. 고려대 교수님만: 4px 띄움 + 아랫면 흐림, 나머지 3명은 원래 스타일 */}
      <div
        className={`absolute right-0 z-0 ${
          testimonial.avatarSize === "small"
            ? "bottom-1 w-48 h-48 md:w-52 md:h-52 lg:w-56 lg:h-56"
            : "bottom-0 w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64"
        }`}
      >
        <div className="relative w-full h-full opacity-70 group-hover:opacity-80 transition-opacity">
          <Image
            src={testimonial.avatar}
            alt={testimonial.name}
            width={256}
            height={256}
            sizes="(max-width: 768px) 12rem, (max-width: 1024px) 14rem, 16rem"
            className="h-full w-full object-contain object-right-bottom"
            loading="lazy"
          />
          {(testimonial.avatarSize === "small" || testimonial.avatarFade) && (
            <div
              className={`absolute inset-x-0 bottom-0 h-2/5 pointer-events-none bg-gradient-to-t ${
                "from-white"
              } to-transparent`}
              aria-hidden
            />
          )}
        </div>
      </div>

      {/* 그라데이션 오버레이 - 텍스트 영역 가시성 향상 */}
      <div
        className={`absolute inset-0 z-[5] pointer-events-none ${
          "bg-gradient-to-r from-white/95 via-white/70 to-transparent"
        }`}
      />

      {/* 콘텐츠 영역 */}
      <div className="relative z-10 flex flex-col flex-1 min-h-[280px] md:min-h-[320px]">
        <div className="mb-6">
          <Quote
            className={`w-8 h-8 md:w-10 md:h-10 transition-colors duration-300 ${
              "text-info-text/10 group-hover:text-info-text"
            }`}
            style={{
              filter: "drop-shadow(0 2px 4px rgba(255, 255, 255, 1))",
            }}
          />
        </div>

        <blockquote className="flex-1 mb-8 pr-4 md:pr-8">
          <p
            className={`text-base md:text-lg lg:text-xl leading-[1.6] font-bold tracking-tight ${
              "text-[#1F1F1F]"
            }`}
            style={{
              letterSpacing: "-0.3px",
              textShadow: "0 2px 4px rgba(255, 255, 255, 1), 0 0 12px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(255, 255, 255, 1)",
            }}
          >
            &quot;{testimonial.quote}&quot;
          </p>
        </blockquote>

        {/* 교수님 정보 - 이미지 위에 배치 */}
        <div className="mt-10 pr-4 md:pr-8">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0 w-8 h-8 md:w-10 md:h-10">
              <Image
                src={testimonial.logo}
                alt={testimonial.title}
                width={40}
                height={40}
                sizes="40px"
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex-1">
              <div
                className={`text-base md:text-lg font-bold tracking-tight mb-1 ${
                  "text-[#1F1F1F]"
                }`}
                style={{
                  textShadow: "0 2px 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(255, 255, 255, 1)",
                }}
              >
                {testimonial.name}
              </div>
              <div
                className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] ${
                  "text-muted-foreground"
                }`}
                style={{
                  textShadow: "0 1px 2px rgba(255, 255, 255, 1), 0 0 6px rgba(255, 255, 255, 0.8)",
                }}
              >
                {testimonial.title}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialSection() {
  const [isHovered, setIsHovered] = useState(false);
  const t = useTranslations("landing");
  const trackRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  const durationMsRef = useRef(MARQUEE_FAST_MS);

  durationMsRef.current = isHovered ? MARQUEE_SLOW_MS : MARQUEE_FAST_MS;

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let rafId: number;
    const tick = (now: number) => {
      const elapsed = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const durationSec = durationMsRef.current / 1000;
      positionRef.current -= (50 / durationSec) * elapsed;
      if (positionRef.current < -50) positionRef.current += 50;
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${positionRef.current}%)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    lastTimeRef.current = performance.now();
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <section
      className={`w-full py-20 lg:py-28 ${"bg-background"}`}
    >
      <div className="container mx-auto px-4 lg:px-6">
        <div className="mx-auto mb-14 lg:mb-20 max-w-4xl text-center">
          <h2
            className={`text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl animate-fade-in-up-sm ${
              "text-[#1F1F1F]"
            }`}
            style={{ letterSpacing: "-0.01em" }}
          >
            {t("testimonial.sectionTitle.line1")}
            <br />
            {t("testimonial.sectionTitle.line2")}
          </h2>
        </div>

        {/* Marquee: JS로 위치 연속 유지하며 hover 시에만 느리게(50s), 기본 36s */}
        <div
          className="relative w-full overflow-hidden py-8 pb-12"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 좌측 페이드 */}
          <div
            className={`pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-24 md:w-32 lg:w-40 bg-gradient-to-r ${
              "from-white to-transparent"
            }`}
            aria-hidden
          />
          {/* 우측 페이드 */}
          <div
            className={`pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-24 md:w-32 lg:w-40 bg-gradient-to-l ${
              "from-white to-transparent"
            }`}
            aria-hidden
          />
          <div
            ref={trackRef}
            className="flex flex-nowrap w-max will-change-transform"
          >
            <div className="flex flex-nowrap gap-6 md:gap-8 pr-6 md:pr-8 flex-shrink-0">
              {TESTIMONIALS.map((testimonial) => (
                <TestimonialCard
                  key={`a-${testimonial.name}`}
                  testimonial={testimonial}
                />
              ))}
            </div>
            <div className="flex flex-nowrap gap-6 md:gap-8 pr-6 md:pr-8 flex-shrink-0">
              {TESTIMONIALS.map((testimonial) => (
                <TestimonialCard
                  key={`b-${testimonial.name}`}
                  testimonial={testimonial}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
