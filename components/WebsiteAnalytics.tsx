"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Analytics } from "@vercel/analytics/next";
import {
  ANALYTICS_CHOICE_KEY, type AnalyticsChoice, campaignParameters,
  marketingPage, readAnalyticsChoice, safeReferrer, sanitizeAnalyticsUrl, validMeasurementId,
} from "@/lib/website-analytics";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const configured = process.env.NEXT_PUBLIC_GA4_ENABLED === "true" && validMeasurementId(measurementId);

function command(...args: unknown[]) {
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  // Google's queue expects an arguments object, not a nested JSON event.
  // eslint-disable-next-line prefer-rest-params -- Preserve the Google tag's documented arguments-object queue protocol.
  target.gtag ??= function () { target.dataLayer!.push(arguments); };
  target.gtag(...args);
}

export function WebsiteAnalytics() {
  const pathname = usePathname();
  const t = useTranslations("common.analytics");
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const lastPage = useRef<string | null>(null);
  const initialized = useRef(false);
  const publicPage = marketingPage(pathname);

  useEffect(() => {
    // Storage can be unavailable in restricted/private browser contexts.
    let saved: AnalyticsChoice | null = null;
    try { saved = readAnalyticsChoice(window.localStorage); } catch { /* optional analytics */ }
    // Defer the external-store read to avoid synchronous effect state updates.
    queueMicrotask(() => { setChoice(saved); setReady(true); });
    const onStorage = () => {
      try { setChoice(readAnalyticsChoice(window.localStorage)); } catch { setChoice(null); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!configured || !measurementId) return;
    const allowed = choice === "granted" && Boolean(publicPage);
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = !allowed;
    if (!allowed) { lastPage.current = null; return; }

    if (!initialized.current) {
      initialized.current = true;
      command("consent", "default", {analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
      command("js", new Date());
      command("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: sanitizeAnalyticsUrl(window.location.href),
        page_referrer: safeReferrer(document.referrer),
        page_title: publicPage,
        ...campaignParameters(window.location.search),
      });
      if (!document.getElementById("quest-on-ga4")) {
        const script = document.createElement("script");
        script.id = "quest-on-ga4";
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.appendChild(script);
      }
    }
    if (lastPage.current !== pathname) {
      command("event", "page_view", {
        page_location: sanitizeAnalyticsUrl(window.location.href),
        page_title: publicPage,
        page_referrer: safeReferrer(document.referrer),
        ...campaignParameters(window.location.search),
      });
      lastPage.current = pathname;
    }
    // Only explicit public signup links; never scrape form values or link text.
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href) return;
      try {
        const target = new URL(href, window.location.origin);
        if (target.origin === window.location.origin && target.pathname === "/sign-up") {
          command("event", "signup_start", {page_title:publicPage, page_location:sanitizeAnalyticsUrl(window.location.href)});
        }
      } catch { /* malformed href cannot interrupt navigation */ }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [choice, pathname, publicPage]);

  function choose(value: AnalyticsChoice) {
    try { window.localStorage.setItem(ANALYTICS_CHOICE_KEY, value); } catch { /* session choice still works */ }
    setChoice(value);
    setEditing(false);
  }

  return <>
    <Analytics beforeSend={(event) => {
      const url = sanitizeAnalyticsUrl(event.url);
      return url ? {...event, url} : null;
    }} />
    {configured && ready && publicPage && (
      !choice || editing ? <aside aria-label={t("title")} className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border bg-background p-4 text-foreground shadow-lg">
        <p className="text-sm">{t("description")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => choose("denied")}>{t("decline")}</button>
          <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => choose("granted")}>{t("allow")}</button>
          <a href="/legal/cookies" className="text-sm underline">{t("details")}</a>
        </div>
      </aside> : <button type="button" className="fixed bottom-2 left-2 z-40 rounded border bg-background px-2 py-1 text-xs text-foreground" onClick={() => setEditing(true)}>{t("settings")}</button>
    )}
  </>;
}
