import { describe, expect, it } from "vitest";
import {
  computeCaseGrades,
  isCaseGraded,
  deriveOverallStatus,
} from "@/app/api/exam/[examId]/student-summaries/route";

/**
 * 회귀: 시험 문항에 `idx` 필드가 없는(undefined) 경우, grades는 배열 위치(pos)로
 * 저장되는데 대시보드가 grade를 `q.idx`(=undefined)로 조회해 caseGraded=0이 되고,
 * 제출 학생 전원이 "채점중"으로 오판되어 엑셀/CSV 다운로드 버튼이 영구 비활성화됐다.
 * (시험 O9266D 실증) — grade 조회를 `q.idx ?? pos`로 통일해 export와 규약을 맞춘다.
 */
describe("computeCaseGrades — q_idx 이중 규약(idx 없음) 회귀", () => {
  it("문항에 idx가 없으면 배열 위치(pos)로 grade를 찾아 채점으로 집계한다", () => {
    const caseEntries = [
      { q: { idx: undefined }, pos: 18 },
      { q: { idx: undefined }, pos: 19 },
    ];
    const gradeByQ = new Map([
      [18, { grade_type: "manual", score: 80 }],
      [19, { grade_type: "manual", score: 90 }],
    ]);

    const r = computeCaseGrades(caseEntries, gradeByQ);

    expect(r.caseGraded).toBe(2); // 버그 시절엔 0 → 다운로드 차단
    expect(r.hasManualCase).toBe(true);
    expect(r.hasFailed).toBe(false);
    expect(r.caseScores).toEqual([80, 90]);
  });

  it("문항에 idx가 있으면 idx 키로 grade를 찾는다 (배열 위치와 달라도)", () => {
    const caseEntries = [{ q: { idx: 5 }, pos: 3 }];
    const gradeByQ = new Map([[5, { grade_type: "auto", score: 70 }]]);

    expect(computeCaseGrades(caseEntries, gradeByQ).caseGraded).toBe(1);
  });

  it("ai_failed grade는 hasFailed로 표시하고 채점 집계에서 제외한다", () => {
    const caseEntries = [{ q: { idx: undefined }, pos: 0 }];
    const gradeByQ = new Map([[0, { grade_type: "ai_failed", score: null }]]);

    const r = computeCaseGrades(caseEntries, gradeByQ);
    expect(r.caseGraded).toBe(0);
    expect(r.hasFailed).toBe(true);
  });

  it("grade가 없으면 미채점으로 둔다", () => {
    const caseEntries = [{ q: { idx: undefined }, pos: 7 }];
    const gradeByQ = new Map<number, { grade_type?: string; score?: number }>();

    expect(computeCaseGrades(caseEntries, gradeByQ).caseGraded).toBe(0);
  });
});

describe("isCaseGraded", () => {
  it("manual/auto만 채점으로 인정한다", () => {
    expect(isCaseGraded("manual")).toBe(true);
    expect(isCaseGraded("auto")).toBe(true);
    expect(isCaseGraded("ai_failed")).toBe(false);
    expect(isCaseGraded("ai_summary")).toBe(false);
    expect(isCaseGraded(null)).toBe(false);
    expect(isCaseGraded(undefined)).toBe(false);
  });
});

describe("deriveOverallStatus", () => {
  const base = {
    sessionStatus: "submitted" as const,
    hasFailed: false,
    gradingProgress: null,
  };

  it("모든 케이스가 채점되면 ai_graded", () => {
    expect(
      deriveOverallStatus({ ...base, caseTotal: 2, caseGraded: 2, hasManualCase: false }),
    ).toBe("ai_graded");
  });

  it("manual 채점이 하나라도 있으면 manually_graded", () => {
    expect(
      deriveOverallStatus({ ...base, caseTotal: 2, caseGraded: 2, hasManualCase: true }),
    ).toBe("manually_graded");
  });

  it("일부만 채점되면 grading (다운로드 차단 상태)", () => {
    expect(
      deriveOverallStatus({ ...base, caseTotal: 2, caseGraded: 1, hasManualCase: false }),
    ).toBe("grading");
  });

  it("케이스 문항이 없는 객관식 전용 시험은 ai_graded", () => {
    expect(
      deriveOverallStatus({ ...base, caseTotal: 0, caseGraded: 0, hasManualCase: false }),
    ).toBe("ai_graded");
  });

  it("전 문항 채점완료면 grading_progress가 running으로 stale해도 완료로 본다 (회귀)", () => {
    expect(
      deriveOverallStatus({
        sessionStatus: "submitted",
        caseTotal: 2,
        caseGraded: 2,
        hasManualCase: true,
        hasFailed: false,
        gradingProgress: { status: "running" } as never,
      }),
    ).toBe("manually_graded");
  });

  it("일부만 채점된 상태에서 running이면 여전히 grading", () => {
    expect(
      deriveOverallStatus({
        sessionStatus: "submitted",
        caseTotal: 2,
        caseGraded: 1,
        hasManualCase: false,
        hasFailed: false,
        gradingProgress: { status: "running" } as never,
      }),
    ).toBe("grading");
  });
});
