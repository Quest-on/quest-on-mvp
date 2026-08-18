"use client";

// framer-motion 제거됨 - 성능 최적화를 위해 애니메이션 제거 (실제로 사용되지 않았음)
// 이전: import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const PARTNERS = [
  { name: "홍익대학교", logo: "Hongik University" },
  { name: "동국대학교", logo: "Dongguk University" },
  { name: "고려대학교", logo: "Korea University" },
  { name: "경기과학기술대학교", logo: "GTEC" },
];

export default function LogoCloud({
  mode = "light",
}: {
  mode?: "light" | "dark";
}) {
  const isDark = mode === "dark";
  const t = useTranslations("landing");

  return (
    <section
      id="partners"
      className={`min-h-[400px] lg:min-h-[500px] flex items-center py-12 lg:py-16 ${
        isDark ? "bg-black" : "bg-background"
      }`}
    >
      <div className="container mx-auto px-4 lg:px-6 w-full">
        <div className="flex flex-col items-center justify-center gap-8">
          <p
            className={`text-xs font-bold uppercase tracking-[0.2em] ${
              "text-muted-foreground"
            }`}
          >
            {t("logoCloud.caption")}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 w-full max-w-5xl mx-auto gap-8 sm:gap-10 lg:gap-12 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
            {PARTNERS.map((partner) => (
              <div
                key={partner.name}
                className="flex flex-col items-center justify-center gap-3 group min-w-0 py-4"
              >
                <div
                  className={`text-lg sm:text-xl md:text-2xl font-black tracking-tighter text-center ${
                    isDark ? "text-white" : "text-[#1F1F1F]"
                  }`}
                >
                  {partner.name}
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity text-center ${
                    "text-muted-foreground"
                  }`}
                >
                  {partner.logo}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
