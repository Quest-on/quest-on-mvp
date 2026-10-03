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

describe("로컬 스택의 Storage 출처 (#546 재검토)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  /** NEXT_PUBLIC_SUPABASE_URL 을 바꿔 next.config 를 새로 읽고 지시문별로 나눈다. */
  async function directives(supabaseUrl: string): Promise<Map<string, string>> {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("NODE_ENV", "production");
    const { default: config } = (await import("../next.config")) as {
      default: { headers?: () => Promise<HeaderGroup[]> };
    };
    const groups = await config.headers?.();
    const csp = groups?.flatMap((group) => group.headers).find((h) => h.key === "Content-Security-Policy");
    if (!csp) throw new Error("Content-Security-Policy header is missing");
    const map = new Map<string, string>();
    for (const part of csp.value.split(";").map((d) => d.trim())) {
      map.set(part.split(" ")[0], part);
    }
    return map;
  }

  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "%s 이면 connect-src 처럼 frame-src 에도 그 출처를 붙인다 (웹소켓은 빼고)",
    async (origin) => {
      const csp = await directives(origin);
      const frameSrc = csp.get("frame-src") ?? "";
      expect(frameSrc.split(" ")).toContain(origin);
      expect(frameSrc).not.toMatch(/\bwss?:/);
      expect((csp.get("connect-src") ?? "").split(" ")).toContain(origin);
    },
  );

  it("호스팅 Supabase 면 frame-src 에 로컬 출처가 없다", async () => {
    const csp = await directives("https://abcdefgh.supabase.co");
    const frameSrc = csp.get("frame-src") ?? "";
    expect(frameSrc).toBe(
      "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://*.supabase.co",
    );
  });
});
