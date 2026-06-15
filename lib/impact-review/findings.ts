import type {
  DeterministicFinding,
  Finding,
  ModelFinding,
  ReviewExitPolicy,
  Severity,
} from "./types";

const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, Warning: 1, Suggestion: 2 };

/**
 * 결정적 + 모델 finding 병합.
 * - 신뢰도 임계 필터는 *모델 finding에만* 적용 (코멘트에서 숨김, JSON엔 suppressed:true로 유지).
 * - 결정적 finding은 절대 제거/강등/억제하지 않는다.
 */
export function mergeFindings(
  deterministic: DeterministicFinding[],
  model: ModelFinding[],
  confidenceThreshold: number
): Finding[] {
  const modelMarked = model.map((m) => ({
    ...m,
    suppressed: m.confidence < confidenceThreshold,
  }));
  const all: Finding[] = [...deterministic, ...modelMarked];
  return all.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** 코멘트에 노출할 finding (suppressed 모델 제외; 결정적은 항상 포함). */
export function visibleFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.source === "deterministic" || !f.suppressed);
}

export function computeShouldFail(findings: Finding[], policy: ReviewExitPolicy): boolean {
  for (const f of findings) {
    if (f.severity !== "Critical") continue;
    if (f.source === "deterministic" && policy.failOnDeterministicCritical) return true;
    if (f.source === "model" && !f.suppressed && policy.failOnAiCritical) return true;
  }
  return false;
}
