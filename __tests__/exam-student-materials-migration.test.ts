/**
 * database/041 — exams.student_materials, exams.material_names (#544)
 *
 * SQL 을 실제로 실행하지는 않는다(AGENTS.md 의 DB 안전 규칙). CI 의 테스트 DB 셋업
 * (.github/actions/test-setup/action.yml)이 prisma db push 뒤에 이 파일을 두 번 적용해 문법과 멱등성을
 * 확인한다. 여기서는 (1) 추가 전용이고 멱등인지, (2) 배열 CHECK 제약이 이름을 갖고 중복 없이 붙는지,
 * (3) 머리말에 선적용 규칙, 확인 쿼리, 주석 처리된 롤백이 있는지, (4) prisma schema, 스키마 매니페스트,
 * CI 셋업이 같은 컬럼을 알고 있는지를 잠근다.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const FILE = "041_exam_student_materials.sql";
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const sql = read(`database/${FILE}`);
const header = sql.slice(0, sql.indexOf("BEGIN;"));
const executable = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("041 exams.student_materials, exams.material_names 마이그레이션", () => {
  it("041 이 database 디렉터리에서 유일한 순번이다", () => {
    const files = readdirSync(path.join(root, "database"));
    expect(files).toContain(FILE);
    expect(files.filter((f) => f.startsWith("041_"))).toHaveLength(1);
  });

  it("단일 트랜잭션이다", () => {
    expect(executable.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(executable.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("트랜잭션 안에서 잠금 대기를 5초로 제한하고 커밋 뒤 PostgREST 캐시를 갱신한다 (#546 리뷰 5)", () => {
    // ADD COLUMN/CONSTRAINT 는 ACCESS EXCLUSIVE 잠금을 잡는다. 무한 대기하면 학생 입장 조회가 줄을 선다.
    const beginAt = executable.indexOf("BEGIN;");
    const lockAt = executable.indexOf("SET LOCAL lock_timeout = '5s';");
    const commitAt = executable.indexOf("COMMIT;");
    expect(lockAt).toBeGreaterThan(beginAt);
    expect(lockAt).toBeLessThan(commitAt);
    // NOTIFY 로 스키마 캐시가 바로 갱신되게 한다. COMMIT 뒤 트랜잭션 밖에서 실행한다.
    expect(executable.match(/^NOTIFY pgrst, 'reload schema';$/gm)).toHaveLength(1);
    expect(executable.indexOf("NOTIFY")).toBeGreaterThan(commitAt);
  });

  it("jsonb NOT NULL DEFAULT '[]' 컬럼을 IF NOT EXISTS 로 더한다", () => {
    expect(executable).toMatch(
      /ALTER TABLE public\.exams\s+ADD COLUMN IF NOT EXISTS student_materials jsonb NOT NULL DEFAULT '\[\]'::jsonb;/
    );
  });

  it("원래 이름 맵은 jsonb NOT NULL DEFAULT '{}' 컬럼을 IF NOT EXISTS 로 더한다", () => {
    expect(executable).toMatch(
      /ALTER TABLE public\.exams\s+ADD COLUMN IF NOT EXISTS material_names jsonb NOT NULL DEFAULT '\{\}'::jsonb;/
    );
  });

  it.each([
    ["exams_student_materials_is_array", "student_materials", "array"],
    ["exams_material_names_is_object", "material_names", "object"],
  ])("CHECK 제약 %s 는 이름이 있고, 이미 있으면 더하지 않는다", (name, column, type) => {
    expect(executable).toMatch(
      new RegExp(`ADD CONSTRAINT ${name}\\s+CHECK \\(jsonb_typeof\\(${column}\\) = '${type}'\\)`)
    );
    expect(executable).toMatch(
      new RegExp(
        `IF NOT EXISTS \\(\\s*SELECT 1\\s+FROM pg_constraint\\s+WHERE conrelid = 'public\\.exams'::regclass\\s+AND conname = '${name}'\\s*\\)\\s+THEN\\s+ALTER TABLE public\\.exams\\s+ADD CONSTRAINT ${name}\\b`
      )
    );
  });

  it("제약은 정확히 두 개다", () => {
    expect(executable.match(/ADD CONSTRAINT/g)).toHaveLength(2);
  });

  it("추가 전용이다 (지우거나 바꾸는 구문이 없다)", () => {
    expect(executable).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME)\b/i);
    expect(executable).not.toMatch(/ALTER COLUMN/i);
  });

  it("머리말에 선적용 규칙, 확인 쿼리, 롤백이 있다. 롤백은 주석이다", () => {
    expect(header).toMatch(/코드보다 먼저 적용/);
    expect(header).toContain("column_name in ('student_materials', 'material_names')");
    expect(header).toContain("conname in ('exams_student_materials_is_array', 'exams_material_names_is_object')");
    expect(header).toContain("material_names <> '{}'::jsonb");
    expect(sql).toMatch(/롤백/);
    for (const line of [
      "-- ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_material_names_is_object;",
      "-- ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_student_materials_is_array;",
      "-- ALTER TABLE public.exams DROP COLUMN IF EXISTS material_names;",
      "-- ALTER TABLE public.exams DROP COLUMN IF EXISTS student_materials;",
    ]) {
      expect(sql.split("\n")).toContain(line);
    }
  });

  it("prisma schema 의 exams 모델에 같은 컬럼이 있다 (NOT NULL, 기본값 [])", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model exams {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).toMatch(/^\s+student_materials\s+Json\s+@default\("\[\]"\)/m);
    expect(body).toMatch(/^\s+material_names\s+Json\s+@default\("\{\}"\)/m);
  });

  it("스키마 매니페스트가 이 컬럼을 요구한다 (/api/health 가 DDL 누락을 드러낸다)", () => {
    expect(read("lib/schema-manifest.ts")).toMatch(
      /\{ table: "exams", columns: \[[^\]]*"student_materials"[^\]]*\] \}/
    );
    expect(read("lib/schema-manifest.ts")).toMatch(
      /\{ table: "exams", columns: \[[^\]]*"material_names"[^\]]*\] \}/
    );
  });

  it("CI 테스트 DB 셋업이 prisma db push 뒤에 041 을 두 번 적용한다 (문법과 멱등성)", () => {
    const action = read(".github/actions/test-setup/action.yml");
    const pushAt = action.indexOf("npx prisma db push");
    const applyAt = action.indexOf("-f database/041_exam_student_materials.sql");
    expect(pushAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(pushAt);
    expect(action.match(/-f database\/041_exam_student_materials\.sql/g)).toHaveLength(2);
  });
});
