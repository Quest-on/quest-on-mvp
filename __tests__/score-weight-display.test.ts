import { describe, expect, it } from "vitest";
import { calculateWeightedOverallScore, type ScoreWeights } from "@/lib/grade-utils";

/**
 * 배점 비중: 화면과 채점이 같은 분모를 쓴다 (#224)
 *
 * 채점은 weight 를 **상대 비중**으로 쓴다 —
 *   최종점수 = SUM( 유형평균 x weight / totalConfiguredWeight )   (lib/grade-utils.ts)
 *
 * 그런데 화면은 `weight / count` 로 절대 배점처럼 보여줬다. 총합이 100 일 때만
 * 우연히 맞고 벗어나면 거짓말을 했다.
 *   30/20 (합 50)   화면 10점  <-> 실제 기여 20점   (절반으로 축소)
 *   100/100 (합 200) 화면 33.3점 <-> 실제 기여 16.7점 (두 배로 부풀림)
 *
 * 이 파일은 화면 산식을 채점 산식과 같은 기준으로 고정한다. 채점 코드 자체는
 * 건드리지 않았으므로 기존 시험의 산출 점수는 변하지 않는다 — 그 불변도 아래에서
 * 함께 고정한다.
 */

/** 화면 산식 (components/instructor/SimpleExamAuthoringForm.tsx) */
function share(weight: number, total: number): number {
  return total > 0 ? weight / total : 0;
}

function perQuestionScore(weight: number, total: number, count: number): number | null {
  if (count === 0) return null;
  return (share(weight, total) * 100) / count;
}

describe("화면의 문항당 점수가 채점 기여와 일치한다", () => {
  it.each([
    ["총합 100 (예전에도 맞던 경우)", 60, 3, 40, 2],
    ["총합 50 — 예전에는 절반으로 축소됐다", 30, 3, 20, 2],
    ["총합 200 — 예전에는 두 배로 부풀었다", 100, 3, 100, 2],
    ["비대칭", 90, 1, 10, 4],
  ])("%s", (_label, wA, cA, wB, cB) => {
    const total = wA + wB;

    // 각 유형의 문항당 점수 x 문항 수 = 그 유형이 최종 점수에서 차지하는 몫
    const bucketA = perQuestionScore(wA, total, cA)! * cA;
    const bucketB = perQuestionScore(wB, total, cB)! * cB;

    expect(bucketA).toBeCloseTo(share(wA, total) * 100, 6);
    expect(bucketB).toBeCloseTo(share(wB, total) * 100, 6);

    // 두 유형을 합치면 언제나 100 점이다. 슬라이더 눈금 총합과 무관하다.
    expect(bucketA + bucketB).toBeCloseTo(100, 6);
  });

  it("슬라이더 눈금을 비례로 키워도 화면 값이 변하지 않는다", () => {
    // 60/40 과 600/400 은 같은 비중이다. 예전 화면은 10배 다르게 보여줬다.
    const small = perQuestionScore(60, 100, 3);
    const large = perQuestionScore(600, 1000, 3);

    expect(small).toBeCloseTo(large!, 6);
  });

  it("모든 유형을 같은 값으로 올리면 균등해진다", () => {
    // 이게 예전에 가장 헷갈리던 지점이다. 100/100 으로 올리면 "점수가 커졌다"고
    // 보였지만 실제로는 60:40 이 50:50 으로 바뀐 것이었다.
    expect(share(100, 200)).toBe(0.5);
    expect(perQuestionScore(100, 200, 3)).toBeCloseTo(50 / 3, 6);
  });

  it("문항이 없는 유형은 null 이다", () => {
    expect(perQuestionScore(50, 100, 0)).toBeNull();
  });

  it("총합이 0 이면 0 으로 떨어진다", () => {
    // 0 으로 나누기를 만들면 안 된다.
    expect(share(0, 0)).toBe(0);
    expect(perQuestionScore(0, 0, 3)).toBe(0);
  });
});

function weights(mc: number, tf: number): ScoreWeights {
  return {
    version: 1,
    distribution: "equal_by_type",
    typeWeights: { "multiple-choice": mc, "true-false": tf },
  } as ScoreWeights;
}

/** 객관식 평균 80, 참거짓 평균 60 인 고정 입력 */
function score(w: ScoreWeights) {
  return calculateWeightedOverallScore({
    questions: [
      { idx: 0, type: "multiple-choice" },
      { idx: 1, type: "multiple-choice" },
      { idx: 2, type: "true-false" },
    ],
    objectiveScores: [
      { qIdx: 0, score: 80 },
      { qIdx: 1, score: 80 },
      { qIdx: 2, score: 60 },
    ],
    caseGrades: [],
    scoreWeights: w,
  });
}

describe("채점 산출값은 이 변경으로 바뀌지 않는다 (실제 함수 호출)", () => {
  it("같은 비율이면 눈금 크기와 무관하게 같은 점수가 나온다", () => {
    // 채점은 원래 정규화하고 있었다. 이 성질이 깨지면 기존 시험 점수가 바뀐다.
    const small = score(weights(60, 40));
    const large = score(weights(600, 400));

    expect(small.overallScore).toBe(large.overallScore);
    expect(small.overallScore).toBe(72); // 80*0.6 + 60*0.4
  });

  it("모든 유형을 같은 값으로 올리면 균등 가중이 된다", () => {
    // 100/100 은 60/40 과 다른 결과여야 한다 — 눈금을 올린 게 아니라 비중을 바꾼 것이다.
    expect(score(weights(100, 100)).overallScore).toBe(70); // 80*0.5 + 60*0.5
  });

  it("정규화 분모가 슬라이더 눈금 총합이다", () => {
    expect(score(weights(60, 40)).totalConfiguredWeight).toBe(100);
    expect(score(weights(600, 400)).totalConfiguredWeight).toBe(1000);
  });
});
