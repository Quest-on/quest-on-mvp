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

  it("passes the non-Prisma table SQL as one psql argument", () => {
    const testSetup = readFileSync(
      path.join(root, ".github/actions/test-setup/action.yml"),
      "utf8"
    );
    const action = testSetup.match(
      /    - name: Create non-Prisma tables\n([\s\S]*?)\n    - name: Apply SQL functions/
    )?.[1];

    expect(action).toBeDefined();
    expect(action!.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it("keeps the onboarding event exam foreign key in Prisma", () => {
    const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
    const onboardingEvents = schema.match(/model onboarding_events \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const exams = schema.match(/model exams \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(onboardingEvents).toMatch(
      /exams\s+exams\?\s+@relation\(fields: \[exam_id\], references: \[id\], onDelete: SetNull, onUpdate: NoAction\)/
    );
    expect(exams).toMatch(
      /onboarding_events\s+onboarding_events\[\]/
    );
  });
});
