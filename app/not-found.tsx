"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, ArrowLeft, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function NotFound() {
  const t = useTranslations("auth.notFound");
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/50">
      <div className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <div className="text-center space-y-8 py-16">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Image
              src="/qlogo_icon.png"
              alt={t("logoAlt")}
              width={48}
              height={48}
              className="h-12 w-12"
            />
            <span className="font-bold text-3xl tracking-tight text-foreground">
              Quest-On
            </span>
          </div>

          {/* 404 Number */}
          <div className="relative">
            <h1
              className="text-[120px] sm:text-[160px] md:text-[200px] font-bold leading-none bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #3b82f6 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)",
                backgroundSize: "200% 200%",
                animation: "gradient-shift-blue-purple 4s ease infinite",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              404
            </h1>
          </div>

          {/* Error Message */}
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground">
              {t("heading")}
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("body1")}
              <br className="hidden sm:block" />
              {t("body2")}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Button
              onClick={() => router.back()}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-5 h-5" />
              {t("backBtn")}
            </Button>
            <Link href="/" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, #3b82f6 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)",
                  backgroundSize: "200% 200%",
                  animation: "gradient-shift-blue-purple 4s ease infinite",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #2563eb 0%, #4f46e5 25%, #7c3aed 50%, #9333ea 75%, #7e22ce 100%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #3b82f6 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)";
                }}
              >
                <Home className="w-5 h-5" />
                {t("homeBtn")}
              </Button>
            </Link>
          </div>

          {/* Helpful Links */}
          <div className="pt-12 border-t border-border/50">
            <p className="text-sm text-muted-foreground mb-4">
              {t("helpText")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                {t("mainPage")}
              </Link>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
              >
                {t("signIn")}
              </Link>
              <Link
                href="/sign-up"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
              >
                {t("signUp")}
              </Link>
              <a
                href={`mailto:questonkr@gmail.com?subject=${t("mailtoSubject")}`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                {t("contact")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

