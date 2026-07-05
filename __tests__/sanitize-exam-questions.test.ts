/**
 * 시험 문항 민감 필드 스트립 회귀 가드
 *
 * 버그: /api/supa 의 get_exam(공개 액션)과 init_exam_session 이 questions 배열을
 * 그대로 내려주어, 시험 코드만 알면(또는 응시 중인 학생이) 객관식/OX 정답
 * (correctOptionIndex)과 강사 전용 채점 컨텍스트(ai_context)를 확보할 수 있었다.
 * 이 테스트는 stripSensitiveQuestionFields 가 정답키·ai_context·core_ability 를
 * 제거하되, 학생이 문항을 렌더/응답하는 데 필요한 나머지 필드는 보존함을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { stripSensitiveQuestionFields } from "@/lib/sanitize-exam-questions";

describe("stripSensitiveQuestionFields", () => {
  it("correctOptionIndex, ai_context, core_ability 를 제거한다", () => {
    const input = [
      {
        id: "q1",
        text: "2 + 2 = ?",
        type: "multiple-choice",
        options: ["3", "4", "5"],
        correctOptionIndex: 1,
        ai_context: "정답은 4. 계산 실수 여부를 본다.",
        core_ability: "numeracy",
      },
    ];

    const out = stripSensitiveQuestionFields(input) as Array<Record<string, unknown>>;

    expect(out[0]).not.toHaveProperty("correctOptionIndex");
    expect(out[0]).not.toHaveProperty("ai_context");
    expect(out[0]).not.toHaveProperty("core_ability");
  });

  it("학생 렌더에 필요한 필드는 보존한다", () => {
    const input = [
      {
        id: "q1",
        text: "문항 텍스트",
        type: "multiple-choice",
        options: ["a", "b"],
        points: 10,
        idx: 0,
        prompt: "프롬프트",
        title: "제목",
        rubric: [{ evaluationArea: "정확성", detailedCriteria: "..." }],
        correctOptionIndex: 0,
      },
    ];

    const out = stripSensitiveQuestionFields(input) as Array<Record<string, unknown>>;

    expect(out[0]).toMatchObject({
      id: "q1",
      text: "문항 텍스트",
      type: "multiple-choice",
      options: ["a", "b"],
      points: 10,
      idx: 0,
      prompt: "프롬프트",
      title: "제목",
    });
    expect(out[0].rubric).toEqual([
      { evaluationArea: "정확성", detailedCriteria: "..." },
    ]);
  });

  it("true-false(OX) 정답키도 제거한다", () => {
    const input = [
      { id: "q1", text: "지구는 둥글다", type: "true-false", correctOptionIndex: 0 },
    ];
    const out = stripSensitiveQuestionFields(input) as Array<Record<string, unknown>>;
    expect(out[0]).not.toHaveProperty("correctOptionIndex");
    expect(out[0].type).toBe("true-false");
  });

  it("입력 배열을 변형(mutate)하지 않는다", () => {
    const input = [{ id: "q1", correctOptionIndex: 2 }];
    stripSensitiveQuestionFields(input);
    expect(input[0]).toHaveProperty("correctOptionIndex", 2);
  });

  it("배열이 아니면 그대로 반환한다", () => {
    expect(stripSensitiveQuestionFields(null)).toBeNull();
    expect(stripSensitiveQuestionFields(undefined)).toBeUndefined();
    const obj = { not: "array" };
    expect(stripSensitiveQuestionFields(obj)).toBe(obj);
  });

  it("배열 내 null/원시값 요소는 건드리지 않는다", () => {
    const input = [null, "str", 42, { id: "q1", ai_context: "x" }];
    const out = stripSensitiveQuestionFields(input) as unknown[];
    expect(out[0]).toBeNull();
    expect(out[1]).toBe("str");
    expect(out[2]).toBe(42);
    expect(out[3]).not.toHaveProperty("ai_context");
  });
});
