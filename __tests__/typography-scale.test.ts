import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * 타입 스케일 중앙화.
 *
 * 실측 결과 `text-xs` ~ `text-4xl` 8가지 크기와 4가지 굵기가 1100건 넘게
 * 화면마다 흩어져 있었다. 같은 위계의 글자가 화면마다 다른 크기로 나온다.
 * 역할 이름으로 부르면 크기를 몰라도 되고, 바꿀 때 한 곳만 고치면 된다.
 */
describe("타입 스케일", () => {
  const CSS = read("app/globals.css");

  it("역할 기반 클래스가 정의돼 있다", () => {
    for (const role of [
      "type-page-title",
      "type-section-title",
      "type-field-label",
      "type-body",
      "type-hint",
      "type-meta",
    ]) {
      expect(CSS, `${role} 가 없다`).toContain(`.${role} {`);
    }
  });

  it("본문 기준이 16px 다", () => {
    // UI 규칙의 anchor size. 여기가 흔들리면 나머지 위계가 다 흔들린다.
    const body = CSS.slice(CSS.indexOf(".type-body {"));
    expect(body.slice(0, 120)).toMatch(/text-base/);
  });
});

/**
 * 한글은 음절 단위로 끊기면 안 된다.
 *
 * 기본 word-break 는 "한데 묶어 봅니 / 다." 처럼 단어 중간을 자르고 오른쪽에
 * 큰 빈 공간을 남긴다. 툴팁처럼 폭이 좁은 곳에서 특히 심하다.
 */
describe("한글 줄바꿈", () => {
  const CSS = read("app/globals.css");

  it("body 에 keep-all 이 걸려 있다", () => {
    expect(CSS).toMatch(/word-break:\s*keep-all/);
  });

  it("긴 영문 단어는 넘치지 않게 둔다", () => {
    // keep-all 만 걸면 URL 같은 긴 토큰이 컨테이너를 뚫는다.
    expect(CSS).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("툴팁이 text-balance 로 줄을 일찍 끊지 않는다", () => {
    // keep-all 과 겹치면 오른쪽에 큰 빈 공간이 남는다.
    expect(read("components/ui/tooltip.tsx")).not.toMatch(/text-balance/);
  });
});

/**
 * "선택" 배지는 쓰지 않는다.
 *
 * 필수 항목에 `*` 를 붙이므로 나머지가 선택이라는 건 이미 드러난다.
 * 필드마다 "선택" 을 붙이면 화면이 그 단어로 뒤덮인다.
 */
describe("선택 배지 제거", () => {
  it("시험 출제 폼이 optional 배지를 렌더하지 않는다", () => {
    const s = read("components/instructor/SimpleExamAuthoringForm.tsx");
    expect(s).not.toMatch(/\{optionalLabel\}/);
    expect(s).not.toMatch(/simpleExamAuthoringForm\.optional/);
  });

  it("과목 필드가 optional 배지를 렌더하지 않는다", () => {
    expect(read("components/instructor/CourseSelectField.tsx")).not.toMatch(/course\.optional/);
  });
});

/**
 * 같은 카드 안의 필드 라벨은 같은 위계다.
 */
describe("필드 라벨 일관성", () => {
  it("과목 라벨이 다른 필드보다 크지 않다", () => {
    // isSection 변형이라고 text-base font-semibold 로 키우면 같은 카드 안에서
    // 과목만 16px/600, 나머지는 14px/500 이 된다.
    const s = read("components/instructor/CourseSelectField.tsx");
    expect(s).not.toMatch(/isSection && "text-base font-semibold"/);
    expect(s).toMatch(/type-field-label/);
  });

  it("과목 입력에 하드코딩 흰색이 없다", () => {
    expect(read("components/instructor/CourseSelectField.tsx")).not.toMatch(/bg-white\b/);
  });
});
