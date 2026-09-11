"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { ChartNoAxesColumn, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase-client";
import { postHogConfig, sanitizePostHogProperties, syncAnalyticsIdentity } from "@/lib/posthog-config";
import {
  ANALYTICS_CHOICE_KEY, ANALYTICS_CHOICE_COOKIE, type AnalyticsChoice, campaignParameters,
  marketingPage, readAnalyticsChoice, safeReferrer, sanitizeAnalyticsUrl,
} from "@/lib/website-analytics";

import { sessionReplayConfig, replayProperties } from "@/lib/posthog-replay";

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
      if (initialized) { posthog.opt_out_capturing(); posthog.stopSessionRecording(); posthog.reset(); posthog.opt_out_capturing(); }
      lastPage.current = null;
      return;
    }
    if (!initialized) {
      posthog.init(config.token, {
        api_host: config.host,
        defaults: "2026-05-30",
        persistence: "localStorage",
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: { dom_event_allowlist: ["click", "submit"], capture_copied_text: false },
        mask_all_text: true,
        mask_all_element_attributes: true,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        rageclick: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: false,
        session_recording: sessionReplayConfig,
        enable_recording_console_log: false,
        disable_surveys: true,
        disable_external_dependency_loading: false,
        advanced_disable_feature_flags: true,
        disable_product_tours: true,
        disable_conversations: true,
        save_campaign_params: false,
        save_referrer: false,
        person_profiles: "identified_only",
        before_send: (event) => {
          if (event?.event === "$snapshot") {
            event.properties = replayProperties(event.properties, config.environment);
            return event;
          }
          if (!event || !["$pageview", "$pageleave", "$autocapture", "$identify", "signup_start"].includes(event.event)) return null;
          event.properties = sanitizePostHogProperties({ ...event.properties, environment: config.environment });
          return event;
        },
      });
      initialized = true;
    }
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.set_config({ disable_session_recording: false });
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
  return !choice || editing ? (
    <aside
      aria-label={t("title")}
      aria-describedby="analytics-consent-description"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-border/60 bg-background p-5 text-foreground shadow-xl shadow-foreground/10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300 sm:right-6 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
          <ChartNoAxesColumn className="size-5" strokeWidth={1.8} />
        </span>
        <h2 className="text-base leading-snug font-semibold tracking-tight [text-wrap:balance]">{t("heading")}</h2>
      </div>
      <div id="analytics-consent-description" className="space-y-2">
        <p className="text-sm leading-relaxed text-muted-foreground [word-break:keep-all]">{t("description")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground [word-break:keep-all]">{t("optional")}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="h-11 rounded-xl px-3 shadow-none motion-reduce:transition-none" onClick={() => choose("denied")}>
          {t("decline")}
        </Button>
        <Button type="button" className="h-11 rounded-xl px-3 shadow-none motion-reduce:transition-none" onClick={() => choose("granted")}>
          {t("allow")}
        </Button>
      </div>
      <a href="/legal/cookies" className="mx-auto mt-2 flex min-h-9 w-fit items-center gap-0.5 rounded-lg px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {t("details")}<ChevronRight className="size-3.5" aria-hidden="true" />
      </a>
    </aside>
  ) : (
    <Button type="button" variant="outline" className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-10 gap-2 rounded-full border-border/60 px-3 text-xs text-muted-foreground shadow-sm motion-reduce:transition-none sm:right-6 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={() => setEditing(true)}>
      <SlidersHorizontal className="size-3.5" aria-hidden="true" />{t("settings")}
    </Button>
  );
}
