import { describe, expect, it } from "vitest";
import {
  hasCompletedInterview,
  readStoredScoreRange,
} from "@/lib/bulk-grading-criteria";

/**
 * 이슈 #426 의 나머지 절반.
 *
 * 재채점은 `criteriaText` 가 있으면 대화 추출을 건너뛰는데, 그 경로가
 * `score_range` 를 만들지 않았다. 그러면 워커에서 이렇게 된다:
 *
 *   buildScoreAntiClusterBlock(lang, undefined)
 *     → "강사 min/max만 따르세요. 기본 점수 없음."  ← min/max 를 알려주지 않는다
 *   clampScore(score, undefined)
 *     → min 0 / max 100 으로 조용히 되돌아간다
 *
 * 강사가 40~95 로 확정해도 0~100 으로 채점된다. 경고도 로그도 없다.
 * 그래서 재채점은 **이미 확정된 범위를 이어받아야** 한다.
 */

describe("저장된 기준에서 점수 범위를 이어받는다 (#426)", () => {
  it("객체로 저장된 범위를 읽는다", () => {
    expect(readStoredScoreRange({ score_range: { min: 40, max: 95 } })).toEqual({
      min: 40,
      max: 95,
      notes: undefined,
    });
  });

  it("문자열(JSON)로 저장된 범위도 읽는다", () => {
    // grading_criteria 는 JSON.stringify 로 저장된다.
    const stored = JSON.stringify({ criteria_summary: "…", score_range: { min: 30, max: 90 } });
    expect(readStoredScoreRange(stored)).toEqual({ min: 30, max: 90, notes: undefined });
  });

  it("notes 를 보존한다", () => {
    const r = readStoredScoreRange({ score_range: { min: 40, max: 95, notes: "강사 확정" } });
    expect(r?.notes).toBe("강사 확정");
  });

  it("범위가 없거나 망가졌으면 null 이다", () => {
    expect(readStoredScoreRange(null)).toBeNull();
    expect(readStoredScoreRange({})).toBeNull();
    expect(readStoredScoreRange({ score_range: {} })).toBeNull();
    expect(readStoredScoreRange({ score_range: { min: 40 } })).toBeNull();
    expect(readStoredScoreRange("not json")).toBeNull();
    // 뒤집힌 범위는 이어받지 않는다 — clamp 가 모든 점수를 한 값으로 눌러버린다.
    expect(readStoredScoreRange({ score_range: { min: 95, max: 40 } })).toBeNull();
    // 0~100 밖은 받지 않는다.
    expect(readStoredScoreRange({ score_range: { min: -5, max: 120 } })).toBeNull();
  });
});

describe("인터뷰를 마친 세션은 재채점할 수 있다 (#426)", () => {
  it("sample_review 와 approved 둘 다 인정한다", () => {
    // 첫 가채점 직전은 sample_review, 한 번 채점하고 나면 approved 로 넘어간다.
    // 재채점을 sample_review 로만 막으면 대화로 조정한 뒤 다시 돌릴 수 없다.
    expect(hasCompletedInterview("sample_review")).toBe(true);
    expect(hasCompletedInterview("approved")).toBe(true);
  });

  it("아직 진행 중이거나 비어 있으면 안 된다", () => {
    expect(hasCompletedInterview("interviewing")).toBe(false);
    expect(hasCompletedInterview("pending")).toBe(false);
    expect(hasCompletedInterview(null)).toBe(false);
    expect(hasCompletedInterview(undefined)).toBe(false);
  });
});
