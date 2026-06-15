/** Impact-review 엔진 공용 타입. */

export type Severity = "Critical" | "Warning" | "Suggestion";
export type FindingSource = "deterministic" | "model";

export interface DiffHunk {
  /** 변경된(추가/삭제) 라인 내용을 합친 텍스트 (prefix 제거). */
  changedText: string;
  addedText: string;
  removedText: string;
  oldStart: number;
  newStart: number;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
  /** 이 파일의 모든 hunk 변경 텍스트 합본 (검색 편의용). */
  changedText: string;
}

export interface ChangedSymbol {
  name: string;
  kind: "function" | "const" | "class" | "type" | "default" | "identifier";
  path: string;
}

export interface BlastRadiusEntry {
  changedSymbol: string;
  sourcePath: string;
  dependents: Array<{
    path: string;
    reason: "importer" | "caller" | "mirror_pair";
    ruleId?: string;
  }>;
}

export interface FindingLocation {
  path: string;
  line?: number;
}

export interface DeterministicFinding {
  source: "deterministic";
  severity: Severity;
  confidence: 100;
  ruleIds: string[];
  message: string;
  location?: FindingLocation;
}

export interface ModelFinding {
  source: "model";
  severity: Severity;
  confidence: number;
  ruleIds: string[];
  message: string;
  location?: FindingLocation;
  evidence?: string[];
  /** 신뢰도 임계 미만이면 코멘트에서 제외하되 JSON에는 남긴다. */
  suppressed?: boolean;
}

export type Finding = DeterministicFinding | ModelFinding;

export interface ProviderResult {
  provider: string; // "kimi" | "glm" | "openai" | "none"
  model: string | null;
  skipped: boolean;
  skippedReason?: string;
  findings: ModelFinding[];
}

export interface ReviewExitPolicy {
  failOnDeterministicCritical: boolean;
  failOnAiCritical: boolean;
}

export interface ReviewResult {
  range: string | null;
  changedFiles: DiffFile[];
  changedSymbols: ChangedSymbol[];
  blastRadius: BlastRadiusEntry[];
  deterministicFindings: DeterministicFinding[];
  provider: ProviderResult;
  findings: Finding[];
  /** exit policy 적용 결과: deterministic Critical 등으로 CI 실패해야 하는가. */
  shouldFail: boolean;
}

// ─── Rule catalog ───────────────────────────────────────────────────────────

export interface MirrorExemption {
  dimension: string;
  helper: string;
  mirrorWatch: string[];
  helperHunk: string[];
}

export interface MirrorRule {
  id: string;
  kind: "mirror";
  severity: Severity;
  sides: { create: string; edit: string };
  reviewContextModules?: string[];
  watch: string[];
  exemptions?: MirrorExemption[];
}

export interface PatternRule {
  id: string;
  kind: "pattern";
  severity: Severity;
  anyPath: string[];
  signals: string[];
  message: string;
}

export type Rule = MirrorRule | PatternRule;

export interface RuleCatalog {
  version: number;
  rules: Rule[];
}
