import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadUniversities, searchUniversities } from "@/lib/seoul-universities";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("대학교 검색", () => {
  it("완성형 한글 질의에는 무관한 초성 일치 결과를 섞지 않는다", async () => {
    const results = await searchUniversities("고려");

    expect(results.some((university) => university.fullName === "고려대학교")).toBe(true);
    expect(
      results.some(
        (university) => university.fullName === "가톨릭대학교 제2캠퍼스"
      )
    ).toBe(false);
    expect(await searchUniversities("김큐에이")).toEqual([]);
  });

  it("순수 초성 질의는 계속 검색한다", async () => {
    const results = await searchUniversities("ㄱㄹ");

    expect(results.some((university) => university.fullName === "고려대학교")).toBe(true);
  });

  it("이름 시작 일치를 포함 일치보다 앞에 둔다", async () => {
    const results = await searchUniversities("서울대");

    expect(results[0]?.fullName).toBe("서울대학교");
  });

  it("빈 질의는 전체 목록을 반환한다", async () => {
    expect(await searchUniversities("")).toEqual(await loadUniversities());
  });
});

describe("온보딩 소속 기관 입력", () => {
  const src = read("app/(app)/onboarding/page.tsx");

  it("검색 제안과 제출값을 하나의 state로 관리한다", () => {
    expect(src).not.toMatch(/schoolSearchQuery|justSelectedRef/);
    expect(src).toMatch(/value=\{school\}/);
    expect(src).toMatch(/onChange=\{\(e\) => setSchool\(e\.target\.value\)\}/);
    expect(src).toMatch(/disabled=\{[\s\S]*?!school/);
  });

  it("prefill 과 제안 선택으로 들어간 값은 검색하지 않는다", () => {
    // 건너뛰기를 boolean 이 아니라 "건너뛸 값" 으로 든다. 값 비교여야
    // prefill 이 사용자 입력에 밀려 무시된 경우에 플래그가 남지 않는다.
    expect(src).toMatch(/const suppressSearchForRef = useRef<string \| null>\(null\)/);
    expect(src).toMatch(/suppressSearchForRef\.current = p\.school/);
    expect(src).toMatch(/suppressSearchForRef\.current = university\.fullName/);
    expect(src).toMatch(
      /if \(suppressSearchForRef\.current === school\) \{\s+suppressSearchForRef\.current = null;\s+return;/
    );
  });

  it("prefill 이 사용자 입력을 덮어쓰지 않는다", () => {
    expect(src).toMatch(/setSchool\(\(prev\) => prev \|\| p\.school \|\| ""\)/);
  });
});
