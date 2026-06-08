/**
 * Deterministic, seeded permutations — used to shuffle MCQ option order and
 * question display order at exam time. Pure functions, no persistence.
 *
 * The same `(seed, length)` pair always yields the identical array, so a
 * student sees the same option order on every render / reload / device.
 */

import { isObjectiveQuestion } from "./grading-helpers";

/** FNV-1a 32-bit string hash. Pure, deterministic. */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a deterministic permutation of `[0 .. length-1]` seeded from `seed`.
 *
 * Implementation: FNV-1a hash → mulberry32 PRNG → Fisher-Yates shuffle.
 * Same `(seed, length)` ⇒ identical array on every call.
 */
export function seededOptionOrder(seed: string, length: number): number[] {
  const order = Array.from({ length: Math.max(0, length) }, (_, i) => i);
  if (order.length < 2) return order;

  const rand = mulberry32(fnv1aHash(seed));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * 시험 문항의 표시 순서(표시위치 → 원본 인덱스) 매핑을 반환한다.
 *
 * - 객관식(MCQ/OX)만 `seed`로 결정론적 통합 셔플한다.
 * - CASE(비객관식 전부)는 원래 출제 순서를 유지해 항상 맨 뒤에 배치한다.
 *
 * 반환 배열은 항상 `[0 .. questions.length-1]`의 순열이며,
 * `displayOrder[표시위치] = 원본 인덱스(q_idx)`. 원본 배열·q_idx는 건드리지 않으므로
 * 정답/채점 매핑은 그대로 유지된다(표시 전용). 같은 `seed`면 항상 동일 결과.
 */
export function examQuestionDisplayOrder(
  seed: string,
  questions: { type: string }[],
): number[] {
  const objective: number[] = [];
  const cases: number[] = [];
  questions.forEach((q, i) => {
    if (isObjectiveQuestion(q.type)) objective.push(i);
    else cases.push(i);
  });
  const perm = seededOptionOrder(seed, objective.length);
  return [...perm.map((p) => objective[p]), ...cases];
}
