"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * DeploymentSection — 실제 강의 현장 배포 연혁(마일스톤) 섹션.
 *
 * 카톡 2026-08-03 이준 제안: "강의 연혁 같은거 사진이랑 같이 mvp에 올려두면
 * 교수 이모지형 단순 인용보다 효과적일 것" → 추상적 testimonial 대신
 * 검증된 누적 지표 + 시기별 배포 마일스톤(실제 강의 사진 포함)으로
 * 현장 증빙을 보여준다.
 *
 * 지표(441/350+/11/3)는 vault SSOT([[Quest-On]] traction, 2026-08-02 정정) 기반.
 * 마일스톤·사진은 회사 LinkedIn에 실제 게시된 기록 기반이다
 * (홍익대 도입 2026-05-11, 동국대 중간고사 2026-05-17, 숙명여대 강연 2026-05-23,
 * 동국대 MBA 2026-06-07, 고려대 extra credit 2026-06-28 게시물).
 * 사진 원본은 public/landing/milestones/ 아래 둔다.
 */

type Metric = { value: string; labelKey: string };

// 검증된 누적 지표 (vault Quest-On traction, 2026-08-02)
const METRICS: Metric[] = [
  { value: "441", labelKey: "attempts" },
  { value: "350+", labelKey: "signups" },
  { value: "11", labelKey: "exams" },
  { value: "3", labelKey: "universities" },
];

type Milestone = {
  key: string;
  /** public/ 기준 실제 강의 현장 사진 경로 */
  image: string;
  /** 문서 스크린샷처럼 전체를 보여야 하는 이미지는 contain */
  fit?: "cover" | "contain";
};

// 시기순 배포 연혁. 텍스트는 messages/*/landing.json deployment.milestones.* 에 둔다.
const MILESTONES: Milestone[] = [
  { key: "hongik", image: "/landing/milestones/hongik-2025.jpg" },
  {
    key: "donggukMidterm",
    image: "/landing/milestones/dongguk-midterm-2026-04.jpg",
  },
  {
    key: "sookmyung",
    image: "/landing/milestones/sookmyung-lecture-2026-05.jpg",
  },
  { key: "donggukMba", image: "/landing/milestones/dongguk-mba-2026-06.jpg" },
  {
    key: "koreaExtraCredit",
    image: "/landing/milestones/korea-extracredit-2026-06.jpg",
    fit: "contain",
  },
];

export default function DeploymentSection() {
  const t = useTranslations("landing");

  return (
    <section
      id="deployment"
      className={`w-full py-20 lg:py-28 ${"bg-background"}`}
    >
      <div className="container mx-auto px-4 lg:px-6">
        {/* 타이틀 */}
        <div className="mx-auto mb-14 lg:mb-20 max-w-4xl text-center">
          <p
            className={`text-xs font-bold uppercase tracking-[0.2em] mb-4 ${
              "text-muted-foreground"
            }`}
          >
            {t("deployment.badge")}
          </p>
          <h2
            className={`text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl animate-fade-in-up-sm ${
              "text-[#1F1F1F]"
            }`}
            style={{ letterSpacing: "-0.01em" }}
          >
            {t("deployment.sectionTitle.line1")}
            <br />
            {t("deployment.sectionTitle.line2")}
          </h2>
          <p
            className={`mt-6 text-base md:text-lg leading-relaxed ${
              "text-muted-foreground"
            }`}
          >
            {t("deployment.subtitle")}
          </p>
        </div>

        {/* 누적 지표 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 max-w-5xl mx-auto mb-16 lg:mb-24">
          {METRICS.map((m) => (
            <div
              key={m.labelKey}
              className={`flex flex-col items-center justify-center text-center rounded-3xl p-6 lg:p-8 border transition-all ${
                "bg-background border-border shadow-sm"
              }`}
            >
              <div className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter gradient-animated-blue">
                {m.value}
              </div>
              <div
                className={`mt-2 text-xs md:text-sm font-bold uppercase tracking-[0.15em] ${
                  "text-muted-foreground"
                }`}
              >
                {t(`deployment.metrics.${m.labelKey}`)}
              </div>
            </div>
          ))}
        </div>

        {/* 배포 연혁 타임라인 */}
        <div className="relative max-w-5xl mx-auto">
          {/* 세로 척추선 (모바일: 왼쪽, 데스크탑: 중앙) */}
          <div
            aria-hidden
            className={`absolute top-0 bottom-0 left-4 md:left-1/2 w-px md:-translate-x-1/2 ${
              "bg-muted"
            }`}
          />
          <ol className="space-y-12 lg:space-y-16">
            {MILESTONES.map((m, i) => {
              const reverse = i % 2 === 1;
              return (
                <li key={m.key} className="relative pl-12 md:pl-0">
                  {/* 시점 마커 */}
                  <div
                    aria-hidden
                    className={`absolute left-4 md:left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full ring-4 bg-gradient-to-br from-primary to-primary ${
                      "ring-white"
                    }`}
                  />
                  <div
                    className={`flex flex-col gap-6 md:items-center md:gap-10 ${
                      reverse ? "md:flex-row-reverse" : "md:flex-row"
                    }`}
                  >
                    {/* 현장 사진 */}
                    <div className="md:w-1/2">
                      <div
                        className={`relative aspect-[4/3] overflow-hidden rounded-3xl border ${
                          "border-border shadow-sm"
                        }`}
                      >
                        <Image
                          src={m.image}
                          alt={t(`deployment.milestones.${m.key}.alt`)}
                          fill
                          sizes="(max-width: 768px) 100vw, 40vw"
                          className={m.fit === "contain" ? "object-contain p-4" : "object-cover"}
                          loading="lazy"
                        />
                      </div>
                    </div>
                    {/* 시기·내용 */}
                    <div className={`md:w-1/2 ${reverse ? "md:text-right" : ""}`}>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] gradient-animated-blue">
                        {t(`deployment.milestones.${m.key}.date`)}
                      </p>
                      <h3
                        className={`mt-2 text-xl md:text-2xl font-black tracking-tight ${
                          "text-[#1F1F1F]"
                        }`}
                      >
                        {t(`deployment.milestones.${m.key}.title`)}
                      </h3>
                      <p
                        className={`mt-3 text-sm md:text-base leading-relaxed ${
                          "text-muted-foreground"
                        }`}
                      >
                        {t(`deployment.milestones.${m.key}.description`)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 출처 */}
        <p
          className={`mt-14 text-center text-xs md:text-sm ${
            "text-muted-foreground"
          }`}
        >
          {t("deployment.sourcePrefix")}{" "}
          <a
            href="https://www.linkedin.com/company/quest-on/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-4 hover:opacity-80"
          >
            LinkedIn
          </a>
        </p>
      </div>
    </section>
  );
}
