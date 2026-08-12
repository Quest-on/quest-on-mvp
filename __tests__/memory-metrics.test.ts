import { describe, expect, it } from "vitest";
import {
  computeAiScoreEditRateShift,
  computeContradictionRate,
  computeMemoryMetrics,
  computeMemoryTokenShare,
  computeWritesPerInstructorPerDay,
  ratio,
  utcDay,
  type GradeRow,
  type MemoryEventRow,
  type MemoryMetricsInput,
  type MemorySnapshotRow,
  type PromptTokenRow,
} from "@/lib/memory-metrics";

const RELEASE_AT = "2026-08-05T00:00:00.000Z";

const events: MemoryEventRow[] = [
  // prof-a, 8/3 — 쓰기 3건 중 supersede 1건
  { instructor_id: "prof-a", operation: "add", occurred_at: "2026-08-03T01:00:00.000Z" },
  { instructor_id: "prof-a", operation: "update", occurred_at: "2026-08-03T02:00:00.000Z" },
  { instructor_id: "prof-a", operation: "supersede", occurred_at: "2026-08-03T23:59:59.000Z" },
  // prof-a, 8/4 — 쓰기 1건
  { instructor_id: "prof-a", operation: "add", occurred_at: "2026-08-04T00:00:01.000Z" },
  // prof-b, 8/3 — 쓰기 2건 중 supersede 1건
  { instructor_id: "prof-b", operation: "add", occurred_at: "2026-08-03T10:00:00.000Z" },
  { instructor_id: "prof-b", operation: "supersede", occurred_at: "2026-08-03T11:00:00.000Z" },
  // 쓰기가 아닌 것들 — 분모에 들어가면 안 된다
  { instructor_id: "prof-a", operation: "archive", occurred_at: "2026-08-03T12:00:00.000Z" },
  { instructor_id: "prof-b", operation: "quarantine", occurred_at: "2026-08-03T12:30:00.000Z" },
  { instructor_id: "prof-b", operation: "restore", occurred_at: "2026-08-03T12:40:00.000Z" },
];

const snapshots: MemorySnapshotRow[] = [
  { instructor_id: "prof-a", estimated_tokens: 120, prompt_hash: "h1", created_at: "2026-08-03T01:00:00.000Z" },
  { instructor_id: "prof-a", estimated_tokens: 80, prompt_hash: "h2", created_at: "2026-08-03T02:00:00.000Z" },
  // ai_events 에 짝이 없는 해시 — 분자에 들어가면 안 된다
  { instructor_id: "prof-b", estimated_tokens: 999, prompt_hash: "h-missing", created_at: "2026-08-03T03:00:00.000Z" },
  // prompt_hash 자체가 없는 스냅샷
  { instructor_id: "prof-b", estimated_tokens: 500, prompt_hash: null, created_at: "2026-08-03T04:00:00.000Z" },
];

const promptTokens: PromptTokenRow[] = [
  { prompt_hash: "h1", input_tokens: 1000, created_at: "2026-08-03T01:00:00.000Z" },
  { prompt_hash: "h2", input_tokens: 1000, created_at: "2026-08-03T02:00:00.000Z" },
  // 스냅샷이 없는 호출 — 분모에 들어가면 비중이 축소된다
  { prompt_hash: "h-no-memory", input_tokens: 50000, created_at: "2026-08-03T05:00:00.000Z" },
  { prompt_hash: null, input_tokens: 7777, created_at: "2026-08-03T06:00:00.000Z" },
];

describe("ratio — zero denominator", () => {
  it("returns null instead of NaN or Infinity", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("utcDay", () => {
  it("normalizes offset timestamps to a UTC calendar day", () => {
    expect(utcDay("2026-08-04T08:00:00+09:00")).toBe("2026-08-03");
    expect(utcDay("2026-08-03T23:59:59.000Z")).toBe("2026-08-03");
  });

  it("drops unparseable timestamps", () => {
    expect(utcDay("not-a-date")).toBeNull();
  });
});

describe("metric 1 — writes per instructor per day", () => {
  const result = computeWritesPerInstructorPerDay(events);

  it("buckets only write operations by instructor and UTC day", () => {
    expect(result.rows).toEqual([
      { instructorId: "prof-a", date: "2026-08-03", writes: 3 },
      { instructorId: "prof-b", date: "2026-08-03", writes: 2 },
      { instructorId: "prof-a", date: "2026-08-04", writes: 1 },
    ]);
    expect(result.totalWrites).toBe(6);
    expect(result.instructorDays).toBe(3);
    expect(result.meanWritesPerInstructorDay).toBe(2);
    expect(result.maxWritesInADay).toBe(3);
  });

  it("reports null rather than zero when there are no writes yet", () => {
    const empty = computeWritesPerInstructorPerDay([]);
    expect(empty.rows).toEqual([]);
    expect(empty.totalWrites).toBe(0);
    expect(empty.instructorDays).toBe(0);
    expect(empty.meanWritesPerInstructorDay).toBeNull();
    expect(empty.maxWritesInADay).toBeNull();
  });

  it("ignores non-write operations entirely", () => {
    const onlyLifecycle = computeWritesPerInstructorPerDay(
      events.filter((event) => ["archive", "quarantine", "restore"].includes(event.operation)),
    );
    expect(onlyLifecycle.totalWrites).toBe(0);
    expect(onlyLifecycle.meanWritesPerInstructorDay).toBeNull();
  });
});

describe("metric 2 — contradiction rate", () => {
  it("divides supersede events by writes", () => {
    expect(computeContradictionRate(events)).toEqual({
      writes: 6,
      supersedes: 2,
      rate: 2 / 6,
    });
  });

  it("returns null when there are no writes yet, without dividing by zero", () => {
    const result = computeContradictionRate([]);
    expect(result).toEqual({ writes: 0, supersedes: 0, rate: null });
    expect(Number.isNaN(result.rate as unknown as number)).toBe(false);
  });

  it("returns 0 — not null — when there are writes but no contradictions", () => {
    const result = computeContradictionRate([
      { instructor_id: "prof-a", operation: "add", occurred_at: "2026-08-03T01:00:00.000Z" },
    ]);
    expect(result.rate).toBe(0);
  });
});

describe("metric 3 — memory token share of the prompt", () => {
  it("counts only prompt hashes present on both sides", () => {
    expect(computeMemoryTokenShare(snapshots, promptTokens)).toEqual({
      memoryTokens: 200,
      promptTokens: 2000,
      share: 0.1,
      matchedSnapshots: 2,
      unmatchedSnapshots: 2,
    });
  });

  it("returns null share when nothing matches, without dividing by zero", () => {
    const result = computeMemoryTokenShare(snapshots, []);
    expect(result.memoryTokens).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(result.share).toBeNull();
    expect(result.matchedSnapshots).toBe(0);
    expect(result.unmatchedSnapshots).toBe(4);
  });

  it("returns null share when there are no snapshots at all", () => {
    expect(computeMemoryTokenShare([], promptTokens).share).toBeNull();
  });

  it("treats null token counts as zero rather than NaN", () => {
    const result = computeMemoryTokenShare(
      [{ instructor_id: "p", estimated_tokens: null, prompt_hash: "h1", created_at: "2026-08-03T00:00:00.000Z" }],
      [{ prompt_hash: "h1", input_tokens: null, created_at: "2026-08-03T00:00:00.000Z" }],
    );
    expect(result.memoryTokens).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(result.share).toBeNull();
  });
});

describe("metric 4 — AI-proposed-score edit rate, before vs after release", () => {
  const withColumn: GradeRow[] = [
    // 릴리스 전: 제안 4건 중 1건 수정 → 0.25
    { created_at: "2026-08-01T00:00:00.000Z", grade_type: "auto", score: 8, ai_proposed_score: 8 },
    { created_at: "2026-08-02T00:00:00.000Z", grade_type: "manual", score: 7, ai_proposed_score: 8 },
    { created_at: "2026-08-03T00:00:00.000Z", grade_type: "auto", score: 9, ai_proposed_score: 9 },
    { created_at: "2026-08-04T00:00:00.000Z", grade_type: "auto", score: 5, ai_proposed_score: 5 },
    // 제안이 없는 행은 분모에서 빠진다
    { created_at: "2026-08-02T12:00:00.000Z", grade_type: "manual", score: 3, ai_proposed_score: null },
    // 릴리스 후: 제안 2건 중 1건 수정 → 0.5
    { created_at: "2026-08-06T00:00:00.000Z", grade_type: "manual", score: 6, ai_proposed_score: 9 },
    { created_at: "2026-08-07T00:00:00.000Z", grade_type: "auto", score: 4, ai_proposed_score: 4 },
  ];

  it("measures true edits when ai_proposed_score is present", () => {
    const shift = computeAiScoreEditRateShift(withColumn, RELEASE_AT);
    expect(shift.available).toBe(true);
    expect(shift.basis).toBe("ai_proposed_score");
    expect(shift.degradedReason).toBeNull();
    expect(shift.before).toEqual({ edited: 1, total: 4, rate: 0.25 });
    expect(shift.after).toEqual({ edited: 1, total: 2, rate: 0.5 });
    expect(shift.delta).toBe(0.25);
  });

  it("degrades to the manual-override rate when the column is absent, and says so", () => {
    // 이 워크트리의 grades 스키마에는 ai_proposed_score 가 없다. 값을 지어내지 않는다.
    const withoutColumn: GradeRow[] = [
      { created_at: "2026-08-01T00:00:00.000Z", grade_type: "auto", score: 8 },
      { created_at: "2026-08-02T00:00:00.000Z", grade_type: "manual", score: 7 },
      { created_at: "2026-08-06T00:00:00.000Z", grade_type: "manual", score: 6 },
      { created_at: "2026-08-07T00:00:00.000Z", grade_type: "manual", score: 4 },
    ];
    const shift = computeAiScoreEditRateShift(withoutColumn, RELEASE_AT);
    expect(shift.available).toBe(false);
    expect(shift.basis).toBe("grade_type_fallback");
    expect(shift.degradedReason).toContain("ai_proposed_score");
    expect(shift.before).toEqual({ edited: 1, total: 2, rate: 0.5 });
    expect(shift.after).toEqual({ edited: 2, total: 2, rate: 1 });
    expect(shift.delta).toBe(0.5);
  });

  it("returns null rates and a null delta when a window has no grades", () => {
    const shift = computeAiScoreEditRateShift([], RELEASE_AT);
    expect(shift.before.rate).toBeNull();
    expect(shift.after.rate).toBeNull();
    expect(shift.delta).toBeNull();
  });

  it("returns a null delta when only one side has data", () => {
    const shift = computeAiScoreEditRateShift(
      [{ created_at: "2026-08-06T00:00:00.000Z", grade_type: "manual", score: 4 }],
      RELEASE_AT,
    );
    expect(shift.before.rate).toBeNull();
    expect(shift.after.rate).toBe(1);
    expect(shift.delta).toBeNull();
  });
});

describe("computeMemoryMetrics — all four against one fixture", () => {
  const input: MemoryMetricsInput = {
    events,
    snapshots,
    promptTokens,
    grades: [
      { created_at: "2026-08-02T00:00:00.000Z", grade_type: "manual", score: 7 },
      { created_at: "2026-08-06T00:00:00.000Z", grade_type: "auto", score: 6 },
    ],
    releaseAt: RELEASE_AT,
  };

  it("produces the expected numbers", () => {
    const metrics = computeMemoryMetrics(input);
    expect(metrics.releaseAt).toBe(RELEASE_AT);
    expect(metrics.writesPerInstructorPerDay.totalWrites).toBe(6);
    expect(metrics.writesPerInstructorPerDay.meanWritesPerInstructorDay).toBe(2);
    expect(metrics.contradictionRate.rate).toBeCloseTo(0.3333333, 6);
    expect(metrics.memoryTokenShare.share).toBe(0.1);
    expect(metrics.aiScoreEditRateShift.before.rate).toBe(1);
    expect(metrics.aiScoreEditRateShift.after.rate).toBe(0);
    expect(metrics.aiScoreEditRateShift.delta).toBe(-1);
  });

  it("survives a completely empty deployment with nulls, not NaN", () => {
    const metrics = computeMemoryMetrics({
      events: [],
      snapshots: [],
      promptTokens: [],
      grades: [],
      releaseAt: RELEASE_AT,
    });

    const rates = [
      metrics.writesPerInstructorPerDay.meanWritesPerInstructorDay,
      metrics.contradictionRate.rate,
      metrics.memoryTokenShare.share,
      metrics.aiScoreEditRateShift.before.rate,
      metrics.aiScoreEditRateShift.after.rate,
      metrics.aiScoreEditRateShift.delta,
    ];
    for (const rate of rates) {
      expect(rate).toBeNull();
    }
    expect(JSON.stringify(metrics)).not.toContain("null,\"NaN\"");
    expect(JSON.stringify(metrics)).not.toContain("Infinity");
  });
});
