import { describe, expect, it } from "vitest";
import {
  computeStudentQuestionResults,
  type OrderedQuestion,
} from "@/lib/exam-export";
import { fetchAllPaged } from "@/lib/supabase-paged";

/**
 * 회귀: 엑셀/CSV export가 객관식 답안을 q.idx로 조회해, idx≠배열위치(결번) 시험에서
 * 해당 문항이 전체 빈칸 + 0점으로 나왔다. (BIFJ0Z 실증) 답안은 배열 위치(pos)로
 * 저장되므로 pos로 조회해야 한다.
 */
describe("computeStudentQuestionResults — q_idx 결번 회귀", () => {
  it("idx≠위치(결번) 객관식 문항도 배열 위치(pos)로 답안을 찾는다", () => {
    // 표시 순서는 qIdx(=idx) 기준이지만 답안은 pos로 저장됨. 마지막 문항이 pos=2, idx=20(결번).
    const orderedQuestions: OrderedQuestion[] = [
      { type: "multiple-choice", options: ["a", "b", "c", "d"], correctOptionIndex: 0, qIdx: 0, pos: 0 },
      { type: "multiple-choice", options: ["a", "b", "c", "d"], correctOptionIndex: 1, qIdx: 5, pos: 1 },
      { type: "multiple-choice", options: ["a", "b", "c", "d"], correctOptionIndex: 2, qIdx: 20, pos: 2 },
    ];
    const subsByPos = new Map<number, { answer: string }>([
      [0, { answer: "0" }], // 정답
      [1, { answer: "3" }], // 오답
      [2, { answer: "2" }], // 정답 (idx=20인데 답안은 pos=2로 저장)
    ]);

    const r = computeStudentQuestionResults(orderedQuestions, subsByPos, new Map(), true);

    expect(r.selectedOptions).toEqual([0, 3, 2]); // 버그 시절 pos=2 문항은 null
    expect(r.answered).toEqual([true, true, true]);
    expect(r.scores).toEqual([100, 0, 100]); // 버그 시절 마지막 문항 0/undefined
  });

  it("미응답 객관식은 빈칸(null)/미응답으로 둔다", () => {
    const orderedQuestions: OrderedQuestion[] = [
      { type: "multiple-choice", options: ["a", "b"], correctOptionIndex: 0, qIdx: 0, pos: 0 },
    ];
    const r = computeStudentQuestionResults(
      orderedQuestions,
      new Map<number, { answer?: string | null }>(),
      new Map(),
      true,
    );
    expect(r.selectedOptions).toEqual([null]);
    expect(r.answered).toEqual([false]);
    // 미응답 객관식은 빈 답안 → 오답 0점 처리(기존 동작). 셀 표시는 selectedOptions=null이라 빈칸.
    expect(r.scores).toEqual([0]);
  });

  it("서술형 점수는 qIdx(=idx ?? pos)로 grades에서 조회한다", () => {
    const orderedQuestions: OrderedQuestion[] = [
      { type: "essay", qIdx: 22, pos: 3 }, // idx 결번: qIdx=22, pos=3
    ];
    const subsByPos = new Map<number, { answer: string }>([[3, { answer: "서술 답안" }]]);
    const scoreByQuestion = new Map<number, number>([[22, 85]]); // grades는 qIdx 키

    const r = computeStudentQuestionResults(orderedQuestions, subsByPos, scoreByQuestion, true);

    expect(r.selectedOptions).toEqual([null]); // 객관식 아님
    expect(r.answered).toEqual([true]);
    expect(r.scores).toEqual([85]);
  });

  it("미제출(hasSubmitted=false)이면 점수는 전부 undefined", () => {
    const orderedQuestions: OrderedQuestion[] = [
      { type: "multiple-choice", options: ["a", "b"], correctOptionIndex: 0, qIdx: 0, pos: 0 },
    ];
    const r = computeStudentQuestionResults(
      orderedQuestions,
      new Map([[0, { answer: "0" }]]),
      new Map(),
      false,
    );
    expect(r.scores).toEqual([undefined]);
  });
});

/**
 * 회귀: export가 submissions/grades를 .in(전체 세션) 한 번에 조회해 Supabase 1000행
 * 제한에 걸려 답안이 누락됐다. (강서연 19문항 응답인데 export 빈칸) → 페이지네이션 필요.
 */
describe("fetchAllPaged — 1000행 절단 방지", () => {
  it("1000행 경계를 넘겨 전량을 이어 붙인다", async () => {
    const TOTAL = 1500;
    const all = Array.from({ length: TOTAL }, (_, i) => ({ id: i }));
    let calls = 0;
    const result = await fetchAllPaged(async (from, to) => {
      calls++;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(result.error).toBeNull();
    expect(result.data.length).toBe(TOTAL);
    expect(calls).toBe(2); // 0~999(1000개) → 1000~1999(500개, <1000이라 종료)
  });

  it("정확히 1000행이면 다음 페이지에서 0행 확인 후 종료", async () => {
    const all = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    let calls = 0;
    const result = await fetchAllPaged(async (from, to) => {
      calls++;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(result.data.length).toBe(1000);
    expect(calls).toBe(2);
  });

  it("error 발생 시 즉시 반환하고 data는 비운다", async () => {
    const result = await fetchAllPaged(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    expect(result.error).toEqual({ message: "boom" });
    expect(result.data).toEqual([]);
  });
});
