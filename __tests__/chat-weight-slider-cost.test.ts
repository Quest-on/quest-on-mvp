import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 대화 비중 슬라이더의 클릭 비용
 *
 * 예전에는 슬라이더에 닿기까지 클릭이 3번 필요했다.
 *   ① "조정" 버튼으로 showAdvancedGrading 펼치기
 *   ② "직접 설정" Switch 로 isCustomWeight 켜기
 *   ③ 드래그
 *
 * ①②는 아무 값도 정하지 않는 순수 UI 개폐 동작이었다. 게다가 ②는 기본값과
 * 같은 50 을 넣어서 화면상 아무 변화가 없었다 — 눌러도 그대로인데 슬라이더만
 * 생기는 상태였다.
 *
 * chatWeight 는 null 이 기본값이고 숫자가 사용자 지정이다. 그 내부 상태를
 * 스위치로 노출한 게 원인이었다.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), "components", "instructor", "SimpleExamAuthoringForm.tsx"),
  "utf8"
);

/** 주석은 제외한다 — 설명문에 옛 식별자가 나와 자기 자신에 걸린다. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const ko = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "ko", "authoring.json"), "utf8")
) as { simpleExamAuthoringForm: Record<string, string> };

const en = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "en", "authoring.json"), "utf8")
) as { simpleExamAuthoringForm: Record<string, string> };

describe("슬라이더에 닿기까지 클릭이 필요 없다", () => {
  it("펼침 게이트가 없다", () => {
    // showAdvancedGrading 이 돌아오면 다시 클릭 한 번이 붙는다.
    expect(CODE).not.toMatch(/showAdvancedGrading/);
    expect(CODE).not.toMatch(/setShowAdvancedGrading/);
  });

  it("사용자 지정 스위치가 없다", () => {
    // 슬라이더를 움직이는 행위 자체가 사용자 지정이다.
    expect(CODE).not.toMatch(/isCustomWeight\s*\}/);
    expect(CODE).not.toMatch(/simple-custom-weight/);
    expect(ko.simpleExamAuthoringForm.switchCustomWeight).toBeUndefined();
    expect(en.simpleExamAuthoringForm.switchCustomWeight).toBeUndefined();
  });

  it("조정 버튼 문구가 제거됐다", () => {
    expect(ko.simpleExamAuthoringForm.buttonAdjust).toBeUndefined();
    expect(en.simpleExamAuthoringForm.buttonAdjust).toBeUndefined();
  });

  it("슬라이더가 조건부 렌더링 뒤에 숨지 않는다", () => {
    // `{isCustomWeight && (<Slider` 같은 형태로 되돌아가면 안 된다.
    const sliderIdx = CODE.indexOf("<Slider\n                  className=\"mt-3\"");
    expect(sliderIdx).toBeGreaterThan(-1);

    // 슬라이더 바로 앞 200자에 조건부 게이트가 없어야 한다.
    const before = CODE.slice(Math.max(0, sliderIdx - 200), sliderIdx);
    expect(before).not.toMatch(/&&\s*\($/);
  });
});

describe("저장 계약이 깨지지 않는다", () => {
  it("슬라이더를 움직이면 숫자가 들어간다", () => {
    expect(CODE).toMatch(/onValueChange=\{\(\[value\]\) => onChatWeightChange\(value\)\}/);
  });

  it("기본값으로 되돌리는 수단이 있고 null 을 넣는다", () => {
    // null 이어야 "안 건드림"으로 저장된다. 50 을 넣으면 사용자 지정으로 남는다.
    expect(CODE).toMatch(/onClick=\{\(\) => onChatWeightChange\(null\)\}/);
    expect(ko.simpleExamAuthoringForm.buttonResetWeight).toBeTruthy();
    expect(en.simpleExamAuthoringForm.buttonResetWeight).toBeTruthy();
  });

  it("되돌리기 버튼은 사용자가 값을 지정했을 때만 보인다", () => {
    // 기본 상태에서 "기본값" 버튼이 보이면 이미 바꾼 것처럼 읽힌다.
    const resetIdx = CODE.indexOf("buttonResetWeight");
    expect(resetIdx).toBeGreaterThan(-1);
    const before = CODE.slice(Math.max(0, resetIdx - 400), resetIdx);
    expect(before).toMatch(/\{isCustomWeight && \(/);
  });

  it("기본값 판정이 null 기준을 유지한다", () => {
    expect(CODE).toMatch(/const isCustomWeight = chatWeight !== null/);
    expect(CODE).toMatch(/const effectiveWeight = chatWeight \?\? 50/);
  });
});

describe("표시가 값을 따라간다", () => {
  it("대화/최종 비율을 함께 보여준다", () => {
    expect(CODE).toMatch(/chatWeightDisplay[\s\S]{0,120}100 - effectiveWeight/);
    expect(ko.simpleExamAuthoringForm.chatWeightDisplay).toMatch(/\{chat\}/);
    expect(ko.simpleExamAuthoringForm.chatWeightDisplay).toMatch(/\{final\}/);
  });

  it("슬라이더에 접근성 라벨이 있다", () => {
    expect(CODE).toMatch(/aria-label=\{t\("simpleExamAuthoringForm\.fieldChatWeightLabel"\)\}/);
  });
});
