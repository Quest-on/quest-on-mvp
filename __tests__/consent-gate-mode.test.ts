import { describe, expect, it } from "vitest";
import {
  modeBlocksApis,
  modeBlocksPages,
  modeCollectsConsent,
  modeLogsOnly,
  parseConsentGateMode,
} from "@/lib/consent-gate-mode";

describe("parseConsentGateMode", () => {
  it("accepts every documented value", () => {
    for (const mode of ["off", "shadow", "prompt", "enforce"] as const) {
      expect(parseConsentGateMode(mode, "production")).toBe(mode);
    }
  });
  it("fails closed for missing deployed values and typos", () => {
    expect(() => parseConsentGateMode(undefined, "production")).toThrow();
    expect(() => parseConsentGateMode("enfroce", "staging")).toThrow();
  });
  it("normalizes surrounding whitespace and case, but only development defaults off", () => {
    expect(parseConsentGateMode(" Prompt ", "staging")).toBe("prompt");
    expect(parseConsentGateMode(undefined, "development")).toBe("off");
    expect(() => parseConsentGateMode(undefined, "test")).toThrow();
  });
  it("matches the mode effect table", () => {
    expect(["off", "shadow", "prompt", "enforce"].map((mode) => [mode, modeBlocksPages(mode as never), modeBlocksApis(mode as never), modeCollectsConsent(mode as never), modeLogsOnly(mode as never)])).toEqual([
      ["off", false, false, false, false], ["shadow", false, false, false, true],
      ["prompt", true, false, true, false], ["enforce", true, true, true, false],
    ]);
  });
});
