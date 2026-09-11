/** Deliberately small public-page vocabulary. Never send user-controlled paths. */
const PUBLIC_PAGES: Record<string, string> = {
  "/": "home", "/sign-up": "sign_up", "/sign-in": "sign_in",
  "/legal/privacy": "privacy", "/legal/cookies": "cookies",
  "/legal/terms": "terms", "/legal/security": "security",
};

export function marketingPage(pathname: string): string | null {
  return PUBLIC_PAGES[pathname] ?? null;
}

// Keep page templates distinct while removing record IDs and invitation codes.
// The route coverage test checks this list against App Router pages.
export const ANALYTICS_ROUTES = [
  "/instructor/assignment/new",
  "/student/profile-setup",
  "/admin/onboarding",
  "/admin/ai-config",
  "/admin/ai-usage",
  "/legal/security",
  "/instructor/new",
  "/legal/cookies",
  "/legal/privacy",
  "/admin/login",
  "/legal/terms",
  "/instructor",
  "/onboarding",
  "/settings",
  "/sign-in",
  "/profile",
  "/sign-up",
  "/student",
  "/admin",
  "/join",
  "/",
  "/instructor/assignment/[id]/edit",
  "/instructor/assignment/[id]",
  "/student/session/[id]/quiz",
  "/assignment/[id]/review",
  "/instructor/[id]/edit",
  "/student/report/[id]",
  "/instructor/[id]",
  "/assignment/[id]",
  "/exam/[id]",
  "/instructor/assignment/[id]/grade/[id]",
  "/instructor/[id]/grade/[id]/re",
  "/instructor/[id]/grade/[id]"
] as const;

export function analyticsPath(pathname: string): string | null {
  const parts = pathname.replace(/\/$/, "").split("/");
  for (const route of ANALYTICS_ROUTES) {
    const template = route.replace(/\/$/, "").split("/");
    if (template.length === parts.length && template.every((part, i) =>
      part === "[id]" ? Boolean(parts[i]) : part === parts[i])) return route;
  }
  return null;
}

export function sanitizeAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const path = analyticsPath(url.pathname);
    return path === null ? null : `${url.origin}${path}`;
  } catch { return null; }
}

export function campaignParameters(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const result: Record<string, string> = {};
  const names = {utm_source:"utm_source",utm_medium:"utm_medium",utm_campaign:"utm_campaign",utm_content:"utm_content",utm_id:"utm_id"};
  for (const [input, output] of Object.entries(names)) {
    const value = query.get(input);
    if (value && /^[a-z0-9_-]{1,80}$/.test(value)) result[output] = value;
  }
  return result;
}

export type AnalyticsChoice = "granted" | "denied";
export const ANALYTICS_CHOICE_KEY = "quest-on.analytics-choice.v3";
export const ANALYTICS_CHOICE_COOKIE = "quest_on_analytics";

export function readAnalyticsChoice(storage: Pick<Storage, "getItem">): AnalyticsChoice | null {
  try {
    const value = storage.getItem(ANALYTICS_CHOICE_KEY);
    if (value === "granted" || value === "denied") return value;
    // Preserve refusals; the earlier disclosure explicitly excluded recordings.
    return storage.getItem("quest-on.analytics-choice.v2") === "denied" ? "denied" : null;
  } catch { return null; }
}

export function safeReferrer(raw: string): string {
  try { return new URL(raw).origin; } catch { return ""; }
}
