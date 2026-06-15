import { afterEach, describe, expect, it } from "vitest";
import { redactForLog } from "@/lib/impact-review/redact";

const ORIG = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG };
});

describe("redactForLog", () => {
  it("masks Authorization Bearer tokens", () => {
    const out = redactForLog("Authorization: Bearer sk-test-abcdef123456");
    expect(out).toContain("Authorization: Bearer [REDACTED]");
    expect(out).not.toContain("abcdef123456");
  });

  it("masks sk- style tokens anywhere", () => {
    const out = redactForLog("error with key sk-proj-ABCDEFGH12345678 in body");
    expect(out).toContain("sk-[REDACTED]");
    expect(out).not.toContain("ABCDEFGH12345678");
  });

  it("masks configured env key substrings", () => {
    process.env.MOONSHOT_API_KEY = "moonshot-super-secret-value";
    const out = redactForLog("upstream said: moonshot-super-secret-value rejected");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("moonshot-super-secret-value");
  });

  it("masks api_key=... assignments", () => {
    const out = redactForLog('{"api_key":"zhipu-1234567890abcdef"}');
    expect(out).not.toContain("zhipu-1234567890abcdef");
  });

  it("preserves useful non-secret metadata", () => {
    const out = redactForLog("HTTP 429 provider=kimi model=kimi-k2.7-code request_id=req_123");
    expect(out).toContain("429");
    expect(out).toContain("provider=kimi");
    expect(out).toContain("kimi-k2.7-code");
  });

  it("stringifies Error objects safely", () => {
    const out = redactForLog(new Error("boom"));
    expect(out).toContain("boom");
  });
});
