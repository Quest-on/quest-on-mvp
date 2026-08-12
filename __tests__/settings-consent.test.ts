import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "app/(app)/settings/page.tsx"), "utf8");
const ko = JSON.parse(fs.readFileSync(path.join(root, "messages/ko/auth.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en/auth.json"), "utf8"));

describe("settings consent center", () => {
  it("uses the shared query key and authenticated status endpoint", () => {
    expect(page).toContain("qk.consent.status");
    expect(page).toContain('fetch("/api/consents/onboarding")');
  });

  it("links incomplete users back to onboarding without replacing the gate", () => {
    expect(page).toContain('href="/onboarding?redirect=/settings"');
    expect(page).toContain('href="/legal/privacy"');
    expect(page).toContain('href="/legal/terms"');
  });

  it("keeps Korean and English settings messages aligned", () => {
    expect(Object.keys(ko.settings).sort()).toEqual(Object.keys(en.settings).sort());
    for (const key of Object.keys(ko.settings)) {
      expect(ko.settings[key]).toBeTruthy();
      expect(en.settings[key]).toBeTruthy();
    }
  });
});
