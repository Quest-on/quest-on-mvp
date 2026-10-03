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

/**
 * 화면 문구의 번역 키와 값. lib 는 로케일을 모른다 — 컴포넌트가
 * `useTranslations("grading")` 의 `t(key, values)` 로 푼다. 예전에는 여기서
 * 한국어 문구를 바로 돌려줘 영어 로케일에서도 "채점중" 이 나왔다 (#494).
 *
 * 빈 칸은 `null` 이다 — 문구가 아니라 표의 빈 칸 표시라서 컴포넌트가 다른 칸과
 * 같은 기호로 그린다(메시지에 넣으면 ui-text-hygiene 의 앰대쉬 규칙에 걸린다).
 */
export interface StudentLabelMessage {
  key: `studentStatus.${string}`;
  values?: Record<string, string | number>;
}

function formatScoreNumber(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return score.toFixed(1).replace(/\.0$/, "");
}

/** 채점 현황 카드/행의 "총점" 칸에 표시할 점수 텍스트. */
export function overallScoreLabel(
  student: Pick<ExamStudentSummary, "overallScore" | "proposedOverallScore">,
): StudentLabelMessage | null {
  if (student.overallScore != null) {
    return {
      key: "studentStatus.scoreFinal",
      values: { score: formatScoreNumber(student.overallScore) },
    };
  }
  if (student.proposedOverallScore != null) {
    return {
      key: "studentStatus.scoreProposed",
      values: { score: formatScoreNumber(student.proposedOverallScore) },
    };
  }
  return null;
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

const DASHBOARD_STATUS_LABEL_KEY: Record<ExamStudentDashboardStatus, StudentLabelMessage["key"]> = {
  "not-started": "studentStatus.notStarted",
  "in-progress": "studentStatus.inProgress",
  pending: "studentStatus.pending",
  grading: "studentStatus.grading",
  "proposed-ready": "studentStatus.proposedReady",
  graded: "studentStatus.graded",
  failed: "studentStatus.failed",
};

export function dashboardStatusLabel(status: ExamStudentDashboardStatus): StudentLabelMessage {
  return { key: DASHBOARD_STATUS_LABEL_KEY[status] };
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
): StudentLabelMessage | null {
  if (status !== "submitted" || caseProgress.total === 0) return null;
  if (caseProgress.submitted === 0) return { key: "studentStatus.caseNotSubmitted" };
  if (caseProgress.submitted < caseProgress.total) {
    return {
      key: "studentStatus.casePartial",
      values: { submitted: caseProgress.submitted, total: caseProgress.total },
    };
  }
  return { key: "studentStatus.caseSubmitted" };
}
