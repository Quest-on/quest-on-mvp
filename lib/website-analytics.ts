/** Deliberately small public-page vocabulary. Never send user-controlled paths. */
const PUBLIC_PAGES: Record<string, string> = {
  "/": "home", "/sign-up": "sign_up", "/sign-in": "sign_in",
  "/legal/privacy": "privacy", "/legal/cookies": "cookies",
  "/legal/terms": "terms", "/legal/security": "security",
};

export function marketingPage(pathname: string): string | null {
  return PUBLIC_PAGES[pathname] ?? null;
}

export function sanitizeAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const path = url.pathname;
    if (marketingPage(path)) return `${url.origin}${path}`;
    // Existing product page metrics remain useful, without record identifiers.
    const root = path.split("/")[1];
    if (!["instructor", "student", "exam", "join", "onboarding"].includes(root)) return null;
    return `${url.origin}/${root}${path.split("/").filter(Boolean).length > 1 ? "/[id]" : ""}`;
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
export const ANALYTICS_CHOICE_KEY = "quest-on.analytics-choice.v2";
export const ANALYTICS_CHOICE_COOKIE = "quest_on_analytics";

export function readAnalyticsChoice(storage: Pick<Storage, "getItem">): AnalyticsChoice | null {
  try {
    const value = storage.getItem(ANALYTICS_CHOICE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch { return null; }
}

export function safeReferrer(raw: string): string {
  try { return new URL(raw).origin; } catch { return ""; }
}
