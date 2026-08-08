import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("onboarding activation migration safety", () => {
  it("applies 018 atomically and stops psql on errors", () => {
    const migration = readFileSync(
      path.join(root, "database/018_onboarding_activation.sql"),
      "utf8"
    );
    const testSetup = readFileSync(
      path.join(root, ".github/actions/test-setup/action.yml"),
      "utf8"
    );

    expect(migration).toMatch(/^BEGIN;$/m);
    expect(migration).toMatch(/^COMMIT;$/m);
    expect(testSetup).toMatch(
      /psql postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres \\\n+\s+-v ON_ERROR_STOP=1 \\\n+\s+-f database\/018_onboarding_activation\.sql/
    );
  });
});
