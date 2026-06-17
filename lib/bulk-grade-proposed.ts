export type ProposedGrade = {
  score: number;
  comment?: string;
};

export type ProposedGradesMap = Record<string, Record<string, ProposedGrade>>;

export function isValidProposedGrade(value: unknown): value is ProposedGrade {
  if (!value || typeof value !== "object") return false;
  const score = (value as { score?: unknown }).score;
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100
  );
}

export function normalizeProposedGrades(value: unknown): ProposedGradesMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ProposedGradesMap;
}

export function getProposedGrade(
  proposedGrades: ProposedGradesMap,
  sessionId: string,
  qIdx: number,
): ProposedGrade | undefined {
  const grade = proposedGrades[sessionId]?.[String(qIdx)];
  return isValidProposedGrade(grade) ? grade : undefined;
}

export function isBulkGradingSessionCommitted(session: {
  status?: string | null;
  committed_at?: string | null;
} | null | undefined): boolean {
  if (!session) return false;
  return session.status === "committed" || !!session.committed_at;
}
