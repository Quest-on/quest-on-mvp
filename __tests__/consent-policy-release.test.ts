import { execFileSync } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalize, computeContentHash } from "../scripts/consent-policy-release";

const seedPath = "database/020_seed_consent_policy_release.sql";
const temporaryFiles: string[] = [];

afterEach(() => {
  for (const path of temporaryFiles.splice(0)) {
    try {
      unlinkSync(path);
    } catch {
      // The assertion that created the file has already reported the relevant failure.
    }
  }
});

describe("consent policy release canonicalization", () => {
  it("canonicalizes objects regardless of key order", () => {
    expect(canonicalize({ b: "two", a: "one" })).toBe(
      canonicalize({ a: "one", b: "two" }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalize(["first", "second"])).not.toBe(
      canonicalize(["second", "first"]),
    );
  });

  it("changes the hash when a label changes", () => {
    const base = { label: "Required", items: ["age_over_14"] };
    expect(computeContentHash(base)).not.toBe(
      computeContentHash({ ...base, label: "Required!" }),
    );
  });

  it("verifies the seeded hash and rejects a mismatch", () => {
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/consent-policy-release.ts", "--verify", seedPath], {
        stdio: "pipe",
      }),
    ).not.toThrow();

    const badSeedPath = join(tmpdir(), `consent-policy-release-${Date.now()}.sql`);
    temporaryFiles.push(badSeedPath);
    writeFileSync(
      badSeedPath,
      readFileSync(seedPath, "utf8").replace(/[0-9a-f]{64}/, "0".repeat(64)),
    );
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/consent-policy-release.ts", "--verify", badSeedPath], {
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("stores a lowercase 64-character hexadecimal content hash", () => {
    const sql = readFileSync(seedPath, "utf8");
    expect(sql).toMatch(/content_hash[\s\S]*?'([0-9a-f]{64})'/);
  });
});
