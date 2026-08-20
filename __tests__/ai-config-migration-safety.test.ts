import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 마이그레이션 안전성 — 정적 증명 (이슈 #118)
 *
 * 한계를 먼저 적는다: 이 테스트는 **문장이 존재하고 순서가 맞는지**만 증명한다.
 * "Postgres 가 실제로 anon 을 42501 로 거부하는가", "짝 CHECK 가 반쪽 핀을 진짜
 * 막는가" 같은 의미론은 살아 있는 서버에서만 확인된다. 그건 별도 DB 검증 항목이다.
 *
 * 그래도 정적으로 잡히는 사고가 많다: 가드 없는 DDL 한 줄이면 재적용이 깨지고,
 * REVOKE 를 빠뜨리면 PostgREST 를 통해 anon 이 SECURITY DEFINER 함수를 부를 수 있다.
 */

const DB = (name: string) =>
  readFileSync(path.join(process.cwd(), "database", name), "utf8");

const M028 = DB("028_create_ai_config.sql");
const M029 = DB("029_pin_ai_config_to_grading_runs.sql");
const M030 = DB("030_stamp_ai_config_version.sql");
const CI = readFileSync(
  path.join(process.cwd(), ".github", "actions", "test-setup", "action.yml"),
  "utf8"
);

/** SQL 주석을 지운다 — 설명문이 가드처럼 보이면 안 된다. */
function sql(source: string): string {
  return source.replace(/--.*$/gm, "");
}

const ALL = [
  ["028", M028],
  ["029", M029],
  ["030", M030],
] as const;

describe("re-applying a migration must be a no-op", () => {
  it.each(ALL)("%s guards every CREATE TABLE and CREATE INDEX", (_name, source) => {
    const code = sql(source);
    for (const stmt of code.match(/CREATE TABLE[^(]*/gi) ?? []) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
    for (const stmt of code.match(/CREATE INDEX[^(]*/gi) ?? []) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  it.each(ALL)("%s guards every ADD COLUMN", (_name, source) => {
    for (const stmt of sql(source).match(/ADD COLUMN[^;]*/gi) ?? []) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  it.each(ALL)("%s only adds constraints behind a pg_constraint existence check", (_name, source) => {
    const code = sql(source);
    const addConstraints = code.match(/ADD CONSTRAINT/gi) ?? [];
    if (addConstraints.length === 0) return;
    // 제약은 IF NOT EXISTS 를 못 쓰므로 DO 블록에서 카탈로그를 확인해야 한다.
    const guards = code.match(/SELECT 1 FROM pg_constraint/gi) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(addConstraints.length);
  });

  it("028 bootstraps the production label only when it is absent", () => {
    // 가드가 없으면 재적용할 때마다 버전이 하나씩 늘고 라벨이 흔들린다.
    expect(sql(M028)).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM public\.ai_config_labels WHERE label = 'production'\s*\)/i
    );
  });

  it("uses CREATE OR REPLACE for the publish function", () => {
    expect(sql(M028)).toMatch(/CREATE OR REPLACE FUNCTION public\.publish_ai_config_version/i);
  });
});

describe("028 closes the SECURITY DEFINER escalation path", () => {
  const code = sql(M028);

  it("pins an empty search_path on the definer function", () => {
    // search_path 를 비우지 않으면 호출자가 스키마를 바꿔치기해 함수 본문을 납치할 수 있다.
    expect(code).toMatch(/SECURITY DEFINER/i);
    expect(code).toMatch(/SET search_path = ''/i);
  });

  it("schema-qualifies the objects the function touches", () => {
    // search_path 가 비었으므로 한정하지 않은 참조는 런타임에 터진다.
    expect(code).toMatch(/INSERT INTO public\.ai_config_versions/i);
    expect(code).toMatch(/INSERT INTO public\.ai_config_labels/i);
    expect(code).toMatch(/INSERT INTO public\.ai_config_audit/i);
    expect(code).toMatch(/FROM public\.ai_config_labels/i);
  });

  it("revokes the default PUBLIC EXECUTE grant on the function", () => {
    // PostgreSQL 은 함수 EXECUTE 를 기본으로 PUBLIC 에 준다. 이걸 안 지우면
    // PostgREST 를 통해 anon 이 감사 없이 설정을 발행할 수 있다.
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.publish_ai_config_version\(jsonb, text, text\) FROM PUBLIC/i
    );
  });

  it("revokes function EXECUTE from anon and authenticated, then grants only service_role", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.publish_ai_config_version[\s\S]*FROM %I/i);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.publish_ai_config_version[\s\S]*service_role/i);
  });

  it("revokes all table privileges from PUBLIC and gives service_role read-only", () => {
    for (const table of ["ai_config_versions", "ai_config_labels", "ai_config_audit"]) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM PUBLIC`, "i"));
    }
    // 앱이 테이블을 직접 쓰면 감사 없는 변경 경로가 생긴다 — RPC 만이 쓰기 경로다.
    expect(code).toMatch(/REVOKE ALL ON %s FROM service_role/i);
    expect(code).toMatch(/GRANT SELECT ON %s TO service_role/i);
    expect(code).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.ai_config/i);
  });

  it("enables RLS on all three tables", () => {
    for (const table of ["ai_config_versions", "ai_config_labels", "ai_config_audit"]) {
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`, "i"));
    }
  });
});

describe("029 makes a half-written pin unrepresentable", () => {
  const code = sql(M029);

  it("declares the pair CHECK", () => {
    // 버전만 있고 스냅샷이 없으면 워커가 "핀이 있다" 고 믿고 잘못된 프로필로 채점한다.
    expect(code).toMatch(
      /CHECK \(\(ai_config_version_id IS NULL\) = \(ai_profile_snapshot IS NULL\)\)/i
    );
  });

  it("keeps both columns nullable and additive so it can ship before the app", () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_config_version_id uuid;/i);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_profile_snapshot jsonb;/i);
    expect(code).not.toMatch(/NOT NULL/i);
    expect(code).not.toMatch(/DROP COLUMN|DROP TABLE/i);
  });

  it("protects the referenced config version from deletion", () => {
    expect(code).toMatch(/REFERENCES public\.ai_config_versions\(id\)\s*\n?\s*ON DELETE RESTRICT/i);
  });

  it("requires the snapshot to be a JSON object", () => {
    expect(code).toMatch(/jsonb_typeof\(ai_profile_snapshot\) = 'object'/i);
  });
});

describe("030 stamps the config version without breaking existing rows", () => {
  const code = sql(M030);

  it("adds a nullable column so pre-migration events stay valid", () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS config_version uuid;/i);
    expect(code).not.toMatch(/NOT NULL/i);
  });

  it("references the version table with RESTRICT", () => {
    expect(code).toMatch(/REFERENCES public\.ai_config_versions\(id\)\s*\n?\s*ON DELETE RESTRICT/i);
  });
});

describe("no migration is destructive", () => {
  it.each(ALL)("%s never drops or truncates", (_name, source) => {
    const code = sql(source);
    expect(code).not.toMatch(/\bDROP TABLE\b/i);
    expect(code).not.toMatch(/\bDROP COLUMN\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDELETE FROM\b/i);
  });

  it.each(ALL)("%s runs in a transaction", (_name, source) => {
    const code = sql(source);
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code).toMatch(/^\s*COMMIT;/m);
  });
});

describe("CI applies the migrations and restores ACLs after the blanket GRANT", () => {
  it("applies all three in dependency order", () => {
    const i028 = CI.indexOf("database/028_create_ai_config.sql");
    const i029 = CI.indexOf("database/029_pin_ai_config_to_grading_runs.sql");
    const i030 = CI.indexOf("database/030_stamp_ai_config_version.sql");
    expect(i028).toBeGreaterThan(-1);
    // 029/030 은 ai_config_versions 를 FK 로 참조하므로 028 뒤여야 한다.
    expect(i029).toBeGreaterThan(i028);
    expect(i030).toBeGreaterThan(i028);
  });

  it("re-applies 028 after the blanket GRANT so the revokes are restored", () => {
    // blanket GRANT 가 anon/authenticated 에게 쓰기와 EXECUTE 를 다시 열어 준다.
    // 회수하지 않으면 CI 에서만 보안 경계가 없는 상태로 검증이 무의미해진다.
    const grantIdx = CI.indexOf("GRANT ALL ON ALL ROUTINES IN SCHEMA public");
    const lastApply = CI.lastIndexOf("database/028_create_ai_config.sql");
    expect(grantIdx).toBeGreaterThan(-1);
    expect(lastApply).toBeGreaterThan(grantIdx);
  });
});
