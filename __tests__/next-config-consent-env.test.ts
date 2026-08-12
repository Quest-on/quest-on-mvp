import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadNextConfig({
  vercel,
  mode,
}: {
  vercel: boolean;
  mode: string;
}) {
  vi.stubEnv("VERCEL", vercel ? "1" : "");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
  vi.stubEnv("CONSENT_GATE_MODE", mode);
  return import("../next.config");
}

describe("Vercel consent gate build preflight", () => {
  it("rejects a Vercel build when CONSENT_GATE_MODE is missing", async () => {
    await expect(loadNextConfig({ vercel: true, mode: "" })).rejects.toThrow(
      "CONSENT_GATE_MODE must be set outside development",
    );
  });

  it("rejects an invalid Vercel consent mode", async () => {
    await expect(loadNextConfig({ vercel: true, mode: "enabled" })).rejects.toThrow(
      "CONSENT_GATE_MODE must be one of",
    );
  });

  it("accepts an explicit safe rollout mode", async () => {
    await expect(loadNextConfig({ vercel: true, mode: "off" })).resolves.toBeDefined();
  });

  it("does not require deployment env during local config evaluation", async () => {
    await expect(loadNextConfig({ vercel: false, mode: "" })).resolves.toBeDefined();
  });
});
