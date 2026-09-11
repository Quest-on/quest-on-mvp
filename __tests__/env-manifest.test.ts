import { describe, it, expect } from "vitest";
import {
  ENV_MANIFEST,
  auditEnv,
  isEnvAuditHealthy,
  parseEnvFile,
} from "../lib/env-manifest";

const DEPLOYED_BASE: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: "https://staging.quest-on.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  OPENAI_API_KEY: "sk-x",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "pw",
  ADMIN_SESSION_SECRET: "secret",
  INTERNAL_API_SECRET: "internal",
  CRON_SECRET: "cron",
  CONSENT_SUBJECT_HMAC_KEY_V1: "consent-hmac",
  CONSENT_GATE_MODE: "enforce",
  CONSENT_RETENTION_PURGE_DISABLED: "1",
  CONSENT_RETENTION_PURGE_MODE: "dry-run",
  INCOMPLETE_ACCOUNT_PURGE_DISABLED: "1",
  INCOMPLETE_ACCOUNT_PURGE_MODE: "dry-run",
};

describe("auditEnv", () => {
  it("reports required variables that are missing", () => {
    const audit = auditEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x" }, "production");
    expect(audit.missingRequired).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(audit.missingRequired).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(isEnvAuditHealthy(audit)).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    const audit = auditEnv({ ...DEPLOYED_BASE, CRON_SECRET: "   " }, "production");
    expect(audit.missingRequired).toContain("CRON_SECRET");
  });

  it("requires NEXT_PUBLIC_APP_ENV and ALLOWED_ORIGINS on staging only", () => {
    const staging = auditEnv(DEPLOYED_BASE, "staging");
    expect(staging.missingRequired).toContain("NEXT_PUBLIC_APP_ENV");
    expect(staging.missingRequired).toContain("ALLOWED_ORIGINS");

    const production = auditEnv(DEPLOYED_BASE, "production");
    expect(production.missingRequired).not.toContain("NEXT_PUBLIC_APP_ENV");
    expect(production.missingRequired).not.toContain("ALLOWED_ORIGINS");
  });

  it("flags the auth bypass as forbidden on every deployed environment", () => {
    for (const appEnv of ["production", "staging"] as const) {
      const audit = auditEnv(
        { ...DEPLOYED_BASE, TEST_BYPASS_SECRET: "leaked" },
        appEnv
      );
      expect(audit.forbiddenPresent).toContain("TEST_BYPASS_SECRET");
      expect(isEnvAuditHealthy(audit)).toBe(false);
    }
  });

  it("allows the bypass under the test environment", () => {
    const audit = auditEnv({ TEST_BYPASS_SECRET: "e2e" }, "test");
    expect(audit.forbiddenPresent).toHaveLength(0);
    expect(audit.missingRequired).toHaveLength(0);
  });

  it("separates recommended gaps from required ones", () => {
    const audit = auditEnv(
      { ...DEPLOYED_BASE, NEXT_PUBLIC_APP_ENV: "staging", ALLOWED_ORIGINS: "https://staging.quest-on.app" },
      "staging"
    );
    expect(audit.missingRequired).toHaveLength(0);
    expect(audit.missingRecommended).toContain("QSTASH_TOKEN");
    // recommended 누락만으로 배포를 막지는 않는다
    expect(isEnvAuditHealthy(audit)).toBe(true);
  });

  it("never leaks values — the audit only carries variable names", () => {
    const audit = auditEnv({ ...DEPLOYED_BASE, TEST_BYPASS_SECRET: "s3cr3t" }, "production");
    expect(JSON.stringify(audit)).not.toContain("s3cr3t");
  });
});

describe("committed env templates", () => {
  it("keeps .env.staging.example free of bypass keys", async () => {
    const { readFileSync } = await import("fs");
    const template = readFileSync(".env.staging.example", "utf8");
    const parsed = parseEnvFile(template);
    expect(parsed.TEST_BYPASS_SECRET).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_TEST_BYPASS_ENABLED).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_APP_ENV).toBe("staging");
  });

  it("lists every manifest variable in .env.example", async () => {
    const { readFileSync } = await import("fs");
    const template = readFileSync(".env.example", "utf8");
    const missing = ENV_MANIFEST.filter(
      (spec) => !template.includes(spec.name)
    ).map((spec) => spec.name);
    expect(missing).toEqual([]);
  });
});

describe("AI reasoning effort env keys (issue #118)", () => {
  it("registers every task key the resolver will actually read", async () => {
    const { AI_TASKS, GLOBAL_EFFORT_ENV_KEY, taskEffortEnvKey } = await import(
      "../lib/ai-task-profile"
    );
    const registered = new Set(ENV_MANIFEST.map((spec) => spec.name));

    // 해석기가 읽는 이름과 매니페스트에 적힌 이름이 어긋나면 오버라이드가 조용히 무시된다.
    expect(registered.has(GLOBAL_EFFORT_ENV_KEY)).toBe(true);
    for (const task of AI_TASKS) {
      expect(registered.has(taskEffortEnvKey(task))).toBe(true);
    }
  });

  it("keeps every effort override optional in all environments", () => {
    const effortSpecs = ENV_MANIFEST.filter((spec) =>
      spec.name.startsWith("AI_REASONING_EFFORT")
    );
    expect(effortSpecs.length).toBe(8);
    for (const spec of effortSpecs) {
      // 미설정이 정상이다 — 배포 환경에서 required 로 올리면 기존 배포가 깨진다.
      expect(Object.values(spec.levels)).toEqual([]);
    }
  });

  it("rejects an invalid effort value instead of silently ignoring it", async () => {
    const { resolveAiTaskProfile } = await import("../lib/ai-task-profile");
    expect(() =>
      resolveAiTaskProfile({
        task: "auto_grading_summary",
        env: { AI_REASONING_EFFORT: "very-high" },
      })
    ).toThrow(/AI_REASONING_EFFORT/);
  });
});

describe("parseEnvFile", () => {
  it("ignores comments and blank lines, and strips quotes", () => {
    const parsed = parseEnvFile(
      ['# comment', '', 'A=1', 'B="two"', "C='three'", "D=has=equals"].join("\n")
    );
    expect(parsed).toEqual({ A: "1", B: "two", C: "three", D: "has=equals" });
  });
});
