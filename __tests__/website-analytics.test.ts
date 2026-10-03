import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ANALYTICS_ROUTES, CONSENT_PROMPT_SUPPRESSED_ROUTES, marketingPage, sanitizeAnalyticsUrl, campaignParameters, readAnalyticsChoice, safeReferrer, suppressConsentPromptOn } from "@/lib/website-analytics";

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
    // The recovery link carries a one-time token in the query (#318).
    expect(sanitizeAnalyticsUrl("https://quest-on.app/auth/recovery?token_hash=SECRET&type=recovery")).toBe("https://quest-on.app/auth/recovery");
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

// 이슈 #538 — 응시 중 화면에서는 선택 기록이 없어도 첫 동의 카드를 띄우지 않는다.
// 컴포넌트 동작(카드·캡처)은 website-analytics-consent-prompt.test.ts 가 본다. 여기서는 판정 함수만 본다.
describe("suppressConsentPromptOn (#538)", () => {
  it("학생이 시험·과제를 푸는 중 화면만 억제한다", () => {
    expect([...CONSENT_PROMPT_SUPPRESSED_ROUTES].sort()).toEqual([
      "/assignment/[id]",
      "/exam/[id]",
      "/student/session/[id]/quiz",
    ]);
    for (const path of ["/exam/ABC123", "/assignment/ABC123", "/student/session/s-1/quiz"]) {
      expect(suppressConsentPromptOn(path), path).toBe(true);
    }
  });

  it("억제 목록은 전부 실제 분석 라우트 템플릿이다", () => {
    for (const route of CONSENT_PROMPT_SUPPRESSED_ROUTES) {
      expect(ANALYTICS_ROUTES).toContain(route);
    }
  });

  it("교수·채점·대시보드·가입·법적 고지·제출 뒤 화면은 억제하지 않는다", () => {
    const suppressed = new Set<string>(CONSENT_PROMPT_SUPPRESSED_ROUTES);
    for (const route of ANALYTICS_ROUTES) {
      const sample = route.replaceAll("[id]", "X1");
      expect(suppressConsentPromptOn(sample), sample).toBe(suppressed.has(route));
    }
    for (const path of [
      "/", "/sign-in", "/sign-up", "/legal/privacy", "/legal/cookies", "/join",
      "/student", "/student/profile-setup", "/student/report/s-1",
      "/assignment/ABC123/review",
      "/instructor", "/instructor/x", "/instructor/x/grade/y", "/instructor/assignment/x", "/admin",
    ]) {
      expect(suppressConsentPromptOn(path), path).toBe(false);
    }
  });

  it("끝 슬래시와 코드의 대소문자는 같은 템플릿으로 본다", () => {
    for (const path of ["/exam/ABC123/", "/exam/abc123", "/exam/AbC-123_x", "/assignment/ABC123/", "/student/session/s-1/quiz/"]) {
      expect(suppressConsentPromptOn(path), path).toBe(true);
    }
  });

  it("코드가 없거나 단계가 어긋난 경로는 억제하지 않는다", () => {
    for (const path of [
      "", "/exam", "/exam/", "/exam//", "/exam/a/b", "/exam/ABC123/extra", "/exam/ABC123//",
      "/assignment", "/assignment/", "/assignment/a/b/c",
      "/student/session", "/student/session/s-1", "/student/session//quiz",
      // 라우트 세그먼트는 대소문자를 구분한다. 앱 라우터도 같다.
      "/EXAM/ABC123", "/Exam/ABC123", "/assignment/ABC123/REVIEW",
      "/xexam/ABC123", "exam/ABC123",
    ]) {
      expect(suppressConsentPromptOn(path), JSON.stringify(path)).toBe(false);
    }
  });
});
