import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveAppEnv,
  invalidAppEnvDeclaration,
  getAppEnv,
  isProductionApp,
  isStagingApp,
  isAuthBypassAllowedEnv,
} from "../lib/app-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAppEnv", () => {
  it("uses the explicit declaration over every other signal", () => {
    // 별도 Vercel 프로젝트로 띄운 스테이징은 VERCEL_ENV=production 이다.
    // 이 케이스를 못 잡으면 스테이징이 자기를 프로덕션이라고 믿는다.
    expect(
      resolveAppEnv({
        NEXT_PUBLIC_APP_ENV: "staging",
        VERCEL_ENV: "production",
        NODE_ENV: "production",
      })
    ).toBe("staging");
  });

  it("normalizes case and surrounding whitespace in the declaration", () => {
    expect(resolveAppEnv({ NEXT_PUBLIC_APP_ENV: "  Staging " })).toBe("staging");
  });

  it("ignores an unknown declaration and falls back to VERCEL_ENV", () => {
    expect(
      resolveAppEnv({ NEXT_PUBLIC_APP_ENV: "stg", VERCEL_ENV: "production" })
    ).toBe("production");
  });

  it("maps Vercel preview deployments to staging", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(
      "staging"
    );
  });

  it("maps Vercel production deployments to production", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(
      "production"
    );
  });

  it("maps Vercel development to development even when NODE_ENV says production", () => {
    expect(
      resolveAppEnv({ VERCEL_ENV: "development", NODE_ENV: "production" })
    ).toBe("development");
  });

  it("falls back to NODE_ENV outside Vercel", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("production");
    expect(resolveAppEnv({ NODE_ENV: "test" })).toBe("test");
    expect(resolveAppEnv({ NODE_ENV: "development" })).toBe("development");
  });

  it("defaults to development when nothing is set", () => {
    expect(resolveAppEnv({})).toBe("development");
  });
});

describe("invalidAppEnvDeclaration", () => {
  it("returns null for unset or valid values", () => {
    expect(invalidAppEnvDeclaration(undefined)).toBeNull();
    expect(invalidAppEnvDeclaration("")).toBeNull();
    expect(invalidAppEnvDeclaration("   ")).toBeNull();
    expect(invalidAppEnvDeclaration("staging")).toBeNull();
  });

  it("returns a message naming the offending value for a typo", () => {
    const message = invalidAppEnvDeclaration("stagng");
    expect(message).toContain("stagng");
    expect(message).toContain("staging");
  });
});

describe("environment predicates", () => {
  it("reads process.env at call time", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    expect(getAppEnv()).toBe("staging");
    expect(isStagingApp()).toBe(true);
    expect(isProductionApp()).toBe(false);
  });

  it("treats a Vercel production deployment as production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionApp()).toBe(true);
  });
});

describe("isAuthBypassAllowedEnv", () => {
  it("allows the bypass only in local development and CI test runs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    expect(isAuthBypassAllowedEnv()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    expect(isAuthBypassAllowedEnv()).toBe(true);
  });

  it("blocks the bypass on staging — external QA users sign in for real there", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });

  it("blocks the bypass in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });
});
