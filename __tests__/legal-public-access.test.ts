import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  status: "active",
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
    from: () => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { role: auth.role, status: auth.status } }),
    }) }) }),
  }),
}));

beforeEach(() => {
  vi.stubEnv("TEST_BYPASS_SECRET", "");
  vi.stubEnv("CONSENT_GATE_MODE", "off");
  auth.user = null;
  auth.role = null;
  auth.status = "active";
});
afterEach(() => vi.unstubAllEnvs());

describe("public policy access through the actual request proxy", () => {
  for (const audience of ["visitor", "student", "instructor", "pending", "unassigned"]) {
    it.each(["/legal/cookies", "/legal/privacy", "/legal/terms", "/legal/security"])(
      `lets ${audience} read %s without an auth redirect`, async (pathname) => {
        if (audience !== "visitor") {
          auth.user = { id: "test-user" };
          auth.role = audience === "unassigned" ? null : audience === "pending" ? "instructor" : audience;
          auth.status = audience === "pending" ? "pending" : "active";
        }
        const response = await proxy(new NextRequest(`https://quest-on.app${pathname}`));
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
      },
    );
  }

  it.each(["/instructor", "/student", "/legal-private"])("still protects %s from anonymous access", async (pathname) => {
    const response = await proxy(new NextRequest(`https://quest-on.app${pathname}`));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://quest-on.app/sign-in");
    expect(location.searchParams.get("redirect")).toBe(pathname);
  });
});
