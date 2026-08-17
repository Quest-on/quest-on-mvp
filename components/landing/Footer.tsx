"use client";

import { Mail, Phone } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface FooterProps {
  mode?: "light" | "dark";
}

const COLORS = {
  light: {
    bg: "#FFFFFF",
    text: "#1F1F1F",
    textSec: "#52525B", // Improved contrast: changed from #6B7280 to #52525B (zinc-600) for better WCAG AA compliance
    border: "#E5E5E5",
  },
  dark: {
    bg: "#0A0A0A",
    text: "#E4E4E4",
    textSec: "#A1A1AA",
    border: "rgba(255, 255, 255, 0.1)",
  },
} as const;

const FOOTER_LINKS_CONFIG = [
  {
    categoryKey: "product",
    links: [
      { labelKey: "main", href: "#hero" },
      { labelKey: "testimonials", href: "#features" },
      { labelKey: "partnership", href: "#partners" },
      { labelKey: "startFree", href: "/sign-up" },
    ],
  },
  //   {
  //     categoryKey: "resources",
  //     links: [
  //       { labelKey: "gettingStarted", href: "/docs/getting-started" },
  //       { labelKey: "changelog", href: "/changelog" },
  //       { labelKey: "apiDocs", href: "/docs/api" },
  //       { labelKey: "helpCenter", href: "/help" },
  //       { labelKey: "systemStatus", href: "/status" },
  //     ],
  //   },
  //   {
  //     categoryKey: "company",
  //     links: [
  //       { labelKey: "team", href: "/about" },
  //       { labelKey: "blog", href: "/blog" },
  //       { labelKey: "careers", href: "/careers" },
  //       { labelKey: "partnership", href: "/partners" },
  //       { labelKey: "contact", href: "mailto:questonkr@gmail.com" },
  //     ],
  //   },
  {
    categoryKey: "legal",
    links: [
      { labelKey: "terms", href: "/legal/terms" },
      { labelKey: "privacy", href: "/legal/privacy" },
      { labelKey: "security", href: "/legal/security" },
      { labelKey: "cookies", href: "/legal/cookies" },
    ],
  },
];

export default function Footer({ mode = "light" }: FooterProps) {
  const colors = COLORS[mode];
  const isDark = mode === "dark";
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  const handleContactClick = () => {
    window.location.href = "mailto:questonkr@gmail.com?subject=문의사항";
  };

  return (
    <footer
      className={`relative w-full py-8 ${
        isDark
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950/50"
          : "bg-gradient-to-br from-slate-50 via-white to-slate-50/50"
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8 max-w-7xl">
        <div className="flex flex-wrap lg:flex-nowrap gap-8 lg:gap-12 mb-12 lg:mb-16">
          {/* Left Section - Logo & Contact */}
          <div className="w-full lg:w-1/2">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <Image
                src="/qlogo_icon.png"
                alt={tc("brand.logoAlt")}
                width={40}
                height={40}
                sizes="40px"
                className="h-10 w-10"
                loading="lazy"
              />
              <span
                className="font-bold text-2xl tracking-tight"
                style={{ color: colors.text }}
              >
                {tc("brand.name")}
              </span>
            </div>

            {/* Description */}
            <p
              className="text-base lg:text-lg mb-8 leading-[1.6] max-w-lg"
              style={{
                color: colors.textSec,
                letterSpacing: "-0.3px"
              }}
            >
              {tc("footer.description").split("\n").map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </p>

            {/* Contact Button */}
            <button
              onClick={handleContactClick}
              className="px-8 py-3.5 rounded-full font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, #2563eb 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)",
                backgroundSize: "200% 200%",
                animation: "gradient-shift-blue-purple 4s ease infinite",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(135deg, #2563eb 0%, #4f46e5 25%, #7c3aed 50%, #9333ea 75%, #7e22ce 100%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(135deg, #2563eb 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)";
              }}
            >
              <Mail className="w-5 h-5" />
              {tc("footer.contactUs")}
            </button>

            {/* Contact Info */}
            <div className="mt-6 space-y-2">
              <p
                className="text-sm font-medium flex items-center gap-2"
                style={{ color: colors.textSec }}
              >
                <Mail className="w-4 h-4 font-bold" />:{" "}
                <a
                  href="mailto:questonkr@gmail.com"
                  className="hover:underline"
                  style={{ color: colors.text }}
                >
                  questonkr@gmail.com
                </a>
              </p>
              <p
                className="text-sm font-medium flex items-center gap-2"
                style={{ color: colors.textSec }}
              >
                <Phone className="w-4 h-4 font-bold" />:{" "}
                <a
                  href="tel:010-5096-8981"
                  className="hover:underline"
                  style={{ color: colors.text }}
                >
                  010-5096-8981
                </a>
              </p>
            </div>
          </div>

          {/* Right Section - Links */}
          <div className="w-full lg:w-1/2">
            <div className="grid grid-cols-2 gap-8 lg:gap-12">
              {FOOTER_LINKS_CONFIG.map(({ categoryKey, links }) => (
                <div key={categoryKey}>
                  <h5
                    className="text-xs font-bold uppercase tracking-widest mb-6 opacity-60"
                    style={{ color: colors.text }}
                  >
                    {t(`footer.categories.${categoryKey}`)}
                  </h5>
                  <ul className="space-y-3">
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
                        <li key={link.labelKey}>
                          <a
                            href={link.href}
                            onClick={handleClick}
                            className="text-sm font-medium transition-all cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                            style={{ color: colors.textSec }}
                          >
                            {t(`footer.links.${link.labelKey}`)}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar - Copyright */}
        <div
          className="pt-8 border-t"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
          }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div
              className="type-field-label"
              style={{ color: colors.textSec }}
            >
              Copyright © {new Date().getFullYear()}{" "}
              <span className="font-semibold" style={{ color: colors.text }}>
                Quest-On Inc.
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
