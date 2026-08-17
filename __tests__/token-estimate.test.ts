import { describe, expect, it } from "vitest";
import {
  estimateTokenCount,
  exceedsPromptBudget,
  PROMPT_TOKEN_BUDGET,
  TOKENS_PER_HANGUL_CHAR,
  TOKENS_PER_OTHER_CHAR,
} from "@/lib/bulk-grading";

/**
 * 한국어 토큰 추정. (#180)
 *
 * 예전 구현은 `chars / 4`(= 0.25 토큰/자)였다. 영어는 약 4.9자/토큰이라
 * 맞지만, 한국어는 FLORES-200 devtest 1,012문장 기준 0.600 토큰/자다.
 * 2.4배 과소 추정이고, 이 저장소의 프롬프트는 대부분 한국어다.
 *
 * 기대값은 **고정 상수**로 단언한다. 함수 출력에서 재유도하거나 외부
 * 토크나이저를 호출하면 아무것도 증명하지 못한다.
 */
describe("estimateTokenCount — 한국어 계수", () => {
  it("한글 음절을 비한글보다 무겁게 센다", () => {
    // 이게 핵심이다. 두 계수가 같아지면 예전 버그로 되돌아간다.
    expect(TOKENS_PER_HANGUL_CHAR).toBeGreaterThan(TOKENS_PER_OTHER_CHAR);
  });

  it("한글 계수가 실측값(0.600) 이상이다", () => {
    // 추정은 과대 방향으로만 틀려야 한다. 과소는 조용한 초과로 이어진다.
    expect(TOKENS_PER_HANGUL_CHAR).toBeGreaterThanOrEqual(0.6);
  });

  it("한글 10자 = 7토큰 (0.65 계수, 올림)", () => {
    // 10 * 0.65 = 6.5 -> 7
    expect(estimateTokenCount("가나다라마바사아자차")).toBe(7);
  });

  it("영문 400자 = 100토큰 (0.25 계수 유지)", () => {
    // 영어는 예전 계수가 맞았다. 바꾸지 않는다.
    expect(estimateTokenCount("a".repeat(400))).toBe(100);
  });

  it("예전 chars/4 보다 한국어를 크게 센다", () => {
    const ko = "한국어 문장은 음절 하나가 대략 0.6 토큰을 소비한다.";
    const oldEstimate = Math.ceil(ko.length / 4);
    expect(estimateTokenCount(ko)).toBeGreaterThan(oldEstimate);
  });

  it("빈 문자열은 0 이다", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("공백을 세서 역전이 생기지 않는다", () => {
    // 공백을 빼면 띄어쓰기 있는 한국어가 없는 것보다 낮게 추정된다.
    // 실제 토크나이저는 공백도 소비한다.
    expect(estimateTokenCount("가 나 다")).toBeGreaterThan(estimateTokenCount("가나다"));
  });

  it("한글 자모와 호환 자모도 한글로 센다", () => {
    // 초성 검색이나 조합 중 입력이 프롬프트에 섞일 수 있다.
    expect(estimateTokenCount("ㄱㄴㄷㄹ")).toBe(estimateTokenCount("가나다라"));
  });

  it("혼합 문장은 두 계수의 합이다", () => {
    // "가나다abcd" = 한글 3 * 0.65 + 기타 4 * 0.25 = 1.95 + 1.0 = 2.95 -> 3
    expect(estimateTokenCount("가나다abcd")).toBe(3);
  });
});

describe("exceedsPromptBudget", () => {
  it("예산이 정의돼 있다", () => {
    expect(PROMPT_TOKEN_BUDGET).toBeGreaterThan(0);
  });

  it("짧은 프롬프트는 초과가 아니다", () => {
    expect(exceedsPromptBudget("짧은 프롬프트")).toBe(false);
  });

  it("예산을 넘는 한국어는 초과로 잡는다", () => {
    // 0.65 토큰/자이므로 예산 / 0.65 자를 넘기면 초과다. 여유를 둬서 2배.
    const long = "가".repeat(Math.ceil((PROMPT_TOKEN_BUDGET / TOKENS_PER_HANGUL_CHAR) * 2));
    expect(exceedsPromptBudget(long)).toBe(true);
  });

  it("예전 계수였다면 놓쳤을 길이를 잡는다", () => {
    // chars/4 로는 예산 이하로 계산돼 통과했을 길이.
    const chars = Math.ceil(PROMPT_TOKEN_BUDGET / TOKENS_PER_HANGUL_CHAR) + 1000;
    const text = "가".repeat(chars);
    expect(Math.ceil(text.length / 4)).toBeLessThan(PROMPT_TOKEN_BUDGET);
    expect(exceedsPromptBudget(text)).toBe(true);
  });
});
