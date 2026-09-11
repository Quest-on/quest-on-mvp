import { getAppEnv } from "@/lib/app-env";
import { sanitizeAnalyticsUrl, safeReferrer, analyticsPath } from "@/lib/website-analytics";

export function postHogConfig() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const environment = getAppEnv();
  if (process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "true" || !token ||
      !/^phc_[a-zA-Z0-9]+$/.test(token) ||
      !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host ?? "") ||
      !["production", "staging"].includes(environment)) return null;
  return { token, host: host!, environment };
}

const SCALARS = new Set([
  "token", "distinct_id", "$device_id", "$user_id", "$anon_distinct_id", "$session_id",
  "$window_id", "$insert_id", "$lib", "$lib_version", "$browser", "$browser_version",
  "$os", "$os_version", "$device_type", "$screen_height", "$screen_width", "$viewport_height",
  "$viewport_width", "$timezone", "$timezone_offset", "$is_identified", "$process_person_profile",
  "environment", "page_name", "role", "event_source", "$event_type",
]);

export function sanitizePostHogProperties(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$elements_chain" && typeof value === "string") {
      // Native autocapture still includes hrefs/classes with mask_all_* enabled.
      // Keep structural selectors and sanitized internal destinations only.
      output[key] = value.split(";").slice(0,32).map((element) => {
        const tag = element.match(/^(a|button|form|input|select|textarea|label|div|span|svg|path|ul|li|nav|main|section|aside|header|footer|body|html)(?=[.:])/i)?.[1]?.toLowerCase();
        if (!tag) return "";
        const child = element.match(/(?:^|[:\"])nth-child="(\d{1,6})"/)?.[1] ?? "0";
        const type = element.match(/(?:^|[:\"])nth-of-type="(\d{1,6})"/)?.[1] ?? "0";
        let destination = "";
        const href = element.match(/(?:^|[:\"])href="([^"\\]*)"/)?.[1];
        if (href && typeof input.$current_url === "string") {
          try {
            const target = new URL(href, input.$current_url);
            if (target.origin === new URL(input.$current_url).origin) {
              const path = analyticsPath(target.pathname);
              if (path) destination = `href="${path}"`;
            }
          } catch { /* malformed destinations are omitted */ }
        }
        return `${tag}:${destination}nth-child="${child}"nth-of-type="${type}"`;
      }).filter(Boolean).join(";");
    } else if (key === "$prev_pageview_pathname" && typeof value === "string") {
      const path = analyticsPath(value);
      if (path) output[key] = path;
    } else if (["$prev_pageview_duration", "$prev_pageview_max_scroll_percentage", "$prev_pageview_max_content_percentage"].includes(key) &&
               typeof value === "number" && Number.isFinite(value) && value >= 0) {
      output[key] = value;
    } else if (["$set", "$set_once"].includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = sanitizePostHogProperties(value as Record<string, unknown>);
    } else if (["$current_url", "$initial_current_url"].includes(key) && typeof value === "string") {
      const url = sanitizeAnalyticsUrl(value);
      if (url) output[key] = url;
    } else if (["$referrer", "$initial_referrer"].includes(key) && typeof value === "string") {
      output[key] = safeReferrer(value);
    } else if (/^(\$initial_)?utm_(source|medium|campaign|content|id)$/.test(key) &&
               typeof value === "string" && /^[a-z0-9_-]{1,80}$/.test(value)) {
      output[key] = value;
    } else if (SCALARS.has(key) && ["string", "boolean", "number"].includes(typeof value)) {
      output[key] = value;
    }
  }
  // Native Web Analytics groups by these fields. Derive them only after URL
  // cleaning so raw SDK paths cannot reintroduce record IDs or query data.
  if (typeof output.$current_url === "string") {
    const url = new URL(output.$current_url);
    output.$pathname = url.pathname;
    output.$host = url.host;
  }
  if (typeof output.$referrer === "string") {
    output.$referring_domain = output.$referrer && output.$referrer !== "null"
      ? new URL(output.$referrer).hostname : "$direct";
  }
  return output;
}

export function syncAnalyticsIdentity(
  client: { get_property: (key: string) => unknown; identify: (id: string) => void; reset: () => void },
  userId: string | null,
) {
  const previous = client.get_property("$user_id");
  if (previous && previous !== userId) client.reset();
  if (userId && previous !== userId) client.identify(userId);
}
