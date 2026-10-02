/**
 * 학생과 비로그인 호출자에게 내려가는 exam 객체의 교수 전용 필드 회귀 가드 (#506)
 *
 * 버그: init_exam_session 은 exams 행의 materials(자료 파일 주소), materials_text(추출 전문),
 * 최상위 rubric 을 비공개 설정과 무관하게 그대로 내려줬고, 공개 액션 get_exam 은 시험 코드만
 * 알면 materials 를 내려줬다. questions[].rubric 만 걸러지고 있었다.
 * 이 테스트는 sanitizeExamForStudent 가 위 필드를 막고, 학생이 응시하는 데 필요한 나머지는
 * 그대로 두며, 입력을 바꾸지 않음을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { sanitizeExamForStudent } from "@/lib/sanitize-exam-questions";

const baseExam = () => ({
  id: "exam-1",
  title: "데이터 분석 시험",
  code: "ABC123",
  duration: 150,
  status: "running",
  rubric_public: false,
  rubric: [{ evaluationArea: "1A 목적과 변수선택", detailedCriteria: "목적을 설명했는가" }],
  materials: ["https://example.test/storage/instructor-1/a.pdf"],
  materials_text: [{ url: "https://example.test/storage/instructor-1/a.pdf", text: "강의 자료 전문", fileName: "a.pdf" }],
  questions: [
    {
      id: "q1",
      text: "문항",
      type: "essay",
      correctOptionIndex: 1,
      ai_context: "교수 전용 채점 맥락",
      rubric: [{ evaluationArea: "문항 루브릭", detailedCriteria: "x" }],
    },
  ],
});

describe("sanitizeExamForStudent", () => {
  it("자료 전문을 제거하고 자료 파일 주소는 빈 배열로 바꾼다", () => {
    const out = sanitizeExamForStudent(baseExam());
    expect(out.materials).toEqual([]);
    expect(out.materials_text).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("강의 자료 전문");
    expect(JSON.stringify(out)).not.toContain("a.pdf");
  });

  it("rubric_public 이 true 가 아니면 최상위 rubric 을 null 로 만든다", () => {
    for (const rubric_public of [false, null, undefined]) {
      const out = sanitizeExamForStudent({ ...baseExam(), rubric_public });
      expect(out.rubric).toBeNull();
    }
  });

  it("rubric_public 이 true 이면 최상위 rubric 과 문항 rubric 을 남긴다", () => {
    const out = sanitizeExamForStudent({ ...baseExam(), rubric_public: true });
    expect(out.rubric).toEqual(baseExam().rubric);
    const q = (out.questions as Array<Record<string, unknown>>)[0];
    expect(q.rubric).toBeDefined();
  });

  it("문항의 정답키와 채점 컨텍스트는 항상 제거한다", () => {
    const out = sanitizeExamForStudent({ ...baseExam(), rubric_public: true });
    const q = (out.questions as Array<Record<string, unknown>>)[0];
    expect(q).not.toHaveProperty("correctOptionIndex");
    expect(q).not.toHaveProperty("ai_context");
  });

  it("rubric_public 이 아니면 문항 rubric 도 제거한다", () => {
    const out = sanitizeExamForStudent(baseExam());
    const q = (out.questions as Array<Record<string, unknown>>)[0];
    expect(q).not.toHaveProperty("rubric");
  });

  it("응시에 필요한 나머지 필드는 그대로 둔다", () => {
    const out = sanitizeExamForStudent(baseExam());
    expect(out).toMatchObject({
      id: "exam-1",
      title: "데이터 분석 시험",
      code: "ABC123",
      duration: 150,
      status: "running",
    });
  });

  it("입력 객체를 바꾸지 않는다", () => {
    const input = baseExam();
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeExamForStudent(input);
    expect(input).toEqual(snapshot);
  });

  it("없는 필드를 새로 만들지 않는다 (get_exam 은 materials_text 를 select 하지 않는다)", () => {
    const { materials_text: _omit, ...withoutText } = baseExam();
    const out = sanitizeExamForStudent(withoutText);
    expect(out).not.toHaveProperty("materials_text");
    expect(out.materials).toEqual([]);
  });

  it("questions 가 배열이 아니어도 깨지지 않는다", () => {
    const out = sanitizeExamForStudent({ ...baseExam(), questions: null });
    expect(out.questions).toBeNull();
  });
});
