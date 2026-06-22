export type StageKey = "chat" | "answer";

export type AiDependencyRiskLevel = "low" | "medium" | "high";

export interface AssignmentResearchMetrics {
  followUpQuestionCount: number;
  verificationQuestionCount: number;
  conceptExplorationCount: number;
  answerDelegationCount: number;
}

export interface AiDependencyAssessment {
  delegationRequestCount: number;
  startingPointDependencyCount: number;
  directAnswerRequestCount: number;
  directAnswerRelianceCount: number;
  recoveryObserved: boolean;
  recoveryEvidence: string[];
  triggerEvidence: string[];
  finalAnswerOverlapScore: number;
  overallRisk: AiDependencyRiskLevel;
  penaltyApplied: number;
  summary: string;
  /** exam: 시험 풀이 의존 신호. assignment: 리서치 참여 신호 해석 */
  evaluationMode?: "exam" | "assignment";
  assignmentMetrics?: AssignmentResearchMetrics;
}

export interface StageGrade {
  score: number;
  comment: string;
  rubric_scores?: Record<string, number>;
  ai_dependency?: AiDependencyAssessment;
}

export interface StageGrading {
  chat?: StageGrade;
  answer?: StageGrade;
  feedback?: { score: number; comment: string };
  /** Set to true when AI returned out-of-range scores that were clamped */
  _score_clamped?: boolean;
}

export interface AiDependencySummary {
  overallRisk: AiDependencyRiskLevel;
  recoveryObserved: boolean;
  triggerCount: number;
  summary: string;
  triggerEvidence: string[];
  recoveryEvidence: string[];
  evaluationMode?: "exam" | "assignment";
  questionBreakdown: Array<{
    q_idx: number;
    overallRisk: AiDependencyRiskLevel;
    recoveryObserved: boolean;
    summary: string;
  }>;
}

export interface SummaryData {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyQuotes?: string[];
  aiDependency?: AiDependencySummary | null;
}

/**
 * Per-question AI summary stored on grades.ai_summary.
 * Lighter than SummaryData — scoped to a single question.
 */
export interface QuestionSummaryData {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyQuotes?: string[];
}

/**
 * Real-time grading progress stored on sessions.grading_progress.
 * Updated by autoGradeSession as each question finishes so the
 * student report page and instructor grading list can show
 * "n/m 채점 완료" progress bars instead of an opaque spinner.
 */
export type GradingProgressStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

/**
 * Phase that the grading pipeline is currently executing.
 * Chained QStash jobs progress through these in order:
 *   grade → objective_only_done
 */
export type GradingPhaseName =
  | "grade"
  | "qsummary"
  | "session_summary"
  | "objective_only_done"
  | "done";

export interface GradingProgress {
  status: GradingProgressStatus;
  total: number;
  completed: number;
  failed: number;
  /** Which phase is currently executing (or was last executed). */
  phase?: GradingPhaseName;
  /** The q_idx currently being processed (omitted for session_summary). */
  current_q_idx?: number;
  /** Last observed error message — surfaces silent failures for operators. */
  last_error?: string;
  /**
   * ISO timestamp of the last time the cron sweeper picked up this session.
   * Used to enforce a per-session sweep cooldown — even if `updated_at` gets
   * bumped by a stray partial update, the sweeper won't hot-loop on the same
   * session every cron tick.
   */
  last_swept_at?: string;
  /**
   * Monotonically increasing counter of how many times the cron sweeper has
   * re-triggered this session. Capped in the sweeper — after N attempts the
   * session is force-marked as `failed` to require operator attention instead
   * of burning budget indefinitely.
   */
  sweep_attempts?: number;
  updated_at: string;
}

/**
 * Payload pushed to QStash for each chained grading phase job.
 * Discriminated union keeps the worker type-safe and payloads small.
 */
export type GradingPhasePayload =
  | { sessionId: string; phase: "grade_question"; qIdx: number }
  | { sessionId: string; phase: "question_summary"; qIdx: number }
  | { sessionId: string; phase: "session_summary" };
