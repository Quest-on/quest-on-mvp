import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

const HOME = read("components/instructor/InstructorHomeClient.tsx");

/**
 * 대시보드 첫인상. (#212)
 *
 * 온보딩을 막 끝낸 사람이 도착하는 화면이다. 강조 버튼이 여러 개면 눈이
 * 갈라지고, 다음 할 일을 화면이 말해주지 않으면 방금 만든 데모가 어디 있는지도
 * 모른 채 멈춘다.
 */
describe("버튼 위계", () => {
  /** `variant` 를 지정하지 않은 `<Button>` 이 강조(default) 다. */
  function emphasisButtons(source: string): number[] {
    const lines = source.split("\n");
    const hits: number[] = [];
    lines.forEach((line, i) => {
      if (!/<Button/.test(line)) return;
      const block = lines.slice(i, i + 5).join(" ");
      if (!/variant="/.test(block)) hits.push(i + 1);
    });
    return hits;
  }

  it("페이지 본문의 강조 버튼이 하나다", () => {
    // 다이얼로그 확인 버튼은 그 안에서만 보이므로 경쟁하지 않는다.
    const body = HOME.slice(0, HOME.indexOf("isEditDialogOpen"));
    const hits = emphasisButtons(body);
    expect(hits.length, `강조 버튼 위치: ${hits.join(", ")}`).toBeLessThanOrEqual(1);
  });

  it("툴바 드롭다운은 강조가 아니다", () => {
    // 상시 보이는 보조 진입점이다. 빈 화면의 "시험 만들기" 와 경쟁하면 안 된다.
    // 드롭다운이 여러 개다. 툴바 것은 #212 주석을 달아 표시했다.
    const idx = HOME.indexOf("주 행동은 하나여야 한다");
    expect(idx, "툴바 드롭다운 주석을 못 찾았다").toBeGreaterThan(-1);
    expect(HOME.slice(idx, idx + 400)).toMatch(/variant="outline"/);
  });

  it("원색 팔레트를 쓰지 않는다", () => {
    // 색으로 위계를 만들려면 시맨틱 토큰이어야 한다. 원색은 의미가 없다.
    const m = HOME.match(
      /\b(bg|text|border|ring)-(red|orange|amber|yellow|green|emerald|blue|sky|indigo|violet|purple|gray|slate|zinc)-\d{2,3}\b/g
    );
    expect(m ?? [], (m ?? []).join(", ")).toEqual([]);
  });
});

describe("착지 후 다음 걸음", () => {
  it("데모가 있으면 다음 걸음을 안내한다", () => {
    expect(HOME).toMatch(/home\.nextStepTitle/);
    expect(HOME).toMatch(/home\.nextStepDemo/);
    expect(HOME).toMatch(/demoNode \?/);
  });

  it("데모를 실제로 찾아서 연결한다", () => {
    // 문구만 있고 링크가 엉뚱한 곳으로 가면 안내가 아니다.
    expect(HOME).toMatch(/examNodes\.find\(\(node\) => node\.exams\?\.is_demo === true\)/);
    expect(HOME).toMatch(/\/instructor\/\$\{demoNode\.exams\?\.id \?\? demoNode\.id\}/);
  });

  it("데모가 없으면 그 블록이 뜨지 않는다", () => {
    // 데모 없는 사람에게 "데모 열기" 를 보여주면 막다른 길이다.
    const idx = HOME.indexOf("{demoNode ? (");
    expect(idx).toBeGreaterThan(-1);
    expect(HOME.slice(idx, idx + 800)).toMatch(/\) : null\}/);
  });

  it("ko/en 문구가 있다", () => {
    for (const lang of ["ko", "en"]) {
      const h = json(`messages/${lang}/instructor.json`).home;
      for (const key of ["nextStepTitle", "nextStepDemo", "nextStepDemoCta"]) {
        expect(h?.[key], `${lang}.${key} 누락`).toBeTruthy();
      }
    }
  });

  it("안내가 무엇을 하라는지 말한다", () => {
    // "환영합니다" 류는 다음 할 일을 말하지 않는다.
    const ko = json("messages/ko/instructor.json").home;
    expect(ko.nextStepDemo).toMatch(/학생/);
    expect(ko.nextStepDemoCta).not.toBe("확인");
  });
});
