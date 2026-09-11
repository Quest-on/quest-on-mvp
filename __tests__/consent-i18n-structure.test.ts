import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function consentMessages(locale: "ko" | "en") {
  return JSON.parse(readFileSync(`messages/${locale}/onboarding.json`, "utf8")).consent;
}

function leafEntries(value: unknown, path = ""): Array<[string, unknown]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [[path, value]];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, path ? `${path}.${key}` : key),
  );
}

describe("consent onboarding messages", () => {
  it("keeps Korean and English consent key sets identical", () => {
    const koKeys = leafEntries(consentMessages("ko")).map(([path]) => path).sort();
    const enKeys = leafEntries(consentMessages("en")).map(([path]) => path).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it("uses non-empty strings for every consent message", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const [, value] of leafEntries(consentMessages(locale))) {
        expect(typeof value).toBe("string");
        expect((value as string).trim()).not.toBe("");
      }
    }
  });

  it("includes both required labels", () => {
    for (const locale of ["ko", "en"] as const) {
      const consent = consentMessages(locale);
      expect(consent.ageOver14.label).toBeTruthy();
      expect(consent.terms.label).toBeTruthy();
    }
  });
});
