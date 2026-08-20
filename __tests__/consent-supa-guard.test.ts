import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/supa/route.ts", "utf8");

describe("/api/supa consent guard integration", () => {
  it("authenticates once, then invokes the guard before rate limiting", () => {
    expect(route.match(/currentUser\(\)/g) ?? []).toHaveLength(1);
    const auth = route.indexOf("authedUser = await currentUser()");
    const guard = route.indexOf("await assertConsentOrRespond(");
    const rateLimit = route.indexOf("// Rate limit sensitive actions");
    expect(auth).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(auth);
    expect(guard).toBeLessThan(rateLimit);
  });
  it("exempts only get_exam and returns the enforce contract from the reusable guard", () => {
    expect(route).toContain('const publicActions = new Set<string>(["get_exam"])');
    const policy = readFileSync("lib/consent-route-policy.ts", "utf8");
    expect(policy).toContain('error: "CONSENT_REQUIRED", redirect: "/onboarding"');
    expect(policy).toContain("status: 428");
    expect(policy).toContain("modeBlocksApis(mode)");
    expect(policy).toContain("modeLogsOnly(mode)");
  });
  it("allows a completed gate in every mode by never blocking a complete result", () => {
    const policy = readFileSync("lib/consent-route-policy.ts", "utf8");
    expect(policy).toContain('let decision = "allow"');
    expect(policy).toContain("if (!gate.complete && routeClass === \"exam_continuity\")");
  });
});
