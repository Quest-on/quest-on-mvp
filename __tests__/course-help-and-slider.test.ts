import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * shadcn 프리미티브는 하드코딩 색을 쓰지 않는다.
 *
 * `bg-white` 는 다크모드에서 그대로 흰색이라 대비가 깨진다. #228~#237 에서
 * 상태색 375건을 토큰으로 옮겨놓고 정작 ui/ 프리미티브에 원색이 남아 있으면
 * 같은 문제가 재발한다.
 */
describe("components/ui/slider — shadcn 원본 유지", () => {
  const SOURCE = read("components/ui/slider.tsx");

  it("썸에 하드코딩 색이 없다", () => {
    expect(SOURCE).not.toMatch(/bg-(white|black)\b/);
    expect(SOURCE).toMatch(/bg-background/);
  });

  it("Radix 프리미티브를 그대로 쓴다", () => {
    // 직접 만든 트랙/썸 마크업으로 갈아끼우지 않는다.
    for (const part of ["SliderPrimitive.Root", "SliderPrimitive.Track", "SliderPrimitive.Range", "SliderPrimitive.Thumb"]) {
      expect(SOURCE, `${part} 가 사라졌다`).toContain(part);
    }
  });

  it("접근성 이름이 role=slider 를 가진 Thumb 로 간다", () => {
    // Radix 는 role="slider" 를 Thumb 에 둔다. Root 에만 붙이면 스크린리더가
    // 못 읽고 getByRole("slider", { name }) 도 안 잡힌다.
    const thumbBlock = SOURCE.slice(SOURCE.indexOf("SliderPrimitive.Thumb"));
    expect(thumbBlock).toMatch(/aria-label/);
  });
});

/**
 * 채점 비중은 shadcn 슬라이더 문서의 Controlled 패턴을 따른다.
 *
 * 회색 박스에 파일 아이콘까지 얹으면 입력이 아니라 진행 바처럼 보인다.
 */
describe("채점 비중 — shadcn Controlled 패턴", () => {
  const SOURCE = read("components/instructor/SimpleExamAuthoringForm.tsx");

  // 채점 비중 구간만 본다. 최종 점수 비중 카드는 여러 슬라이더를 담는
  // 컨테이너라 박스가 정당하다.
  const CHAT = SOURCE.slice(SOURCE.indexOf("fieldChatWeightLabel"));

  it("채점 비중 슬라이더를 회색 박스로 감싸지 않는다", () => {
    expect(CHAT).not.toMatch(/rounded-md border bg-muted\/20 p-3/);
  });

  it("값 표시에 장식 아이콘을 붙이지 않는다", () => {
    expect(SOURCE).not.toMatch(/\bFileText\b/);
  });

  it("shadcn Slider 를 쓴다", () => {
    expect(SOURCE).toMatch(/from "@\/components\/ui\/slider"/);
    expect(SOURCE).toMatch(/<Slider\b/);
  });
});

/**
 * 과목 라벨도 같은 카드의 다른 항목처럼 물음표로 설명을 단다.
 *
 * 설명을 본문에 늘어놓으면 "안 골라도 된다" 를 네 번 말하게 된다(#238).
 * 필요한 사람만 열어보는 자리에 둔다.
 */
describe("과목 필드 — 도움말 물음표", () => {
  const SOURCE = read("components/instructor/CourseSelectField.tsx");

  it("라벨에 HelpCircle 툴팁이 있다", () => {
    expect(SOURCE).toMatch(/HelpCircle/);
    expect(SOURCE).toMatch(/TooltipTrigger/);
    expect(SOURCE).toMatch(/course\.tooltip/);
  });

  it("설명을 본문 헬퍼로 되돌리지 않는다", () => {
    // #238 에서 걷어낸 것들. 툴팁이 생겼다고 본문에 다시 깔면 원위치다.
    for (const key of ["course.helper", "course.emptyTitle", "course.emptyDescription"]) {
      expect(SOURCE, `${key} 가 되살아났다`).not.toContain(key);
    }
  });

  it("ko/en 툴팁 문구가 양쪽 다 있다", () => {
    for (const loc of ["ko", "en"]) {
      const msgs = JSON.parse(read(`messages/${loc}/instructor.json`));
      expect(msgs.course.tooltip, `${loc} tooltip 누락`).toBeTruthy();
    }
  });
});
