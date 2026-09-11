import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { marketingPage, sanitizeAnalyticsUrl, campaignParameters, readAnalyticsChoice, safeReferrer } from "@/lib/website-analytics";

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
