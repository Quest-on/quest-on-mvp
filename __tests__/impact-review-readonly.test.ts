import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * impact-review 러너/리뷰어 read-only 자기보존 가드 (무오탐 구조 검사).
 *
 * 리뷰 러너 자체가 운영 DB/Supabase/.env에 닿으면 안 된다(6/03 DB 성역 + CI에서 PII 위험).
 * 이건 의미가 아니라 *순수 구문* 불변식이라 결정적 테스트로 박기에 적합(오탐 없음).
 */
const ROOT = path.resolve(__dirname, "..");
const ENGINE_DIR = path.join(ROOT, "lib/impact-review");
const CLI = path.join(ROOT, "scripts/impact-review.ts");

const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  { re: /from\s+["']@\/lib\/supabase/, why: "Supabase 클라이언트 import" },
  { re: /from\s+["']@supabase\//, why: "@supabase 패키지 import" },
  { re: /\bgetSupabaseServer\b/, why: "Supabase 서버 클라이언트" },
  { re: /\bcreateClient\s*\(/, why: "supabase createClient 호출" },
  { re: /\bSUPABASE_SERVICE_ROLE_KEY\b/, why: "Supabase service-role 키" },
  { re: /from\s+["']@prisma\//, why: "Prisma client import" },
  { re: /\.env\.local\b/, why: ".env.local 접근" },
];

function engineFiles(): string[] {
  return readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(ENGINE_DIR, f))
    .concat([CLI]);
}

describe("impact-review reviewer stays read-only (no DB/Supabase/.env)", () => {
  for (const file of engineFiles()) {
    const rel = path.relative(ROOT, file);
    it(`${rel} has no DB/Supabase/.env access`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const hits = FORBIDDEN.filter((f) => f.re.test(src)).map((f) => f.why);
      expect(hits, `금지된 접근 발견: ${hits.join(", ")}`).toEqual([]);
    });
  }
});

/** 주석/문서 텍스트의 단순 언급은 검사에서 제외(코드만 검사). */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => !/^\s*\*/.test(line))
    .join("\n");
}
