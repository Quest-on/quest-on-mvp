import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Windows 체크아웃(core.autocrlf=true)에서는 파일이 CRLF 로 내려온다. 아래 단언들은
// 줄바꿈을 \n 으로 고정한 정규식이라, 정규화하지 않으면 CI(리눅스)만 통과하고
// 개발자 로컬에서는 항상 실패한다 — 신호가 아니라 소음이 된다.
const root = path.resolve(__dirname, "..");
const readText = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

describe("onboarding activation migration safety", () => {
  it("applies 018 atomically and stops psql on errors", () => {
    const migration = readText("database/018_onboarding_activation.sql");
    const testSetup = readText(".github/actions/test-setup/action.yml");

    expect(migration).toMatch(/^BEGIN;$/m);
    expect(migration).toMatch(/^COMMIT;$/m);
    expect(testSetup).toMatch(
      /psql postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres \\\n+\s+-v ON_ERROR_STOP=1 \\\n+\s+-f database\/018_onboarding_activation\.sql/
    );
  });

  it("passes the non-Prisma table SQL as one psql argument", () => {
    const testSetup = readText(".github/actions/test-setup/action.yml");
    const action = testSetup.match(
      /    - name: Create non-Prisma tables\n([\s\S]*?)\n    - name: Apply SQL functions/
    )?.[1];

    expect(action).toBeDefined();
    expect(action!.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it("keeps the onboarding event exam foreign key in Prisma", () => {
    const schema = readText("prisma/schema.prisma");
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
