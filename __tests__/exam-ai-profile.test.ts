/**
 * 시험 AI 역할 해석 (이슈 #519)
 *
 * 규칙: 문항의 `ai_role` 이 정확히 "analysis_partner" 일 때만 분석 파트너다. 그 밖의 모든 것
 * (키 없음, 알 수 없는 문자열, 깨진 값, 객체가 아닌 문항, 범위 밖 qIdx)은 사례형 출제자(현행)다.
 * 영어 시험에서는 분석 파트너가 사례형으로 폴백한다 (v1 은 한국어만).
 *
 * 이 함수는 순수하다. 학생 메시지, 시각, 난수를 읽지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  AI_ROLES,
  resolveExamAiProfile,
  type ResolvedExamAiProfile,
} from "@/lib/exam-ai-profile";
import {
  CURRENT_ANALYSIS_PARTNER_SPEC_ID,
  CURRENT_STUDENT_CHAT_SPEC_ID,
} from "@/lib/student-chat-spec";

const CASE: Pick<ResolvedExamAiProfile, "role" | "specId"> = {
  role: "case_author",
  specId: "case@1",
};
const PARTNER: Pick<ResolvedExamAiProfile, "role" | "specId"> = {
  role: "analysis_partner",
  specId: "analysis-partner@1",
};

const resolve = (questions: unknown, qIdx: number, language?: string | null) =>
  resolveExamAiProfile({ exam: { questions, language }, qIdx });

describe("resolveExamAiProfile — 분석 파트너가 되는 유일한 경우", () => {
  it("해당 문항의 ai_role 이 analysis_partner 이고 시험 언어가 ko 이면 분석 파트너다", () => {
    expect(resolve([{ id: "q1", ai_role: "analysis_partner" }], 0, "ko")).toEqual(PARTNER);
  });

  it("시험 언어가 비어 있어도(없음, null) 한국어로 본다 — 빌더와 같은 규칙(en 이 아니면 ko)", () => {
    expect(resolve([{ ai_role: "analysis_partner" }], 0, undefined)).toEqual(PARTNER);
    expect(resolve([{ ai_role: "analysis_partner" }], 0, null)).toEqual(PARTNER);
  });

  it("문항별로 해석한다 — 같은 시험의 다른 문항은 사례형이다", () => {
    const questions = [{ id: "q1" }, { id: "q2", ai_role: "analysis_partner" }, { id: "q3" }];
    expect(resolve(questions, 0, "ko")).toEqual(CASE);
    expect(resolve(questions, 1, "ko")).toEqual(PARTNER);
    expect(resolve(questions, 2, "ko")).toEqual(CASE);
  });
});

describe("resolveExamAiProfile — 그 밖의 모든 것은 사례형 출제자 (P2)", () => {
  it("ai_role 키가 없으면 사례형이다", () => {
    expect(resolve([{ id: "q1", text: "문항" }], 0, "ko")).toEqual(CASE);
  });

  it.each([
    ["대소문자가 다른 값", "Analysis_Partner"],
    ["앞뒤 공백이 붙은 값", " analysis_partner "],
    ["하이픈으로 쓴 값", "analysis-partner"],
    ["다른 역할 이름", "assignment_tutor"],
    ["사례형을 명시한 값", "case_author"],
    ["빈 문자열", ""],
    ["알 수 없는 문자열", "something_else"],
  ])("ai_role 이 %s 이면 사례형이다", (_label, value) => {
    expect(resolve([{ ai_role: value }], 0, "ko")).toEqual(CASE);
  });

  it.each([
    ["null", null],
    ["숫자", 1],
    ["불리언", true],
    ["객체", { role: "analysis_partner" }],
    ["배열", ["analysis_partner"]],
  ])("ai_role 이 문자열이 아니라 %s 이면 사례형이다", (_label, value) => {
    expect(resolve([{ ai_role: value }], 0, "ko")).toEqual(CASE);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["깨진 JSON 문자열", '[{"ai_role":"analysis_partner"'],
    ["파싱 가능한 JSON 이지만 문자열인 값(파싱하지 않는다)", '[{"ai_role":"analysis_partner"}]'],
    ["빈 객체", {}],
    ["숫자", 5],
    ["문항 객체 하나(배열이 아님)", { ai_role: "analysis_partner" }],
  ])("questions 가 %s 이면 사례형이다", (_label, questions) => {
    expect(resolve(questions, 0, "ko")).toEqual(CASE);
  });

  it.each([
    ["null", null],
    ["문자열", "analysis_partner"],
    ["숫자", 3],
    ["배열", [{ ai_role: "analysis_partner" }]],
    ["undefined", undefined],
  ])("해당 문항이 객체가 아니라 %s 이면 사례형이다", (_label, question) => {
    expect(resolve([question], 0, "ko")).toEqual(CASE);
  });

  it.each([
    ["범위 밖(길이와 같음)", 1],
    ["범위 밖(큼)", 99],
    ["음수", -1],
    ["NaN", Number.NaN],
    ["정수가 아님", 0.5],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("qIdx 가 %s 이면 사례형이다 (다른 문항의 설정을 끌어다 쓰지 않는다)", (_label, qIdx) => {
    expect(resolve([{ ai_role: "analysis_partner" }], qIdx, "ko")).toEqual(CASE);
  });

  it("문항이 빈 배열이면 사례형이다", () => {
    expect(resolve([], 0, "ko")).toEqual(CASE);
  });

  it("입력이 통째로 비어도 던지지 않고 사례형이다", () => {
    expect(resolveExamAiProfile({ exam: {}, qIdx: 0 })).toEqual(CASE);
    expect(resolveExamAiProfile({ exam: undefined as never, qIdx: 0 })).toEqual(CASE);
    expect(resolveExamAiProfile(undefined as never)).toEqual(CASE);
  });
});

describe("resolveExamAiProfile — 영어 시험은 사례형으로 폴백한다 (v1 은 한국어만)", () => {
  // 영어 본문은 이번 범위 밖이다(이슈 #519 비범위). 영어 시험 학생에게 한국어 지시문이 가면
  // 안 되므로 분석 파트너를 고른 영어 시험도 사례형 영어 지시문(현행)으로 동작한다.
  it("language 가 en 이면 ai_role 이 analysis_partner 여도 사례형이다", () => {
    expect(resolve([{ ai_role: "analysis_partner" }], 0, "en")).toEqual(CASE);
  });

  it("폴백은 en 일 때만이다 — ko 는 분석 파트너다", () => {
    expect(resolve([{ ai_role: "analysis_partner" }], 0, "ko")).toEqual(PARTNER);
  });
});

describe("resolveExamAiProfile — 형태와 성질", () => {
  it("역할 목록은 두 가지다", () => {
    expect([...AI_ROLES]).toEqual(["case_author", "analysis_partner"]);
  });

  it("effective spec id 는 레지스트리의 현재 포인터와 같다 (두 곳에서 따로 정하지 않는다)", () => {
    expect(resolve([{}], 0, "ko").specId).toBe(CURRENT_STUDENT_CHAT_SPEC_ID);
    expect(resolve([{ ai_role: "analysis_partner" }], 0, "ko").specId).toBe(
      CURRENT_ANALYSIS_PARTNER_SPEC_ID
    );
  });

  it("입력을 바꾸지 않고, 같은 입력은 항상 같은 결과다", () => {
    const questions = Object.freeze([Object.freeze({ id: "q1", ai_role: "analysis_partner" })]);
    const first = resolve(questions, 0, "ko");
    const second = resolve(questions, 0, "ko");
    expect(second).toEqual(first);
    expect(questions).toEqual([{ id: "q1", ai_role: "analysis_partner" }]);
  });

  it("결과 객체는 불변이다", () => {
    const profile = resolve([{ ai_role: "analysis_partner" }], 0, "ko");
    expect(Object.isFrozen(profile)).toBe(true);
  });
});
