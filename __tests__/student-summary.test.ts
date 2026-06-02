import { describe, expect, it } from "vitest";
import {
  caseStatusLabel,
  dashboardStatus,
  dashboardStatusLabel,
  dashboardStatusSortRank,
  overallScoreLabel,
  type ExamStudentSummary,
} from "@/lib/types/student-summary";

function student(overrides: Partial<ExamStudentSummary> = {}): ExamStudentSummary {
  return {
    sessionId: "session-1",
    studentId: "student-1",
    name: "Test Student",
    status: "submitted",
    mcq: { correct: 0, total: 0 },
    ox: { correct: 0, total: 0 },
    caseProgress: { submitted: 1, graded: 0, total: 1 },
    overallStatus: "pending",
    ...overrides,
  };
}

describe("student summary display helpers", () => {
  it("shows narrative submission state without grade progress", () => {
    expect(
      caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 1 }),
    ).toBe("제출됨");
    expect(
      caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 2 }),
    ).toBe("일부 제출 1/2");
    expect(
      caseStatusLabel("submitted", { submitted: 0, graded: 0, total: 1 }),
    ).toBe("미제출");
    expect(
      caseStatusLabel("in-progress", { submitted: 1, graded: 0, total: 1 }),
    ).toBe("—");
  });

  it("prefers final scores over proposed scores", () => {
    expect(overallScoreLabel(student({ overallScore: 82 }))).toBe("82점");
    expect(overallScoreLabel(student({ proposedOverallScore: 82 }))).toBe(
      "가채점 82점",
    );
    expect(
      overallScoreLabel(student({ overallScore: 82, proposedOverallScore: 40 })),
    ).toBe("82점");
    expect(overallScoreLabel(student())).toBe("—");
  });

  it("uses final grade evidence before stale bulk failures", () => {
    expect(
      dashboardStatusLabel(
        dashboardStatus(
          student({
            overallStatus: "manually_graded",
            bulkGradeStatus: "failed",
          }),
        ),
      ),
    ).toBe("채점완료");
    expect(
      dashboardStatusLabel(
        dashboardStatus(
          student({
            overallStatus: "pending",
            bulkGradeStatus: "proposed_ready",
            proposedOverallScore: 82,
          }),
        ),
      ),
    ).toBe("가채점완료");
    expect(
      dashboardStatusLabel(
        dashboardStatus(
          student({
            overallStatus: "pending",
            bulkGradeStatus: "grading",
          }),
        ),
      ),
    ).toBe("채점중");
  });

  it("does not treat committed bulk state alone as final grading evidence", () => {
    expect(
      dashboardStatusLabel(
        dashboardStatus(
          student({
            overallStatus: "pending",
            bulkGradeStatus: "committed",
          }),
        ),
      ),
    ).toBe("채점대기");

    expect(
      dashboardStatusLabel(
        dashboardStatus(
          student({
            overallStatus: "pending",
            overallScore: 82,
            bulkGradeStatus: "committed",
          }),
        ),
      ),
    ).toBe("채점완료");
  });

  it("sorts by the same unified status used by the dashboard badge", () => {
    expect(dashboardStatusSortRank("in-progress")).toBeLessThan(
      dashboardStatusSortRank("pending"),
    );
    expect(dashboardStatusSortRank("grading")).toBeLessThan(
      dashboardStatusSortRank("proposed-ready"),
    );
    expect(dashboardStatusSortRank("proposed-ready")).toBeLessThan(
      dashboardStatusSortRank("graded"),
    );
  });
});
