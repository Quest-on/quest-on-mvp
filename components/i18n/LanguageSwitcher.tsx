"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/i18n/actions";
import { locales, type Locale } from "@/lib/i18n/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages, Check } from "lucide-react";

const LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

/**
 * 언어 스위처 — 쿠키에 로케일 저장 후 서버 컴포넌트 리프레시.
 * - "button"/"compact": 독립 드롭다운 트리거.
 * - "inline": 드롭다운 없는 ko/en 세그먼트 토글(다른 메뉴 안에 임베드용).
 */
export function LanguageSwitcher({
  variant = "button",
}: {
  variant?: "button" | "compact" | "inline";
}) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const change = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  if (variant === "inline") {
    return (
      <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Language">
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            disabled={isPending}
            onClick={() => change(l)}
            className={`px-2 py-0.5 text-xs transition-colors ${
              l === locale
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "compact" ? "icon" : "sm"}
          disabled={isPending}
          aria-label="Change language"
          className="gap-2"
        >
          <Languages className="h-4 w-4" />
          {variant === "button" && <span>{LABELS[locale]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem key={l} onClick={() => change(l)} className="gap-2">
            <Check className={`h-4 w-4 ${l === locale ? "opacity-100" : "opacity-0"}`} />
            {LABELS[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
