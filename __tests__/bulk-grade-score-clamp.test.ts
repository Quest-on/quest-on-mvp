/**
 * bulk-grade 점수 범위 clamp 회귀 가드.
 *
 * 버그: 재보정(anti-clustering) 경로가 강사 지정 score_range 를 clamp 하지 않고
 * AI 점수를 그대로 저장할 수 있었다(원본 채점 경로는 clamp 함). 이제 두 경로가
 * 공유 clampScore 를 쓴다. 이 테스트는 점수가 강사 지정 min/max 를 벗어나지 않음을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { clampScore } from "@/lib/bulk-grade-score-cluster";

describe("clampScore — 강사 지정 범위 강제", () => {
  it("범위(60~90) 밖 낮은 점수는 min 으로 올린다", () => {
    expect(clampScore(45, { min: 60, max: 90 })).toBe(60);
  });

  it("범위(60~90) 밖 높은 점수는 max 로 내린다", () => {
    expect(clampScore(100, { min: 60, max: 90 })).toBe(90);
  });

  it("범위 안 점수는 반올림만 한다", () => {
    expect(clampScore(72.4, { min: 60, max: 90 })).toBe(72);
    expect(clampScore(72.6, { min: 60, max: 90 })).toBe(73);
  });

  it("범위 미지정 시 기본 0~100 을 적용한다", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(55)).toBe(55);
  });

  it("min===max 이면 항상 그 값으로 고정된다", () => {
    expect(clampScore(30, { min: 80, max: 80 })).toBe(80);
    expect(clampScore(999, { min: 80, max: 80 })).toBe(80);
  });

  it("경계값은 그대로 유지된다", () => {
    expect(clampScore(60, { min: 60, max: 90 })).toBe(60);
    expect(clampScore(90, { min: 60, max: 90 })).toBe(90);
  });
});
