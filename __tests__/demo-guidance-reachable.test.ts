import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const HOME = read("components/instructor/InstructorHomeClient.tsx");
const STATUS = read("app/api/onboarding/demo/status/route.ts");
const DRIVE = read("app/api/supa/handlers/drive-handlers.ts");

/**
 * 대시보드의 "다음 걸음" 안내가 실제로 뜰 수 있어야 한다.
 *
 * `#270` 이 안내를 붙였지만 데모를 `examNodes`(드라이브 목록)에서 찾았다.
 * 드라이브 조회는 AC-17 때문에 데모를 걸러낸다. 그래서 그 안내는 한 번도
 * 뜬 적이 없는 죽은 코드였다 — 화면에는 아무 흔적도 안 남는다.
 */
describe("데모 안내 도달 가능성 (#212)", () => {
  it("드라이브 목록은 여전히 데모를 제외한다", () => {
    // AC-17: 데모는 목록·통계·발행 카운트 어디에도 나타나지 않는다.
    // 이 규칙을 풀어서 안내를 띄우는 건 잘못된 해법이다.
    expect(DRIVE, "드라이브가 데모를 걸러내지 않는다").toMatch(
      /\.eq\("exams\.is_demo",\s*false\)/
    );
  });

  it("안내는 목록이 아니라 별도 경로로 데모를 찾는다", () => {
    expect(HOME, "아직 목록에서 데모를 찾는다").not.toMatch(
      /examNodes\.find\(\(node\) => node\.exams\?\.is_demo/
    );
    expect(HOME, "데모 상태를 조회하지 않는다").toMatch(
      /qk\.instructor\.demoStatus\(\)/
    );
  });

  it("안내가 그 id 로 링크를 만든다", () => {
    expect(HOME).toMatch(/demoExamId/);
    // 죽은 참조가 남아 있으면 안 된다.
    expect(HOME, "demoNode 잔재가 있다").not.toMatch(/demoNode/);
  });

  it("상태 API 가 데모 examId 를 준다", () => {
    expect(STATUS, "examId 를 안 준다").toMatch(/successJson\(\{[^}]*examId/);
    expect(STATUS, "is_demo 로 찾지 않는다").toMatch(/\.eq\("is_demo",\s*true\)/);
  });

  it("상태 API 는 소유자 것만 본다", () => {
    // 남의 데모를 가리키면 안 된다.
    expect(STATUS).toMatch(/\.eq\("instructor_id",\s*user\.id\)/);
  });

  it("데모 조회가 실패해도 나머지 상태를 죽이지 않는다", () => {
    // 안내 링크 하나 때문에 완주 여부까지 못 받으면 손해가 더 크다.
    // Promise.all 안에서 throw 하면 전체가 reject 돼 500 이 나간다.
    expect(STATUS, "반환된 error 를 안 삼킨다").toMatch(/if \(error\)[\s\S]{0,200}return null/);
    expect(STATUS, "throw 를 안 삼킨다").toMatch(/catch \(err\)[\s\S]{0,200}return null/);
  });

  it("쿼리 키를 하드코딩하지 않는다", () => {
    const keys = read("lib/query-keys.ts");
    expect(keys, "qk 에 demoStatus 가 없다").toMatch(/demoStatus:/);
  });
});
