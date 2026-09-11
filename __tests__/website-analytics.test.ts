import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ANALYTICS_ROUTES, marketingPage, sanitizeAnalyticsUrl, campaignParameters, readAnalyticsChoice, safeReferrer } from "@/lib/website-analytics";

describe("website analytics coverage and data boundaries", () => {
  it("does not treat a missing, invalid or unreadable preference as consent", () => {
    for (const value of [null, "true", "", "denied"]) {
      expect(readAnalyticsChoice({getItem: () => value})).not.toBe("granted");
    }
    expect(readAnalyticsChoice({getItem: () => { throw new Error("Storage disabled"); }})).toBeNull();
    expect(readAnalyticsChoice({getItem: () => "granted"})).toBe("granted");
  });
  it("does not forward referrer paths or query strings", () => {
    expect(safeReferrer("https://mail.example.com/inbox/private?token=secret")).toBe("https://mail.example.com");
    expect(safeReferrer("")).toBe("");
  });
  it("includes landing and signup without exporting private routes", () => {
    expect(marketingPage("/")).toBe("home");
    expect(marketingPage("/sign-up")).toBe("sign_up");
    for (const path of ["/exam/SECRET", "/student/report/private", "/auth/callback", "/admin"]) {
      expect(marketingPage(path)).toBeNull();
    }
  });
  it("removes query data, hashes, and unknown path identifiers", () => {
    expect(sanitizeAnalyticsUrl("https://quest-on.app/sign-up?email=person@example.com&token=secret#code")).toBe("https://quest-on.app/sign-up");
    expect(sanitizeAnalyticsUrl("https://quest-on.app/exam/SECRET?code=SECRET")).toBe("https://quest-on.app/exam/[id]");
    expect(sanitizeAnalyticsUrl("https://quest-on.app/unknown-person@example.com")).toBeNull();
  });
  it("only accepts campaign convention values, never arbitrary query data", () => {
    expect(campaignParameters("?utm_source=espo&utm_medium=email&utm_campaign=professor_outreach_2026_09&utm_content=batch_005&email=x@y.com")).toEqual({utm_source:"espo",utm_medium:"email",utm_campaign:"professor_outreach_2026_09",utm_content:"batch_005"});
    expect(campaignParameters("?utm_campaign=person%40example.com&token=secret")).toEqual({});
  });
  it("mounts analytics once at the root instead of missing public pages", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("<WebsiteAnalytics");
    for (const path of ["app/(app)/layout.tsx", "app/admin/layout.tsx"]) {
      expect(readFileSync(path, "utf8")).not.toContain("<Analytics");
    }
  });
});


describe("global product page coverage", () => {
  it("keeps every App Router page analyzable as a stable template", () => {
    const routes = readdirSync("app", { recursive: true, encoding: "utf8" })
      .map(path => path.replaceAll("\\", "/"))
      .filter(path => path === "page.tsx" || path.endsWith("/page.tsx"))
      .map(path => "/" + path.split("/").slice(0, -1)
        .filter(part => !part.startsWith("(") && !part.startsWith("[[..."))
        .map(part => part.startsWith("[") ? "[id]" : part).join("/"))
      .filter(path => path !== "/sign-up/sso-callback");
    expect(new Set(ANALYTICS_ROUTES)).toEqual(new Set(routes));
  });
  it("distinguishes feature pages instead of collapsing all instructor paths", () => {
    const expected: Record<string, string> = {
      "/instructor/new": "/instructor/new",
      "/instructor/secret/edit": "/instructor/[id]/edit",
      "/instructor/secret/grade/person/re": "/instructor/[id]/grade/[id]/re",
      "/instructor/assignment/secret/grade/person": "/instructor/assignment/[id]/grade/[id]",
      "/assignment/SECRET/review": "/assignment/[id]/review",
      "/student/session/SECRET/quiz": "/student/session/[id]/quiz",
      "/settings": "/settings", "/profile": "/profile", "/admin/ai-usage": "/admin/ai-usage",
    };
    for (const [path, template] of Object.entries(expected)) {
      expect(sanitizeAnalyticsUrl(`https://quest-on.app${path}?answer=private#token`))
        .toBe(`https://quest-on.app${template}`);
    }
    expect(sanitizeAnalyticsUrl("https://quest-on.app/auth/callback?code=secret")).toBeNull();
    expect(sanitizeAnalyticsUrl("https://quest-on.app/assignment/secret/unknown-private")).toBeNull();
  });
});
