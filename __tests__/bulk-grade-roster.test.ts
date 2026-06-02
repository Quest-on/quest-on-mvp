import { describe, it, expect } from "vitest";
import {
  computeMissingBulkGradeStudents,
  type BulkGradeRosterStudent,
} from "@/lib/bulk-grade-roster";

/**
 * 회귀: AI 가채점에서 워커가 실패한 학생은 proposed_grades에 안 써져
 * 패널이 조용히 누락시켰다. 이제 명단(roster) 기준으로 누락 학생을
 * '채점 실패'(processed) / '대기 중'(미processed)으로 surface 해야 한다.
 */
const roster: BulkGradeRosterStudent[] = [
  { sessionId: "s1", name: "김철수", studentNumber: "2024-1", school: "A대" },
  { sessionId: "s2", name: "이영희" },
  { sessionId: "s3", name: "박민수" },
];

describe("computeMissingBulkGradeStudents", () => {
  it("가채점 전(미시작)에는 아무도 누락으로 표시하지 않는다", () => {
    expect(
      computeMissingBulkGradeStudents({
        students: roster,
        reviewGrades: null,
        processedSessionIds: {},
        committed: false,
        gradingAttempted: false,
      }),
    ).toEqual([]);
  });

  it("확정(committed) 후에는 누락 목록을 비운다", () => {
    expect(
      computeMissingBulkGradeStudents({
        students: roster,
        reviewGrades: {},
        processedSessionIds: { s1: true, s2: true, s3: true },
        committed: true,
        gradingAttempted: true,
      }),
    ).toEqual([]);
  });

  it("제안 점수가 없는 학생을 누락으로 surface 한다 (실패 vs 대기 구분)", () => {
    const missing = computeMissingBulkGradeStudents({
      students: roster,
      reviewGrades: { s1: { 0: { score: 80, comment: "" } } }, // s1만 채점됨
      processedSessionIds: { s1: true, s2: true }, // s2는 처리됐으나 점수 없음=실패, s3은 미처리=대기
      committed: false,
      gradingAttempted: true,
    });

    expect(missing.map((m) => m.sessionId)).toEqual(["s2", "s3"]);
    const s2 = missing.find((m) => m.sessionId === "s2")!;
    const s3 = missing.find((m) => m.sessionId === "s3")!;
    expect(s2.failed).toBe(true); // 처리됐지만 점수 없음 → 채점 실패
    expect(s3.failed).toBe(false); // 미처리 → 대기 중
  });

  it("프로필 이름이 없으면 안정적인 Student <prefix> 폴백을 쓴다", () => {
    const missing = computeMissingBulkGradeStudents({
      students: [{ sessionId: "abcdef12-9999", name: null }],
      reviewGrades: {},
      processedSessionIds: {},
      committed: false,
      gradingAttempted: true,
    });
    expect(missing[0].studentName).toBe("Student abcdef12");
  });

  it("메타는 학번·학교·이메일을 · 로 합치고 빈 값은 건너뛴다", () => {
    const missing = computeMissingBulkGradeStudents({
      students: roster,
      reviewGrades: {},
      processedSessionIds: {},
      committed: false,
      gradingAttempted: true,
    });
    expect(missing.find((m) => m.sessionId === "s1")!.studentMeta).toBe("2024-1 · A대");
    expect(missing.find((m) => m.sessionId === "s2")!.studentMeta).toBe("");
  });
});
