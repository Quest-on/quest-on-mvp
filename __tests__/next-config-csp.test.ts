import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

type HeaderGroup = {
  headers: Array<{ key: string; value: string }>;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

async function contentSecurityPolicy(nodeEnv: string): Promise<string> {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const config = nextConfig as {
    headers?: () => Promise<HeaderGroup[]>;
  };
  const groups = await config.headers?.();
  const csp = groups?.flatMap((group) => group.headers).find(
    (header) => header.key === "Content-Security-Policy",
  );
  if (!csp) throw new Error("Content-Security-Policy header is missing");
  return csp.value;
}

describe("Next.js CSP mode contract", () => {
  it("development permits React debugging eval required by next dev", async () => {
    expect(await contentSecurityPolicy("development")).toContain("'unsafe-eval'");
  });

  it("production never permits unsafe-eval", async () => {
    expect(await contentSecurityPolicy("production")).not.toContain("'unsafe-eval'");
  });

  it("frame-src permits *.supabase.co — 자료 내려받기가 숨긴 iframe 으로 Storage 를 연다 (#544, #546 리뷰 B1)", async () => {
    const csp = await contentSecurityPolicy("production");
    const frameSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toBeTruthy();
    expect(frameSrc).toContain("https://*.supabase.co");
    // frame-src 를 전체 허용(frame-src *)으로 넓히지 않는다.
    expect(frameSrc).not.toBe("frame-src *");
  });
});
