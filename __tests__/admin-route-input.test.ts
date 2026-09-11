import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * 관리자 경로의 입력 검증.
 *
 * `AGENTS.md` 와 `app/api/CLAUDE.md` 가 "서버 입력은 Zod 검증" 을 요구하는데
 * 세 곳이 존재 확인만 하고 있었다. 관리자 경로는 역할과 승인을 바꾸므로
 * 형식이 틀린 값이 그대로 DB/RPC 로 가면 안 된다.
 */
describe("관리자 라우트 입력 검증", () => {
  it("교수자 승인이 instructorId 를 UUID 로 검증한다", () => {
    const src = read("app/api/admin/instructors/approve/route.ts");
    // 존재 확인만 하면 UUID 가 아닌 값이 그대로 RPC 로 간다.
    expect(src, "Zod 검증이 없다").toMatch(/safeParse/);
    expect(src, "UUID 형식을 안 본다").toMatch(/z\.string\(\)\.uuid\(\)/);
    expect(src, "검증 없이 본문을 구조분해한다").not.toMatch(
      /const \{ instructorId \} = await request\.json\(\)/
    );
  });

  describe("역할 변경", () => {
    const SRC = read("app/api/admin/users/[userId]/route.ts");

    it("role 을 Zod enum 으로 좁힌다", () => {
      expect(SRC).toMatch(/safeParse/);
      expect(SRC).toMatch(/z\.enum\(\["instructor", "student"\]\)/);
    });

    it("모르는 필드를 거부한다", () => {
      // .strict() 가 없으면 role 외 키가 조용히 통과한다.
      // 주석에도 .strict() 라는 글자가 있어서 파일 전체 매칭은 무력하다.
      // 스키마 선언 안에서만 찾는다.
      const decl = /const RoleSchema = z[\s\S]{0,200}?;/.exec(SRC);
      expect(decl, "RoleSchema 선언을 못 찾았다").toBeTruthy();
      expect(decl![0], "strict 가 없다").toMatch(/\.strict\(\)/);
    });

    it("경로의 userId 도 UUID 로 검증한다", () => {
      expect(SRC, "userId 를 검증하지 않는다").toMatch(/validateUUID\(userId/);
    });
  });

  it("embed 가 본문을 Zod 로 검증하고 한글 오류 문구를 안 쓴다", () => {
    const src = read("app/api/embed/route.ts");
    expect(src).toMatch(/safeParse/);
    // API 오류 문구는 화면에 그대로 뜨지 않는다. 코드로 판정한다.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const ko = code.match(/"[^"]*[가-힣]{2,}[^"]*"/g) ?? [];
    expect(ko, `한글 문자열이 남았다: ${ko.join(", ")}`).toHaveLength(0);
  });
});
