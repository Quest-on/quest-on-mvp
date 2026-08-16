import { describe, expect, it } from "vitest";
import { calculateWeightedOverallScore, type ScoreWeights } from "@/lib/grade-utils";
import { perQuestionScore, scoreShare } from "@/lib/score-weight-display";

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

    expect(bucketA).toBeCloseTo(scoreShare(wA, total) * 100, 6);
    expect(bucketB).toBeCloseTo(scoreShare(wB, total) * 100, 6);

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
    expect(scoreShare(100, 200)).toBe(0.5);
    expect(perQuestionScore(100, 200, 3)).toBeCloseTo(50 / 3, 6);
  });

  it("문항이 없는 유형은 null 이다", () => {
    expect(perQuestionScore(50, 100, 0)).toBeNull();
  });

  it("총합이 0 이면 0 으로 떨어진다", () => {
    // 0 으로 나누기를 만들면 안 된다.
    expect(scoreShare(0, 0)).toBe(0);
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

describe("반올림 한계를 인지하고 있다", () => {
  const fmt = (v: number) =>
    Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");

  it("균등 3유형은 표시 합이 99.9% 가 된다", () => {
    // 1/3 을 소수 1자리로 세 번 반올림하면 100 이 안 된다. 화면 문구가
    // '약 N%' 인 이유다. 채점에는 영향이 없다 - 표시만의 문제다.
    const shown = [1, 1, 1].map((w) => Number(fmt(scoreShare(w, 3) * 100)));
    expect(shown).toEqual([33.3, 33.3, 33.3]);
    expect(shown.reduce((a, b) => a + b, 0)).toBeCloseTo(99.9, 6);
  });

  it("문항당 점수 x 문항 수가 표시된 share 와 어긋날 수 있다", () => {
    // 레드팀이 찾은 케이스: weights 1/1/6, 첫 유형 10문항.
    // 정확한 값은 일치하지만 각각 반올림하면 0.5 차이가 보인다.
    const exactShare = scoreShare(1, 8) * 100;
    const exactPer = perQuestionScore(1, 8, 10)!;
    expect(exactPer * 10).toBeCloseTo(exactShare, 10);

    // 표시 단계에서만 갈린다.
    expect(Number(fmt(exactShare))).toBe(12.5);
    expect(Number(fmt(exactPer)) * 10).toBeCloseTo(13, 6);
  });
});
