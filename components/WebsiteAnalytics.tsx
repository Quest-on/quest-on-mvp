"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { createSupabaseClient } from "@/lib/supabase-client";
import { postHogConfig, sanitizePostHogProperties, syncAnalyticsIdentity } from "@/lib/posthog-config";
import {
  ANALYTICS_CHOICE_KEY, ANALYTICS_CHOICE_COOKIE, type AnalyticsChoice, campaignParameters,
  marketingPage, readAnalyticsChoice, safeReferrer, sanitizeAnalyticsUrl,
} from "@/lib/website-analytics";

const config = postHogConfig();
let initialized = false;

export function WebsiteAnalytics() {
  const pathname = usePathname();
  const t = useTranslations("common.analytics");
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const lastPage = useRef<string | null>(null);
  const supportedPage = Boolean(sanitizeAnalyticsUrl(`https://quest-on.app${pathname}`));

  useEffect(() => {
    const read = () => {
      let saved: AnalyticsChoice | null = null;
      try { saved = readAnalyticsChoice(window.localStorage); } catch { /* optional */ }
      setChoice(saved);
      setReady(true);
    };
    queueMicrotask(read);
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  useEffect(() => {
    if (!config || !ready) return;
    document.cookie = `${ANALYTICS_CHOICE_COOKIE}=${choice ?? "denied"}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    if (choice !== "granted") {
      if (initialized) { posthog.reset(); posthog.opt_out_capturing(); }
      lastPage.current = null;
      return;
    }
    if (!initialized) {
      posthog.init(config.token, {
        api_host: config.host,
        defaults: "2026-05-30",
        persistence: "localStorage",
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        save_campaign_params: false,
        save_referrer: false,
        person_profiles: "identified_only",
        before_send: (event) => {
          if (!event || !["$pageview", "$identify", "signup_start"].includes(event.event)) return null;
          event.properties = sanitizePostHogProperties({ ...event.properties, environment: config.environment });
          return event;
        },
      });
      initialized = true;
    }
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.register({ environment: config.environment, ...campaignParameters(window.location.search) });

    const supabase = createSupabaseClient();
    let active = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (active) syncAnalyticsIdentity(posthog, session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && !authChanged) syncAnalyticsIdentity(posthog, session?.user.id ?? null);
    }).catch(() => { /* auth remains independent */ });
    return () => { active = false; subscription.unsubscribe(); };
  }, [choice, ready]);

  useEffect(() => {
    if (!config || !initialized || choice !== "granted") return;
    const url = sanitizeAnalyticsUrl(window.location.href);
    if (!url) { lastPage.current = null; return; }
    posthog.register(campaignParameters(window.location.search));
    if (lastPage.current !== pathname) {
      posthog.capture("$pageview", {
        $current_url: url, $referrer: safeReferrer(document.referrer),
        page_name: marketingPage(pathname) ?? new URL(url).pathname,
      });
      lastPage.current = pathname;
    }
    const click = (event: MouseEvent) => {
      const href = (event.target as Element | null)?.closest?.("a[href]")?.getAttribute("href");
      if (!href) return;
      try {
        const target = new URL(href, window.location.origin);
        if (target.origin === window.location.origin && target.pathname === "/sign-up") {
          posthog.capture("signup_start", { $current_url: url });
        }
      } catch { /* malformed links cannot interrupt navigation */ }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [choice, pathname, ready]);

  function choose(value: AnalyticsChoice) {
    try { window.localStorage.setItem(ANALYTICS_CHOICE_KEY, value); } catch { /* current visit still works */ }
    setChoice(value);
    setEditing(false);
  }

  if (!config || !ready || !supportedPage) return null;
  return !choice || editing ? <aside aria-label={t("title")} className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border bg-background p-4 text-foreground shadow-lg">
    <p className="text-sm">{t("description")}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => choose("denied")}>{t("decline")}</button>
      <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => choose("granted")}>{t("allow")}</button>
      <a href="/legal/cookies" className="text-sm underline">{t("details")}</a>
    </div>
  </aside> : <button type="button" className="fixed bottom-2 left-2 z-40 rounded border bg-background px-2 py-1 text-xs text-foreground" onClick={() => setEditing(true)}>{t("settings")}</button>;
}
