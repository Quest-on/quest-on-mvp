import { describe, it, expect } from "vitest";
import {
  buildOrderedManifest,
  isConcurrent,
  parseDirective,
  sha256Hex,
} from "@/lib/staging/sql-manifest";

describe("buildOrderedManifest", () => {
  it("baseline → numbered(오름차순) → legacy → sql/ 순서", () => {
    const files = [
      { path: "sql/008_add_performance_indexes.sql", content: "CREATE INDEX CONCURRENTLY i ON t(x);" },
      { path: "database/014_add_score_weights_to_exams.sql", content: "ALTER TABLE exams ADD COLUMN w int;" },
      { path: "database/000_baseline.sql", content: "CREATE TABLE exams();" },
      { path: "database/002_x.sql", content: "ALTER TABLE x;" },
      { path: "database/create_ai_events_table.sql", content: "CREATE TABLE ai_events();" },
      { path: "database/016_chat_message_idempotency.sql", content: "ALTER TABLE messages;" },
    ];
    const order = buildOrderedManifest(files).map((e) => e.path);
    expect(order).toEqual([
      "database/000_baseline.sql",
      "database/002_x.sql",
      "database/014_add_score_weights_to_exams.sql",
      "database/016_chat_message_idempotency.sql",
      "database/create_ai_events_table.sql",
      "sql/008_add_performance_indexes.sql",
    ]);
  });

  it("숫자 정렬은 사전식이 아니라 수치(2 < 10)", () => {
    const files = [
      { path: "database/010_b.sql", content: "x" },
      { path: "database/2_a.sql", content: "x" },
    ];
    expect(buildOrderedManifest(files).map((e) => e.path)).toEqual([
      "database/2_a.sql",
      "database/010_b.sql",
    ]);
  });

  it("className 과 order 부여", () => {
    const m = buildOrderedManifest([
      { path: "database/000_baseline.sql", content: "x" },
      { path: "sql/fn.sql", content: "x" },
    ]);
    expect(m[0]).toMatchObject({ className: "baseline", order: 0 });
    expect(m[1]).toMatchObject({ className: "function", order: 1 });
  });

  it("concurrent / adoptedOnly 플래그", () => {
    const m = buildOrderedManifest([
      {
        path: "sql/008_idx.sql",
        content: "-- migration: historical-adopted-only\nCREATE INDEX CONCURRENTLY i ON t(x);",
      },
    ]);
    expect(m[0].concurrent).toBe(true);
    expect(m[0].adoptedOnly).toBe(true);
  });

  it("checksum 은 결정적, 내용 다르면 다름", () => {
    const m = buildOrderedManifest([
      { path: "database/001_a.sql", content: "AAA" },
      { path: "database/002_b.sql", content: "BBB" },
    ]);
    expect(m[0].checksum).toBe(sha256Hex("AAA"));
    expect(m[0].checksum).not.toBe(m[1].checksum);
  });
});

describe("helpers", () => {
  it("isConcurrent", () => {
    expect(isConcurrent("create index concurrently foo on t(x)")).toBe(true);
    expect(isConcurrent("CREATE INDEX foo ON t(x)")).toBe(false);
  });
  it("parseDirective", () => {
    expect(parseDirective("-- migration: historical-adopted-only\nSELECT 1;")).toBe(
      "historical-adopted-only"
    );
    expect(parseDirective("-- migration: future-apply")).toBe("future-apply");
    expect(parseDirective("SELECT 1;")).toBeNull();
  });
});
