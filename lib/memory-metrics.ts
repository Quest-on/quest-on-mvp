/**
 * 교수 메모리 모니터링 지표 — 순수 계산.
 *
 * 이 모듈은 DB 를 모른다. 행을 받아 숫자를 낸다. 읽기는 scripts/memory-metrics.ts 가 한다.
 * 네 지표는 전부 이미 존재하는 테이블에서 나온다:
 *   1. 교수·일자별 쓰기            ← instructor_memory_events
 *   2. 모순율(supersede / 쓰기)    ← instructor_memory_events
 *   3. 프롬프트 내 메모리 토큰 비중 ← memory_application_snapshots × ai_events
 *   4. AI 제안 점수 수정률 변화     ← grades (릴리스 전후)
 *
 * 분모가 0 인 경우 NaN·Infinity 를 만들지 않고 `null` 을 돌려준다. "아직 쓰기가 없다" 와
 * "모순율이 0 이다" 는 다른 사실이고, 대시보드에서 이 둘이 같아 보이면 안 된다.
 */

/** instructor_memory_events 의 operation CHECK 중 "쓰기" 로 세는 것들. */
export const MEMORY_WRITE_OPERATIONS = ["add", "update", "supersede"] as const;
export const MEMORY_CONTRADICTION_OPERATION = "supersede";

export interface MemoryEventRow {
  instructor_id: string;
  operation: string;
  occurred_at: string;
}

export interface MemorySnapshotRow {
  instructor_id: string;
  estimated_tokens: number | null;
  prompt_hash: string | null;
  created_at: string;
}

/** ai_events 한 행에서 필요한 것만. prompt_hash 는 metadata.prompt_hash 에서 꺼내 온다. */
export interface PromptTokenRow {
  prompt_hash: string | null;
  input_tokens: number | null;
  created_at: string;
}

/**
 * grades 한 행.
 *
 * `ai_proposed_score` 는 형제 브랜치에서 오는 컬럼이다. 이 워크트리의
 * prisma/schema.prisma 에는 아직 없다. 속성이 아예 없으면 지표 4 는 대체 기준으로 내려간다.
 */
export interface GradeRow {
  created_at: string;
  grade_type: string;
  score: number | null;
  ai_proposed_score?: number | null;
}

export interface MemoryMetricsInput {
  events: readonly MemoryEventRow[];
  snapshots: readonly MemorySnapshotRow[];
  promptTokens: readonly PromptTokenRow[];
  grades: readonly GradeRow[];
  /** 지표 4 의 전/후를 가르는 릴리스 시각(ISO). */
  releaseAt: string;
}

export interface WritesPerInstructorDayRow {
  instructorId: string;
  /** UTC 기준 YYYY-MM-DD. */
  date: string;
  writes: number;
}

export interface WritesPerInstructorPerDay {
  rows: WritesPerInstructorDayRow[];
  totalWrites: number;
  /** 쓰기가 하루라도 있었던 (교수, 일자) 짝의 수. */
  instructorDays: number;
  /** 쓰기가 하나도 없으면 0 이 아니라 null. */
  meanWritesPerInstructorDay: number | null;
  maxWritesInADay: number | null;
}

export interface ContradictionRate {
  writes: number;
  supersedes: number;
  rate: number | null;
}

export interface MemoryTokenShare {
  memoryTokens: number;
  promptTokens: number;
  share: number | null;
  matchedSnapshots: number;
  /** prompt_hash 가 없거나 ai_events 에서 짝을 못 찾은 스냅샷. 커버리지 경고용. */
  unmatchedSnapshots: number;
}

export interface EditRateWindow {
  edited: number;
  total: number;
  rate: number | null;
}

export interface AiScoreEditRateShift {
  /** 참일 때만 "AI 제안 점수를 고쳤다" 를 실제로 잰 것이다. */
  available: boolean;
  basis: "ai_proposed_score" | "grade_type_fallback";
  degradedReason: string | null;
  before: EditRateWindow;
  after: EditRateWindow;
  /** after.rate - before.rate. 한쪽이라도 null 이면 null. */
  delta: number | null;
}

export interface MemoryMetrics {
  releaseAt: string;
  writesPerInstructorPerDay: WritesPerInstructorPerDay;
  contradictionRate: ContradictionRate;
  memoryTokenShare: MemoryTokenShare;
  aiScoreEditRateShift: AiScoreEditRateShift;
}

const AI_PROPOSED_SCORE_ABSENT =
  "grades.ai_proposed_score is absent in this deployment; " +
  "falling back to the manual-override rate (grade_type = 'manual'), " +
  "which counts human-written grades rather than edits to an AI proposal.";

/** 0 으로 나누지 않는다. 분모가 0 이면 "잴 수 없음" 이지 0 이 아니다. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** 타임존 오프셋이 붙은 값(+09:00)도 UTC 일자로 맞춘다. 못 읽는 값은 버킷에서 뺀다. */
export function utcDay(timestamp: string): string | null {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 지표 1 — 교수당·일자당 쓰기 수. */
export function computeWritesPerInstructorPerDay(
  events: readonly MemoryEventRow[],
): WritesPerInstructorPerDay {
  const writeOps = new Set<string>(MEMORY_WRITE_OPERATIONS);
  const buckets = new Map<string, WritesPerInstructorDayRow>();

  for (const event of events) {
    if (!writeOps.has(event.operation)) continue;
    const date = utcDay(event.occurred_at);
    if (!date) continue;

    const key = `${event.instructor_id}\u0000${date}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.writes += 1;
    } else {
      buckets.set(key, { instructorId: event.instructor_id, date, writes: 1 });
    }
  }

  const rows = [...buckets.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.instructorId.localeCompare(b.instructorId),
  );
  const totalWrites = rows.reduce((sum, row) => sum + row.writes, 0);

  return {
    rows,
    totalWrites,
    instructorDays: rows.length,
    meanWritesPerInstructorDay: ratio(totalWrites, rows.length),
    maxWritesInADay: rows.length === 0 ? null : Math.max(...rows.map((row) => row.writes)),
  };
}

/** 지표 2 — 모순율. supersede 는 쓰기의 부분집합이므로 분자·분모가 같은 모집단에서 나온다. */
export function computeContradictionRate(
  events: readonly MemoryEventRow[],
): ContradictionRate {
  const writeOps = new Set<string>(MEMORY_WRITE_OPERATIONS);
  let writes = 0;
  let supersedes = 0;

  for (const event of events) {
    if (!writeOps.has(event.operation)) continue;
    writes += 1;
    if (event.operation === MEMORY_CONTRADICTION_OPERATION) supersedes += 1;
  }

  return { writes, supersedes, rate: ratio(supersedes, writes) };
}

/**
 * 지표 3 — 프롬프트에서 메모리가 차지한 토큰 비중.
 *
 * prompt_hash 로 스냅샷과 ai_events 를 맞춘다. 양쪽에 다 있는 해시만 센다. 한쪽에만 있는
 * 해시를 세면 분자·분모의 모집단이 달라져 비중이 뻥튀기되거나 축소된다.
 */
export function computeMemoryTokenShare(
  snapshots: readonly MemorySnapshotRow[],
  promptTokens: readonly PromptTokenRow[],
): MemoryTokenShare {
  const promptByHash = new Map<string, number>();
  for (const row of promptTokens) {
    if (!row.prompt_hash) continue;
    promptByHash.set(row.prompt_hash, (promptByHash.get(row.prompt_hash) ?? 0) + toCount(row.input_tokens));
  }

  const matchedHashes = new Set<string>();
  let memoryTokens = 0;
  let matchedSnapshots = 0;
  let unmatchedSnapshots = 0;

  for (const snapshot of snapshots) {
    if (snapshot.prompt_hash && promptByHash.has(snapshot.prompt_hash)) {
      memoryTokens += toCount(snapshot.estimated_tokens);
      matchedHashes.add(snapshot.prompt_hash);
      matchedSnapshots += 1;
    } else {
      unmatchedSnapshots += 1;
    }
  }

  let promptTokenTotal = 0;
  for (const hash of matchedHashes) {
    promptTokenTotal += promptByHash.get(hash) ?? 0;
  }

  return {
    memoryTokens,
    promptTokens: promptTokenTotal,
    share: ratio(memoryTokens, promptTokenTotal),
    matchedSnapshots,
    unmatchedSnapshots,
  };
}

function editRateWindow(
  rows: readonly GradeRow[],
  basis: AiScoreEditRateShift["basis"],
): EditRateWindow {
  let edited = 0;
  let total = 0;

  for (const row of rows) {
    if (basis === "ai_proposed_score") {
      const proposed = row.ai_proposed_score;
      if (typeof proposed !== "number") continue;
      total += 1;
      if (typeof row.score === "number" && row.score !== proposed) edited += 1;
    } else {
      total += 1;
      if (row.grade_type === "manual") edited += 1;
    }
  }

  return { edited, total, rate: ratio(edited, total) };
}

/**
 * 지표 4 — 릴리스 전후로 교수가 AI 제안 점수를 고치는 비율이 얼마나 달라졌는가.
 *
 * `ai_proposed_score` 가 없는 배포에서는 그 값을 지어내지 않는다. grade_type 으로
 * 대체 계산하고 degraded 로 표시한다. 대체 지표는 "사람이 쓴 성적의 비율" 이지
 * "AI 제안을 고친 비율" 이 아니다 — 이름표를 바꿔 다는 것이 아니라 다른 값이다.
 */
export function computeAiScoreEditRateShift(
  grades: readonly GradeRow[],
  releaseAt: string,
): AiScoreEditRateShift {
  const hasColumn = grades.some((row) => "ai_proposed_score" in row);
  const basis: AiScoreEditRateShift["basis"] = hasColumn
    ? "ai_proposed_score"
    : "grade_type_fallback";

  const boundary = new Date(releaseAt).getTime();
  const before: GradeRow[] = [];
  const after: GradeRow[] = [];

  for (const row of grades) {
    const at = new Date(row.created_at).getTime();
    if (Number.isNaN(at)) continue;
    (at < boundary ? before : after).push(row);
  }

  const beforeWindow = editRateWindow(before, basis);
  const afterWindow = editRateWindow(after, basis);
  const delta =
    beforeWindow.rate === null || afterWindow.rate === null
      ? null
      : afterWindow.rate - beforeWindow.rate;

  return {
    available: hasColumn,
    basis,
    degradedReason: hasColumn ? null : AI_PROPOSED_SCORE_ABSENT,
    before: beforeWindow,
    after: afterWindow,
    delta,
  };
}

export function computeMemoryMetrics(input: MemoryMetricsInput): MemoryMetrics {
  return {
    releaseAt: input.releaseAt,
    writesPerInstructorPerDay: computeWritesPerInstructorPerDay(input.events),
    contradictionRate: computeContradictionRate(input.events),
    memoryTokenShare: computeMemoryTokenShare(input.snapshots, input.promptTokens),
    aiScoreEditRateShift: computeAiScoreEditRateShift(input.grades, input.releaseAt),
  };
}
