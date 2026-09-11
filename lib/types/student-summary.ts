/** Per-student progress on the instructor exam dashboard. */

export type ExamStudentSessionStatus = "not-started" | "in-progress" | "submitted";

export type ExamStudentOverallStatus =
  | "not-started"
  | "in-progress"
  | "pending"
  | "grading"
  | "ai_graded"
  | "manually_graded"
  | "failed";

export interface QuestionCountPair {
  correct: number;
  total: number;
}

export interface CaseProgress {
  submitted: number;
  graded: number;
  total: number;
}

export type BulkGradeStatus =
  | "none"
  | "grading"
  | "proposed_ready"
  | "failed"
  | "committed";

export interface ExamStudentSummary {
  sessionId: string;
  studentId: string;
  name: string;
  studentNumber?: string;
  school?: string;
  /**
   * 모르면 `null` 이다. 날조하지 않는다 — 예전에는 `<uuid>@example.com` 을
   * 만들어 넣어서 교수자가 그걸 실제 주소로 읽었다(RFC 2606 예약 도메인이라
   * 전송도 안 된다). 없는 값은 없다고 말한다.
   */
  email?: string | null;
  status: ExamStudentSessionStatus;
  submittedAt?: string;
  mcq: QuestionCountPair;
  ox: QuestionCountPair;
  caseProgress: CaseProgress;
  overallStatus: ExamStudentOverallStatus;
  /** AI 가채점 또는 수동 채점된 Case 문제들의 평균 점수 (0-100). 채점 전이면 undefined. */
  caseScore?: number;
  /** MCQ/OX/Case 전체 채점된 문제의 단순 평균 점수 (0-100). 채점 전이면 undefined. */
  overallScore?: number;
  /** 확정 저장 전 CASE 일괄 가채점 기준의 표시 전용 총점. */
  proposedOverallScore?: number;
  bulkGradeStatus?: BulkGradeStatus;
}

export type ExamStudentSummarySortOption =
  | "name"
  | "studentNumber"
  | "submittedAt"
  | "overallStatus";

export type ExamStudentDashboardStatus =
  | "not-started"
  | "in-progress"
  | "pending"
  | "grading"
  | "proposed-ready"
  | "graded"
  | "failed";

function formatScoreNumber(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return score.toFixed(1).replace(/\.0$/, "");
}

/** 채점 현황 카드/행의 "총점" 칸에 표시할 점수 텍스트. */
export function overallScoreLabel(
  student: Pick<ExamStudentSummary, "overallScore" | "proposedOverallScore">,
): string {
  if (student.overallScore != null) {
    return `${formatScoreNumber(student.overallScore)}점`;
  }
  if (student.proposedOverallScore != null) {
    return `가채점 ${formatScoreNumber(student.proposedOverallScore)}점`;
  }
  return "—";
}

/** 제출/채점/가채점 상태를 학생 목록용 단일 상태로 정리한다. */
export function dashboardStatus(
  student: Pick<
    ExamStudentSummary,
    | "status"
    | "overallStatus"
    | "overallScore"
    | "bulkGradeStatus"
    | "proposedOverallScore"
  >,
): ExamStudentDashboardStatus {
  if (student.status === "in-progress") return "in-progress";
  if (student.status !== "submitted") return "not-started";

  if (
    student.overallStatus === "manually_graded" ||
    student.overallStatus === "ai_graded" ||
    student.overallScore != null
  ) {
    return "graded";
  }

  if (
    student.overallStatus === "failed" ||
    student.bulkGradeStatus === "failed"
  ) {
    return "failed";
  }

  if (
    student.bulkGradeStatus === "proposed_ready" ||
    student.proposedOverallScore != null
  ) {
    return "proposed-ready";
  }

  if (
    student.overallStatus === "grading" ||
    student.bulkGradeStatus === "grading"
  ) {
    return "grading";
  }

  return "pending";
}

export function dashboardStatusLabel(status: ExamStudentDashboardStatus): string {
  switch (status) {
    case "in-progress":
      return "응시중";
    case "pending":
      return "채점대기";
    case "grading":
      return "채점중";
    case "proposed-ready":
      return "가채점완료";
    case "graded":
      return "채점완료";
    case "failed":
      return "채점실패";
    default:
      return "미시작";
  }
}

const DASHBOARD_STATUS_SORT_RANK: Record<ExamStudentDashboardStatus, number> = {
  "not-started": 0,
  "in-progress": 1,
  pending: 2,
  grading: 3,
  "proposed-ready": 4,
  graded: 5,
  failed: 6,
};

/** 채점 상태순 정렬에서 화면에 보이는 통합 배지와 같은 상태 기준을 사용한다. */
export function dashboardStatusSortRank(status: ExamStudentDashboardStatus): number {
  return DASHBOARD_STATUS_SORT_RANK[status];
}

/** 채점 현황 카드/행의 "서술" 칸에 표시할 상태 텍스트. */
export function caseStatusLabel(
  status: ExamStudentSessionStatus,
  caseProgress: CaseProgress,
): string {
  if (status !== "submitted" || caseProgress.total === 0) return "—";
  if (caseProgress.submitted === 0) return "미제출";
  if (caseProgress.submitted < caseProgress.total) {
    return `일부 제출 ${caseProgress.submitted}/${caseProgress.total}`;
  }
  return "제출됨";
}
