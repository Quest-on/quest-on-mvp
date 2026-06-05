/**
 * Grade deduplication and scoring utilities.
 * Used by: overview/route.ts, final-grades/route.ts, report/route.ts
 */

export type GradeRow = {
  q_idx: number;
  score: number;
  grade_type?: string;
  [key: string]: unknown;
};

export type ScoreWeightBucket = "multiple-choice" | "true-false" | "case";

export type ScoreWeights = {
  version: 1;
  typeWeights: Partial<Record<ScoreWeightBucket, number>>;
  distribution: "equal_by_type";
};

export type ScoreItem = {
  qIdx?: number;
  q_idx?: number;
  type?: string | null;
  score?: number | null;
};

export type ScoreQuestion = {
  idx?: number;
  q_idx?: number;
  type?: string | null;
  question_type?: string | null;
};

export type ScoreBucketMeta = {
  weight: number;
  averageScore: number | null;
  contribution: number | null;
  gradedCount: number;
  totalCount: number;
  status: "scored" | "missing" | "ungraded" | "zero_weight";
};

export type ScoreCalculationResult = {
  overallScore: number | null;
  gradedCount: number;
  totalCount: number;
  mode: "legacy" | "weighted";
  incompleteBuckets: ScoreWeightBucket[];
  missingBuckets: ScoreWeightBucket[];
  ungradedBuckets: ScoreWeightBucket[];
  bucketScores: Partial<Record<ScoreWeightBucket, number>>;
  bucketMeta: Record<ScoreWeightBucket, ScoreBucketMeta>;
  totalConfiguredWeight: number;
  isComplete: boolean;
};

export type WeightedOverallScoreInput = {
  questions?: ScoreQuestion[];
  objectiveScores?: ScoreItem[];
  grades?: GradeRow[];
  caseGrades?: GradeRow[];
  scoreWeights?: ScoreWeights | null;
  totalQuestionCount?: number;
};

const GRADE_PRIORITY: Record<string, number> = {
  manual: 3,
  auto: 2,
  ai_failed: 1,
};

const EXCLUDED_GRADE_TYPES = new Set(["ai_failed", "ai_summary"]);

function isPlaceholderGrade(grade: Pick<GradeRow, "grade_type">): boolean {
  return grade.grade_type === "ai_summary";
}

export function isSuccessfulGradeType(gradeType?: string | null): boolean {
  return gradeType !== "ai_failed" && gradeType !== "ai_summary";
}

export function isScoringGrade(
  grade: { grade_type?: string | null; score?: number | null } | null | undefined
): grade is { grade_type?: string | null; score: number } {
  return (
    !!grade &&
    typeof grade.score === "number" &&
    Number.isFinite(grade.score) &&
    !EXCLUDED_GRADE_TYPES.has(grade.grade_type ?? "")
  );
}

/** Deduplicate grades: keep highest-priority grade per q_idx (manual > auto > ai_failed) */
export function deduplicateGrades<T extends GradeRow>(grades: T[]): T[] {
  const bestByIdx = new Map<number, T>();
  for (const grade of grades) {
    if (isPlaceholderGrade(grade)) continue;

    const existing = bestByIdx.get(grade.q_idx);
    const currentPriority = GRADE_PRIORITY[grade.grade_type || "auto"] ?? 2;
    const existingPriority = existing
      ? (GRADE_PRIORITY[existing.grade_type || "auto"] ?? 2)
      : 0;
    if (!existing || currentPriority > existingPriority) {
      bestByIdx.set(grade.q_idx, grade);
    }
  }
  return Array.from(bestByIdx.values());
}

/** Calculate overall score from grades, excluding non-scoring entries */
export function calculateOverallScore(
  grades: GradeRow[],
  _totalQuestionCount?: number
): { overallScore: number; gradedCount: number } {
  void _totalQuestionCount;
  const deduped = deduplicateGrades(grades);
  const valid = deduped.filter(isScoringGrade);
  if (valid.length === 0) return { overallScore: 0, gradedCount: 0 };
  const sum = valid.reduce((acc, g) => acc + g.score, 0);
  return {
    overallScore: Math.round(sum / valid.length),
    gradedCount: valid.length,
  };
}

function roundScore(score: number): number {
  return Math.round(Math.max(0, Math.min(100, score)));
}

function emptyBucketMeta(
  weight = 0,
  status: ScoreBucketMeta["status"] = "zero_weight"
): ScoreBucketMeta {
  return {
    weight,
    averageScore: null,
    contribution: null,
    gradedCount: 0,
    totalCount: 0,
    status,
  };
}

function emptyBucketMetaRecord(): Record<ScoreWeightBucket, ScoreBucketMeta> {
  return {
    "multiple-choice": emptyBucketMeta(),
    "true-false": emptyBucketMeta(),
    case: emptyBucketMeta(),
  };
}

function questionQIdx(question: ScoreQuestion, fallbackIndex: number): number {
  if (typeof question.idx === "number" && Number.isFinite(question.idx)) {
    return question.idx;
  }
  if (typeof question.q_idx === "number" && Number.isFinite(question.q_idx)) {
    return question.q_idx;
  }
  return fallbackIndex;
}

function scoreItemQIdx(item: ScoreItem): number | null {
  if (typeof item.qIdx === "number" && Number.isFinite(item.qIdx)) {
    return item.qIdx;
  }
  if (typeof item.q_idx === "number" && Number.isFinite(item.q_idx)) {
    return item.q_idx;
  }
  return null;
}

export function scoreBucketForQuestionType(
  type?: string | null
): ScoreWeightBucket | null {
  const normalized = type?.toLowerCase();
  if (normalized === "multiple-choice" || normalized === "mcq") {
    return "multiple-choice";
  }
  if (
    normalized === "true-false" ||
    normalized === "true_false" ||
    normalized === "ox"
  ) {
    return "true-false";
  }
  if (
    normalized === "case" ||
    normalized === "essay" ||
    normalized === "short-answer" ||
    normalized === "short_answer"
  ) {
    return "case";
  }
  return null;
}

export function normalizeScoreWeights(value: unknown): ScoreWeights | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as {
    version?: unknown;
    typeWeights?: unknown;
    distribution?: unknown;
  };
  if (raw.version !== 1) return null;
  if (raw.distribution !== "equal_by_type") return null;
  if (!raw.typeWeights || typeof raw.typeWeights !== "object") return null;

  const input = raw.typeWeights as Partial<Record<ScoreWeightBucket, unknown>>;
  const typeWeights: Partial<Record<ScoreWeightBucket, number>> = {};
  for (const bucket of ["multiple-choice", "true-false", "case"] as const) {
    const weight = input[bucket];
    if (
      typeof weight !== "number" ||
      !Number.isFinite(weight) ||
      !Number.isInteger(weight) ||
      weight < 1 ||
      weight > 100
    ) {
      continue;
    }
    typeWeights[bucket] = weight;
  }

  if (Object.keys(typeWeights).length === 0) return null;

  return {
    version: 1,
    typeWeights,
    distribution: "equal_by_type",
  };
}

export function buildDefaultScoreWeightsForQuestionTypes(
  questionTypes: Array<string | null | undefined>
): ScoreWeights | null {
  const presentBuckets = new Set(
    questionTypes
      .map((type) => scoreBucketForQuestionType(type))
      .filter((bucket): bucket is ScoreWeightBucket => bucket !== null)
  );
  const buckets = (["multiple-choice", "true-false", "case"] as const).filter(
    (bucket) => presentBuckets.has(bucket)
  );
  if (buckets.length === 0) return null;

  const base = Math.floor(100 / buckets.length);
  let remainder = 100 - base * buckets.length;
  const typeWeights: Partial<Record<ScoreWeightBucket, number>> = {};
  for (const bucket of buckets) {
    typeWeights[bucket] = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }

  return {
    version: 1,
    typeWeights,
    distribution: "equal_by_type",
  };
}

function buildScoreWeightsFromBuckets(
  buckets: ScoreWeightBucket[]
): ScoreWeights | null {
  if (buckets.length === 0) return null;
  const base = Math.floor(100 / buckets.length);
  let remainder = 100 - base * buckets.length;
  const typeWeights: Partial<Record<ScoreWeightBucket, number>> = {};
  for (const bucket of buckets) {
    typeWeights[bucket] = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }

  return {
    version: 1,
    typeWeights,
    distribution: "equal_by_type",
  };
}

export function syncScoreWeightsForBuckets(
  scoreWeights: ScoreWeights | null | undefined,
  buckets: ScoreWeightBucket[]
): ScoreWeights | null {
  if (buckets.length === 0) return null;
  if (!scoreWeights) return buildScoreWeightsFromBuckets(buckets);

  const visibleBucketSet = new Set(buckets);
  const configuredBuckets = Object.entries(scoreWeights.typeWeights)
    .filter(([, weight]) => typeof weight === "number" && weight > 0)
    .map(([bucket]) => bucket as ScoreWeightBucket);

  const hasMissingBucket = buckets.some(
    (bucket) => typeof scoreWeights.typeWeights[bucket] !== "number"
  );
  const hasStaleBucket = configuredBuckets.some(
    (bucket) => !visibleBucketSet.has(bucket)
  );

  // Fast path: nothing to do — keep all existing per-bucket values as-is
  if (!hasMissingBucket && !hasStaleBucket) {
    return {
      version: 1,
      distribution: "equal_by_type",
      typeWeights: Object.fromEntries(
        buckets.map((bucket) => [bucket, scoreWeights.typeWeights[bucket]])
      ) as Partial<Record<ScoreWeightBucket, number>>,
    };
  }

  // Build new typeWeights:
  //   - keep existing values for still-present buckets
  //   - drop stale buckets
  //   - assign a sensible default for newly-present buckets
  const presentValues = buckets
    .map((b) => scoreWeights.typeWeights[b])
    .filter((w): w is number => typeof w === "number" && w > 0);
  const defaultForNew =
    presentValues.length > 0
      ? Math.max(1, Math.round(presentValues.reduce((a, b) => a + b, 0) / presentValues.length))
      : 100;

  const typeWeights: Partial<Record<ScoreWeightBucket, number>> = {};
  for (const bucket of buckets) {
    const existing = scoreWeights.typeWeights[bucket];
    typeWeights[bucket] =
      typeof existing === "number" && existing > 0 ? existing : defaultForNew;
  }

  return {
    version: 1,
    distribution: "equal_by_type",
    typeWeights,
  };
}


export function validateScoreWeightsForQuestions(
  scoreWeights: ScoreWeights | null | undefined,
  questionTypes: Array<string | null | undefined>
): string[] {
  if (!scoreWeights) return [];

  const presentBuckets = new Set(
    questionTypes
      .map((type) => scoreBucketForQuestionType(type))
      .filter((bucket): bucket is ScoreWeightBucket => bucket !== null)
  );
  const weights = scoreWeights.typeWeights;
  const activeEntries = (Object.entries(weights) as Array<
    [ScoreWeightBucket, number | undefined]
  >).filter(([, weight]) => typeof weight === "number" && weight > 0) as Array<
    [ScoreWeightBucket, number]
  >;

  const errors: string[] = [];

  for (const [bucket, weight] of activeEntries) {
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      errors.push("유형별 비중은 1~100 사이의 정수여야 합니다.");
    }
    if (!presentBuckets.has(bucket)) {
      errors.push("문항이 없는 유형에는 비중을 설정할 수 없습니다.");
    }
  }

  for (const bucket of presentBuckets) {
    const weight = weights[bucket];
    if (typeof weight !== "number" || weight <= 0) {
      errors.push("문항이 있는 유형에는 1점 이상의 비중을 설정해야 합니다.");
    }
  }

  return [...new Set(errors)];
}

export function calculateScoreFromItems(
  items: ScoreItem[],
  scoreWeights?: ScoreWeights | null
): ScoreCalculationResult {
  if (!scoreWeights) {
    const valid = items.filter(
      (item): item is ScoreItem & { score: number } =>
        typeof item.score === "number" && Number.isFinite(item.score)
    );
    const caseItems = items.filter(
      (item) => scoreBucketForQuestionType(item.type) === "case"
    );
    const hasUngradedCaseItem = caseItems.some(
      (item) => typeof item.score !== "number" || !Number.isFinite(item.score)
    );
    if (hasUngradedCaseItem) {
      const caseValid = caseItems.filter(
        (item): item is ScoreItem & { score: number } =>
          typeof item.score === "number" && Number.isFinite(item.score)
      );
      return {
        overallScore: null,
        gradedCount: valid.length,
        totalCount: items.length,
        mode: "legacy",
        incompleteBuckets: ["case"],
        missingBuckets: [],
        ungradedBuckets: ["case"],
        bucketScores: {},
        bucketMeta: {
          ...emptyBucketMetaRecord(),
          case: {
            weight: 0,
            averageScore: caseValid.length
              ? roundScore(
                  caseValid.reduce((acc, item) => acc + item.score, 0) /
                    caseValid.length
                )
              : null,
            contribution: null,
            gradedCount: caseValid.length,
            totalCount: caseItems.length,
            status: "ungraded",
          },
        },
        totalConfiguredWeight: 0,
        isComplete: false,
      };
    }
    if (valid.length === 0) {
      return {
        overallScore: 0,
        gradedCount: 0,
        totalCount: items.length,
        mode: "legacy",
        incompleteBuckets: [],
        missingBuckets: [],
        ungradedBuckets: [],
        bucketScores: {},
        bucketMeta: emptyBucketMetaRecord(),
        totalConfiguredWeight: 0,
        isComplete: true,
      };
    }
    return {
      overallScore: roundScore(
        valid.reduce((acc, item) => acc + item.score, 0) / valid.length
      ),
      gradedCount: valid.length,
      totalCount: items.length,
      mode: "legacy",
      incompleteBuckets: [],
      missingBuckets: [],
      ungradedBuckets: [],
      bucketScores: {},
      bucketMeta: emptyBucketMetaRecord(),
      totalConfiguredWeight: 0,
      isComplete: true,
    };
  }

  const activeEntries = (Object.entries(scoreWeights.typeWeights) as Array<
    [ScoreWeightBucket, number | undefined]
  >).filter(([, weight]) => typeof weight === "number" && weight > 0) as Array<
    [ScoreWeightBucket, number]
  >;

  const incompleteBuckets: ScoreWeightBucket[] = [];
  const missingBuckets: ScoreWeightBucket[] = [];
  const ungradedBuckets: ScoreWeightBucket[] = [];
  const bucketScores: Partial<Record<ScoreWeightBucket, number>> = {};
  const bucketMeta = emptyBucketMetaRecord();
  let weightedTotal = 0;
  let gradedCount = 0;
  let totalCount = 0;
  const totalConfiguredWeight = activeEntries.reduce(
    (acc, [, weight]) => acc + weight,
    0
  );

  for (const [bucket, weight] of activeEntries) {
    const bucketItems = items.filter(
      (item) => scoreBucketForQuestionType(item.type) === bucket
    );
    const valid = bucketItems.filter(
      (item): item is ScoreItem & { score: number } =>
        typeof item.score === "number" && Number.isFinite(item.score)
    );

    totalCount += bucketItems.length;
    gradedCount += valid.length;

    if (bucketItems.length === 0) {
      incompleteBuckets.push(bucket);
      missingBuckets.push(bucket);
      bucketMeta[bucket] = emptyBucketMeta(weight, "missing");
      continue;
    }

    if (valid.length !== bucketItems.length) {
      incompleteBuckets.push(bucket);
      ungradedBuckets.push(bucket);
      bucketMeta[bucket] = {
        weight,
        averageScore: valid.length
          ? roundScore(
              valid.reduce((acc, item) => acc + item.score, 0) / valid.length
            )
          : null,
        contribution: null,
        gradedCount: valid.length,
        totalCount: bucketItems.length,
        status: "ungraded",
      };
      continue;
    }

    const bucketAverage =
      valid.reduce((acc, item) => acc + item.score, 0) / valid.length;
    const roundedBucketAverage = roundScore(bucketAverage);
    const contribution =
      totalConfiguredWeight > 0
        ? bucketAverage * (weight / totalConfiguredWeight)
        : 0;
    bucketScores[bucket] = roundedBucketAverage;
    weightedTotal += contribution;
    bucketMeta[bucket] = {
      weight,
      averageScore: roundedBucketAverage,
      contribution,
      gradedCount: valid.length,
      totalCount: bucketItems.length,
      status: "scored",
    };
  }

  return {
    overallScore:
      incompleteBuckets.length === 0 && activeEntries.length > 0
        ? roundScore(weightedTotal)
        : null,
    gradedCount,
    totalCount,
    mode: "weighted",
    incompleteBuckets,
    missingBuckets,
    ungradedBuckets,
    bucketScores,
    bucketMeta,
    totalConfiguredWeight,
    isComplete: incompleteBuckets.length === 0 && activeEntries.length > 0,
  };
}

function scoreCandidatePriority(candidate: {
  source: "objective" | "grade";
  grade_type?: string | null;
}): number {
  if (candidate.source === "objective") return 4;
  return GRADE_PRIORITY[candidate.grade_type || "auto"] ?? 2;
}

/**
 * Integrates deterministic objective raw scores with grade rows (case/manual)
 * before applying legacy or configured type-weighted scoring.
 */
export function calculateWeightedOverallScore({
  questions = [],
  objectiveScores = [],
  grades = [],
  caseGrades = [],
  scoreWeights,
  totalQuestionCount,
}: WeightedOverallScoreInput): ScoreCalculationResult {
  const questionTypesByIdx = new Map<number, string | null | undefined>();
  const itemsByIdx = new Map<number, ScoreItem>();

  questions.forEach((question, index) => {
    const qIdx = questionQIdx(question, index);
    const type = question.type ?? question.question_type;
    questionTypesByIdx.set(qIdx, type);
    itemsByIdx.set(qIdx, { qIdx, type, score: null });
  });

  const candidatesByIdx = new Map<
    number,
    ScoreItem & { source: "objective" | "grade"; grade_type?: string | null }
  >();

  for (const objectiveScore of objectiveScores) {
    if (
      typeof objectiveScore.score !== "number" ||
      !Number.isFinite(objectiveScore.score)
    ) {
      continue;
    }
    const qIdx = scoreItemQIdx(objectiveScore);
    if (qIdx === null) continue;

    const type = objectiveScore.type ?? questionTypesByIdx.get(qIdx);
    const candidate = {
      ...objectiveScore,
      qIdx,
      type,
      source: "objective" as const,
    };
    candidatesByIdx.set(qIdx, candidate);
  }

  for (const grade of deduplicateGrades([...grades, ...caseGrades])) {
    if (!isScoringGrade(grade)) continue;

    const candidate = {
      qIdx: grade.q_idx,
      type: questionTypesByIdx.get(grade.q_idx),
      score: grade.score,
      source: "grade" as const,
      grade_type: grade.grade_type,
    };
    const existing = candidatesByIdx.get(grade.q_idx);
    if (
      !existing ||
      scoreCandidatePriority(candidate) > scoreCandidatePriority(existing)
    ) {
      candidatesByIdx.set(grade.q_idx, candidate);
    }
  }

  for (const [qIdx, candidate] of candidatesByIdx.entries()) {
    itemsByIdx.set(qIdx, {
      qIdx,
      type: candidate.type ?? questionTypesByIdx.get(qIdx),
      score: candidate.score,
    });
  }

  if (!scoreWeights && objectiveScores.length === 0 && questions.length === 0) {
    const legacy = calculateOverallScore([...grades, ...caseGrades], totalQuestionCount);
    return {
      overallScore: legacy.overallScore,
      gradedCount: legacy.gradedCount,
      totalCount: totalQuestionCount ?? itemsByIdx.size,
      mode: "legacy",
      incompleteBuckets: [],
      missingBuckets: [],
      ungradedBuckets: [],
      bucketScores: {},
      bucketMeta: emptyBucketMetaRecord(),
      totalConfiguredWeight: 0,
      isComplete: true,
    };
  }

  return calculateScoreFromItems([...itemsByIdx.values()], scoreWeights);
}
