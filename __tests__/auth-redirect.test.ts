import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthCallbackUrl } from "../lib/auth-redirect";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAuthCallbackUrl", () => {
  it("uses the declared app URL for deployed email links", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://quest-on-staging-two.vercel.app/");
    expect(getAuthCallbackUrl("https://preview.example.com")).toBe(
      "https://quest-on-staging-two.vercel.app/auth/callback",
    );
  });

  it("falls back to the current origin in local development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAuthCallbackUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });

  it("rejects a non-http declared URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "javascript:alert(1)");
    expect(() => getAuthCallbackUrl("https://quest-on.app")).toThrow(
      "NEXT_PUBLIC_APP_URL",
    );
  });
});
