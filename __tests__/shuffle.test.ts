import { describe, expect, it } from "vitest";
import { seededOptionOrder, examQuestionDisplayOrder } from "@/lib/shuffle";

/** 테스트용 문항 배열 생성 헬퍼 — 타입만 중요. */
const Q = (...types: string[]) => types.map((type) => ({ type }));

/**
 * Coverage for the seeded MCQ option-order permutation.
 *
 * Contract:
 *  - deterministic: same (seed, length) ⇒ identical array every call
 *  - always a valid permutation of [0 .. length-1]
 *  - different seeds generally yield different orders
 */

describe("seededOptionOrder", () => {
  it("is deterministic — same seed and length produce the same order", () => {
    const a = seededOptionOrder("session-1::question-7", 4);
    const b = seededOptionOrder("session-1::question-7", 4);
    expect(a).toEqual(b);
    // also stable across many repeated calls
    for (let i = 0; i < 50; i++) {
      expect(seededOptionOrder("session-1::question-7", 4)).toEqual(a);
    }
  });

  it("returns a valid permutation for length 4", () => {
    const order = seededOptionOrder("abc", 4);
    expect(order).toHaveLength(4);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
  });

  it("returns a valid permutation for length 2", () => {
    const order = seededOptionOrder("ox-question", 2);
    expect(order).toHaveLength(2);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1]);
  });

  it("produces a valid permutation across many seeds", () => {
    for (let i = 0; i < 200; i++) {
      const order = seededOptionOrder(`seed-${i}`, 4);
      expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    }
  });

  it("different seeds generally produce different orders", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      orders.add(seededOptionOrder(`student-${i}::q1`, 4).join(","));
    }
    // With 24 possible permutations and 100 seeds we expect good spread.
    expect(orders.size).toBeGreaterThan(5);
  });

  it("handles trivial lengths without shuffling", () => {
    expect(seededOptionOrder("anything", 0)).toEqual([]);
    expect(seededOptionOrder("anything", 1)).toEqual([0]);
  });
});

/**
 * Coverage for question display-order shuffle.
 *
 * Contract:
 *  - MCQ/OX(객관식)만 셔플, CASE(비객관식)는 원순서로 항상 맨 뒤
 *  - 항상 [0 .. n-1]의 순열 (원본 q_idx는 보존)
 *  - 같은 seed ⇒ 동일 결과 (학생별 결정론)
 */
describe("examQuestionDisplayOrder", () => {
  it("CASE를 항상 맨 뒤로, 원래 순서 유지한다", () => {
    // 원본: [MCQ0, CASE1, OX2, CASE3, MCQ4]
    const questions = Q(
      "multiple-choice",
      "essay",
      "true-false",
      "case",
      "multiple-choice",
    );
    const order = examQuestionDisplayOrder("seed-x", questions);
    // 뒤쪽 2개는 항상 CASE 원본인덱스 [1, 3] (원순서)
    expect(order.slice(-2)).toEqual([1, 3]);
    // 앞쪽 3개는 객관식 원본인덱스 {0,2,4}의 순열
    expect([...order.slice(0, 3)].sort((a, b) => a - b)).toEqual([0, 2, 4]);
  });

  it("항상 [0..n-1]의 순열을 반환한다", () => {
    const questions = Q(
      "multiple-choice",
      "true-false",
      "essay",
      "multiple-choice",
      "short-answer",
    );
    for (let i = 0; i < 100; i++) {
      const order = examQuestionDisplayOrder(`student-${i}`, questions);
      expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("같은 seed면 동일 결과 (결정론)", () => {
    const questions = Q("multiple-choice", "true-false", "case", "multiple-choice");
    const a = examQuestionDisplayOrder("session-42", questions);
    const b = examQuestionDisplayOrder("session-42", questions);
    expect(a).toEqual(b);
  });

  it("seed가 다르면 객관식 순서가 분산된다", () => {
    const questions = Q(
      "multiple-choice",
      "true-false",
      "multiple-choice",
      "true-false",
    );
    const orders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      orders.add(examQuestionDisplayOrder(`s-${i}`, questions).join(","));
    }
    expect(orders.size).toBeGreaterThan(5);
  });

  it("CASE만 있으면 셔플 없이 원순서", () => {
    const questions = Q("essay", "case", "short-answer");
    expect(examQuestionDisplayOrder("anything", questions)).toEqual([0, 1, 2]);
  });

  it("객관식만 있으면 전부 셔플 대상이고 순열이다", () => {
    const questions = Q("multiple-choice", "multiple-choice", "true-false");
    const order = examQuestionDisplayOrder("seed", questions);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("빈 배열·단일 문항 엣지", () => {
    expect(examQuestionDisplayOrder("seed", [])).toEqual([]);
    expect(examQuestionDisplayOrder("seed", Q("multiple-choice"))).toEqual([0]);
    expect(examQuestionDisplayOrder("seed", Q("essay"))).toEqual([0]);
  });
});
