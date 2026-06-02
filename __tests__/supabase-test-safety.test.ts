import { describe, expect, it } from "vitest";
import { assertSafeTestSupabaseUrl } from "../e2e/helpers/supabase-test-safety";

describe("Supabase E2E test safety", () => {
  it("allows loopback Supabase URLs", () => {
    expect(() =>
      assertSafeTestSupabaseUrl("http://127.0.0.1:54321")
    ).not.toThrow();
    expect(() =>
      assertSafeTestSupabaseUrl("http://localhost:54321")
    ).not.toThrow();
  });

  it("blocks remote Supabase projects by default", () => {
    expect(() =>
      assertSafeTestSupabaseUrl("https://abcdefghijklmnopqrst.supabase.co")
    ).toThrow(/Refusing to run destructive E2E\/API tests/);
  });

  it("allows an explicitly allowlisted disposable remote test project", () => {
    expect(() =>
      assertSafeTestSupabaseUrl("https://testprojectref.supabase.co", {
        ALLOW_REMOTE_SUPABASE_TESTS: "true",
        SUPABASE_TEST_PROJECT_REF_ALLOWLIST: "testprojectref",
      })
    ).not.toThrow();
  });

  it("blocks unallowlisted remote hosts", () => {
    expect(() =>
      assertSafeTestSupabaseUrl("https://example.com", {
        ALLOW_REMOTE_SUPABASE_TESTS: "true",
      })
    ).toThrow(/non-local Supabase host/);
  });
});
