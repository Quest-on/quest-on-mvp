import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync("app/(app)/onboarding/page.tsx", "utf8");
const sourceWithoutComments = onboardingSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("consent onboarding UI structure", () => {
  it("renders exactly two required consent checkboxes without preselection", () => {
    expect((onboardingSource.match(/<Checkbox\b/g) ?? []).length).toBe(2);
    expect(onboardingSource).not.toContain("defaultChecked");
    expect(onboardingSource).toContain("useState(false)");
  });

  it("does not include an all-consent button", () => {
    expect(sourceWithoutComments).not.toMatch(/전체\s*동의|all\s*consent/i);
  });

  it("posts only the required consent decisions", () => {
    const consentRequest = onboardingSource.match(
      /fetch\("\/api\/consents\/onboarding"[\s\S]*?\}\),/,
    )?.[0] ?? "";
    expect(consentRequest).toContain("JSON.stringify({ ageOver14: true, terms: true })");
    expect(consentRequest).not.toMatch(/user_id|controller_type|policy_version/);
  });

  it("has no user-visible hardcoded Korean text", () => {
    expect(sourceWithoutComments).not.toMatch(/[\uac00-\ud7a3]/);
  });

  it("keeps consent UI out of sign-up and the preflight disclosure visible", () => {
    expect(readFileSync("components/auth/CustomSignUp.tsx", "utf8")).not.toMatch(/consent|동의/i);
    expect(readFileSync("components/exam/PreflightModal.tsx", "utf8")).toContain(
      't("preflight.aiDisclosureVisible")',
    );
  });
});
