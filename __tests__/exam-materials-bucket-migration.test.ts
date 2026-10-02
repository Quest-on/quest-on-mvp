/**
 * database/039 — exam-materials 버킷 허용 MIME 에 스프레드시트와 CSV 추가 (#507)
 *
 * 앱 허용 목록(lib/upload-allowlist.ts)에 xlsx, xls, csv 를 넣어도 Storage 버킷의
 * allowed_mime_types 가 그 MIME 을 거부하면 업로드는 풀리지 않는다. 이 SQL 은 버킷 쪽 목록에
 * 네 개를 합집합으로 더한다. 여기서는 SQL 이 (1) 앱 목록과 같은 MIME 을 더하는지, (2) 기존
 * 값을 지우거나 제한 없는 버킷을 제한 버킷으로 바꾸지 않는지를 잠근다. SQL 을 실제로 실행하지는
 * 않는다(AGENTS.md 의 DB 안전 규칙).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UPLOAD_ALLOWED_MIME_TYPES } from "@/lib/upload-allowlist";

const root = path.resolve(__dirname, "..");
const FILE = "039_exam_materials_bucket_mime.sql";

// Windows 체크아웃(core.autocrlf=true)의 CRLF 를 \n 으로 맞춘다.
const sql = readFileSync(path.join(root, "database", FILE), "utf8").replace(/\r\n/g, "\n");
const header = sql.slice(0, sql.indexOf("BEGIN;"));
const executable = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function mimeLiterals(text: string): string[] {
  return [...text.matchAll(/'([a-z]+\/[^']+)'/g)].map((m) => m[1]);
}

describe("039 exam-materials 버킷 MIME 마이그레이션", () => {
  it("039 가 database 디렉터리에서 유일한 순번이다", () => {
    const files = readdirSync(path.join(root, "database"));
    expect(files).toContain(FILE);
    expect(files.filter((f) => f.startsWith("039_"))).toHaveLength(1);
  });

  it("단일 트랜잭션이다", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it("더하는 MIME 은 앱 허용 목록의 스프레드시트와 CSV MIME 과 같다", () => {
    const added = new Set(mimeLiterals(executable));
    const appSpreadsheetMimes = [...UPLOAD_ALLOWED_MIME_TYPES].filter((mime) =>
      /excel|spreadsheetml|csv/.test(mime)
    );

    expect([...added].sort()).toEqual([...appSpreadsheetMimes].sort());
    for (const mime of added) {
      expect(UPLOAD_ALLOWED_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it("exam-materials 한 행만 갱신하고 기존 값 뒤에 붙이기만 한다", () => {
    expect(executable.match(/UPDATE storage\.buckets/g)).toHaveLength(1);
    expect(executable).toMatch(/WHERE id = 'exam-materials'/);
    expect(executable).toMatch(/SET allowed_mime_types = allowed_mime_types \|\| ARRAY\(/);
    expect(executable).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    expect(executable).not.toMatch(/SET\s+(file_size_limit|public)\b/i);
  });

  it("제한 없음(NULL, 빈 배열)인 버킷은 건드리지 않는다", () => {
    expect(executable).toMatch(/AND allowed_mime_types IS NOT NULL/);
    expect(executable).toMatch(/AND cardinality\(allowed_mime_types\) > 0/);
  });

  it("머리말에 선적용 규칙, 확인 쿼리, 롤백 방법을 적었다", () => {
    expect(header).toMatch(/코드보다 먼저 적용/);
    expect(header).toContain(
      "select allowed_mime_types from storage.buckets where id = 'exam-materials'"
    );
    expect(sql).toMatch(/롤백/);
    expect(sql).toMatch(/-- UPDATE storage\.buckets\n-- SET allowed_mime_types = ARRAY\(/);
  });
});
