import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

/**
 * DB 안전 멈춤 규칙(AGENTS.md) 의 회귀 테스트.
 *
 * 이 저장소의 E2E/API 테스트는 실제 Postgres 에 DDL 을 적용하고 seed·cleanup 을 돌린다.
 * 대상이 실서비스 DB 로 잡히면 복구가 불가능하다. 그래서 "실수로 안전장치를 빼면
 * 테스트가 깨지는" 구조로 고정한다.
 */

const REPO_ROOT = path.resolve(__dirname, "..");

describe("assertLocalTestEnv — fail-closed 동작", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  /** .env.test 존재 여부를 가짜로 만든다. 실제 파일 시스템을 건드리지 않는다. */
  function stubEnvTestExists(exists: boolean) {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (String(p).endsWith(".env.test")) return exists;
      return true;
    });
  }

  async function loadHelper() {
    return await import("../e2e/helpers/assert-local-test-env");
  }

  it(".env.test 가 없으면 throw 한다", async () => {
    stubEnvTestExists(false);
    process.env.DISPOSABLE_LOCAL_DB_CONFIRMED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    const { assertLocalTestEnv } = await loadHelper();
    expect(() => assertLocalTestEnv()).toThrow(/\.env\.test/);
  });

  it("DISPOSABLE_LOCAL_DB_CONFIRMED 가 1 이 아니면 throw 한다", async () => {
    stubEnvTestExists(true);
    delete process.env.DISPOSABLE_LOCAL_DB_CONFIRMED;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    const { assertLocalTestEnv } = await loadHelper();
    expect(() => assertLocalTestEnv()).toThrow(/DISPOSABLE_LOCAL_DB_CONFIRMED/);
  });

  it("원격 Supabase URL 이면 throw 한다", async () => {
    stubEnvTestExists(true);
    process.env.DISPOSABLE_LOCAL_DB_CONFIRMED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    const { assertLocalTestEnv } = await loadHelper();
    expect(() => assertLocalTestEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("원격 DATABASE_URL 이면 throw 한다", async () => {
    stubEnvTestExists(true);
    process.env.DISPOSABLE_LOCAL_DB_CONFIRMED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.DATABASE_URL =
      "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres";

    const { assertLocalTestEnv } = await loadHelper();
    expect(() => assertLocalTestEnv()).toThrow(/DATABASE_URL/);
  });

  it("에러 메시지에 자격증명 전체를 노출하지 않는다", async () => {
    stubEnvTestExists(true);
    process.env.DISPOSABLE_LOCAL_DB_CONFIRMED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.DATABASE_URL =
      "postgresql://postgres:SUPER_SECRET_PW@db.example.com:5432/postgres";

    const { assertLocalTestEnv } = await loadHelper();
    try {
      assertLocalTestEnv();
      throw new Error("throw 했어야 한다");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("db.example.com");
      expect(message).not.toContain("SUPER_SECRET_PW");
    }
  });

  it("세 조건을 모두 만족하면 통과한다", async () => {
    stubEnvTestExists(true);
    process.env.DISPOSABLE_LOCAL_DB_CONFIRMED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    const { assertLocalTestEnv, isLocalTestEnvSatisfied } = await loadHelper();
    expect(() => assertLocalTestEnv()).not.toThrow();
    expect(isLocalTestEnvSatisfied()).toBe(true);
  });
});

describe("e2e 부트스트랩 배선", () => {
  it("global-setup 이 DB 작업 전에 preflight 를 호출한다", () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, "e2e", "global-setup.ts"),
      "utf-8",
    );

    expect(source).toContain("assertLocalTestEnv");

    // preflight 가 마이그레이션 실행보다 앞서야 한다. 순서가 뒤집히면
    // 원격 DB 에 붙은 뒤에야 막히므로 안전장치가 무의미해진다.
    const preflightAt = source.indexOf("assertLocalTestEnv()");
    const migrateAt = source.indexOf("async function applyMigrations");
    expect(preflightAt).toBeGreaterThan(-1);
    expect(preflightAt).toBeLessThan(migrateAt);
  });

  it("e2e 부트스트랩이 .env.local 을 실제로 로드하지 않는다", () => {
    for (const file of ["global-setup.ts", "playwright.config.ts"]) {
      const source = fs.readFileSync(path.join(REPO_ROOT, "e2e", file), "utf-8");

      // 주석에 파일명이 언급되는 것은 무방하다. 실제 로드 경로만 막는다.
      const code = source
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("//") && !trimmed.startsWith("*");
        })
        .join("\n");

      expect(code, `${file} 이 .env.local 을 읽는다`).not.toContain(".env.local");
    }
  });
});
