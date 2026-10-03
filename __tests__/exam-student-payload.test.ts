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

/**
 * 학생 공개 자료 (#544). 교수자가 공개를 켠 파일만, 인증된 학생 입장 경로에서만 내려간다.
 * materials(업로드 전체 목록)와 materials_text(추출 전문)는 어느 경로에서든 계속 비운다.
 */
describe("sanitizeExamForStudent: 학생 공개 자료", () => {
  const XLSX = "https://example.test/storage/instructor-1/2026-10-03_data.xlsx";
  const PDF = "https://example.test/storage/instructor-1/2026-10-03_slides.pdf";
  const CSV = "https://example.test/storage/instructor-1/2026-10-03_extra.csv";
  const examWith = (student_materials: unknown) => ({
    ...baseExam(),
    materials: [XLSX, PDF, CSV],
    materials_text: [{ url: PDF, text: "강의 자료 전문", fileName: "slides.pdf" }],
    student_materials,
  });

  it("공개 0개: student_materials 는 빈 배열이고 어떤 자료 URL 도 없다", () => {
    const out = sanitizeExamForStudent(examWith([]), { includeStudentMaterials: true });
    expect(out.student_materials).toEqual([]);
    expect(out.materials).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("example.test/storage");
  });

  it("일부 공개: 공개한 파일만 { url, fileName, extension } 으로 남고 비공개 파일 URL 은 없다", () => {
    const out = sanitizeExamForStudent(examWith([XLSX]), { includeStudentMaterials: true });
    expect(out.student_materials).toEqual([{ url: XLSX, fileName: "2026-10-03_data.xlsx", extension: "xlsx" }]);
    expect(out.materials).toEqual([]);
    expect(out.materials_text).toEqual([]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(PDF);
    expect(json).not.toContain(CSV);
    expect(json).not.toContain("강의 자료 전문");
  });

  it("전체 공개: 모든 파일이 materials 순서로 남는다", () => {
    const out = sanitizeExamForStudent(examWith([CSV, XLSX, PDF]), { includeStudentMaterials: true });
    expect((out.student_materials as Array<{ url: string }>).map((m) => m.url)).toEqual([XLSX, PDF, CSV]);
    expect(out.materials).toEqual([]);
    expect(out.materials_text).toEqual([]);
  });

  it("materials 에 없는 값은 student_materials 에 있어도 나가지 않는다 (불변식이 깨진 행)", () => {
    const stale = "https://example.test/storage/instructor-1/deleted.xlsx";
    const out = sanitizeExamForStudent(examWith([stale, XLSX]), { includeStudentMaterials: true });
    expect((out.student_materials as Array<{ url: string }>).map((m) => m.url)).toEqual([XLSX]);
    expect(JSON.stringify(out)).not.toContain("deleted.xlsx");
  });

  it("플래그 없이 부르면(공개 get_exam 등) 공개한 파일도 내려가지 않는다", () => {
    const out = sanitizeExamForStudent(examWith([XLSX, PDF, CSV]));
    expect(out.student_materials).toEqual([]);
    expect(out.materials).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("example.test/storage");
  });

  it("materials 를 select 하지 않은 행은 아무것도 공개하지 않는다 (교집합이 비어 실패 쪽으로 닫힌다)", () => {
    const { materials: _omit, ...withoutMaterials } = examWith([XLSX]);
    const out = sanitizeExamForStudent(withoutMaterials, { includeStudentMaterials: true });
    expect(out.student_materials).toEqual([]);
  });

  it("student_materials 키가 없으면 새로 만들지 않는다", () => {
    const out = sanitizeExamForStudent(baseExam(), { includeStudentMaterials: true });
    expect(out).not.toHaveProperty("student_materials");
  });

  it("입력 객체를 바꾸지 않는다", () => {
    const input = examWith([XLSX]);
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeExamForStudent(input, { includeStudentMaterials: true });
    expect(input).toEqual(snapshot);
  });
});
