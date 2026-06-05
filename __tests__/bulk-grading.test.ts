import { describe, it, expect } from "vitest";
import {
  hasGradesForEveryExpectedQuestion,
  parseGradesFromAiResponse,
  buildProposedGradesMap,
  estimateTokenCount,
  selectCalibrationSampleSessionIds,
} from "@/lib/bulk-grading";

const SESSION_A = "11111111-1111-1111-1111-111111111111";
const SESSION_B = "22222222-2222-2222-2222-222222222222";
const UNKNOWN_SESSION = "99999999-9999-9999-9999-999999999999";

const validSessionIds = new Set([SESSION_A, SESSION_B]);
const validQIdxes = new Set([0, 1, 2]);

// ─── parseGradesFromAiResponse ────────────────────────────────────────────────

describe("parseGradesFromAiResponse", () => {
  it("parses a valid JSON block from AI response", () => {
    const content = `
채점 결과입니다.

\`\`\`json
{"grades": [{"session_id": "${SESSION_A}", "q_idx": 0, "score": 85, "comment": "잘 작성됨"}]}
\`\`\`
`;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ session_id: SESSION_A, q_idx: 0, score: 85 });
  });

  it("parses raw JSON with a top-level session_id from the worker prompt contract", () => {
    const content = JSON.stringify({
      session_id: SESSION_A,
      grades: [{ q_idx: 0, score: 88, comment: "근거가 명확함" }],
    });

    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ session_id: SESSION_A, q_idx: 0, score: 88 });
  });

  it("parses fenced JSON with a top-level session_id from the worker prompt contract", () => {
    const content = `
\`\`\`json
{"session_id":"${SESSION_A}","grades":[{"q_idx":1,"score":72,"comment":"핵심 개념 일부 누락"}]}
\`\`\`
`;

    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ session_id: SESSION_A, q_idx: 1, score: 72 });
  });

  it("returns null when no JSON block is present", () => {
    const result = parseGradesFromAiResponse("그냥 텍스트만 있습니다", validSessionIds, validQIdxes);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const content = "```json\n{ invalid json \n```";
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toBeNull();
  });

  it("returns null when grades array is empty", () => {
    const content = '```json\n{"grades": []}\n```';
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toBeNull();
  });

  it("clamps score to 0-100 range", () => {
    const content = `\`\`\`json\n{"grades": [{"session_id": "${SESSION_A}", "q_idx": 0, "score": 105, "comment": "test"}]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).not.toBeNull();
    expect(result![0].score).toBe(100);
  });

  it("clamps negative score to 0", () => {
    const content = `\`\`\`json\n{"grades": [{"session_id": "${SESSION_A}", "q_idx": 0, "score": -5, "comment": "test"}]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).not.toBeNull();
    expect(result![0].score).toBe(0);
  });

  // [T2] QA: AI hallucination — unknown session_id must be skipped
  it("skips grades with unknown session_id (hallucination defense)", () => {
    const content = `\`\`\`json\n{"grades": [
      {"session_id": "${UNKNOWN_SESSION}", "q_idx": 0, "score": 90, "comment": "fake"},
      {"session_id": "${SESSION_A}", "q_idx": 0, "score": 75, "comment": "real"}
    ]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toHaveLength(1);
    expect(result![0].session_id).toBe(SESSION_A);
  });

  // [T4] QA: q_idx out of range must be skipped
  it("skips grades with q_idx out of valid range", () => {
    const content = `\`\`\`json\n{"grades": [
      {"session_id": "${SESSION_A}", "q_idx": 99, "score": 80, "comment": "out of range"},
      {"session_id": "${SESSION_A}", "q_idx": 0, "score": 70, "comment": "valid"}
    ]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toHaveLength(1);
    expect(result![0].q_idx).toBe(0);
  });

  // [T3] QA: duplicate (session_id, q_idx) — last occurrence wins
  it("deduplicates (session_id, q_idx) — last occurrence wins", () => {
    const content = `\`\`\`json\n{"grades": [
      {"session_id": "${SESSION_A}", "q_idx": 0, "score": 60, "comment": "first"},
      {"session_id": "${SESSION_A}", "q_idx": 0, "score": 90, "comment": "last"}
    ]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toHaveLength(1);
    expect(result![0].score).toBe(90);
    expect(result![0].comment).toBe("last");
  });

  it("picks last JSON block when multiple are present", () => {
    const content = `
First block:
\`\`\`json
{"grades": [{"session_id": "${SESSION_A}", "q_idx": 0, "score": 50, "comment": "old"}]}
\`\`\`

Updated block:
\`\`\`json
{"grades": [{"session_id": "${SESSION_A}", "q_idx": 0, "score": 85, "comment": "new"}]}
\`\`\`
`;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result![0].score).toBe(85);
  });

  it("returns null for invalid session_id format (not UUID)", () => {
    const content = '```json\n{"grades": [{"session_id": "not-a-uuid", "q_idx": 0, "score": 80, "comment": "test"}]}\n```';
    const result = parseGradesFromAiResponse(content, new Set(["not-a-uuid"]), validQIdxes);
    // Zod UUID validation should fail
    expect(result).toBeNull();
  });

  it("handles multiple students and questions", () => {
    const content = `\`\`\`json\n{"grades": [
      {"session_id": "${SESSION_A}", "q_idx": 0, "score": 80, "comment": "A Q0"},
      {"session_id": "${SESSION_A}", "q_idx": 1, "score": 75, "comment": "A Q1"},
      {"session_id": "${SESSION_B}", "q_idx": 0, "score": 70, "comment": "B Q0"}
    ]}\n\`\`\``;
    const result = parseGradesFromAiResponse(content, validSessionIds, validQIdxes);
    expect(result).toHaveLength(3);
  });
});

// ─── buildProposedGradesMap ───────────────────────────────────────────────────

describe("buildProposedGradesMap", () => {
  it("builds nested map from grades array", () => {
    const grades = [
      { session_id: SESSION_A, q_idx: 0, score: 80, comment: "좋음" },
      { session_id: SESSION_A, q_idx: 1, score: 70, comment: "보통" },
      { session_id: SESSION_B, q_idx: 0, score: 90, comment: "우수" },
    ];
    const map = buildProposedGradesMap(grades);
    expect(map[SESSION_A][0]).toEqual({ score: 80, comment: "좋음" });
    expect(map[SESSION_A][1]).toEqual({ score: 70, comment: "보통" });
    expect(map[SESSION_B][0]).toEqual({ score: 90, comment: "우수" });
  });

  it("returns empty object for empty input", () => {
    const map = buildProposedGradesMap([]);
    expect(map).toEqual({});
  });

  it("last occurrence wins for duplicates", () => {
    const grades = [
      { session_id: SESSION_A, q_idx: 0, score: 60, comment: "first" },
      { session_id: SESSION_A, q_idx: 0, score: 80, comment: "last" },
    ];
    const map = buildProposedGradesMap(grades);
    expect(map[SESSION_A][0].score).toBe(80);
  });
});

// ─── hasGradesForEveryExpectedQuestion ───────────────────────────────────────

describe("hasGradesForEveryExpectedQuestion", () => {
  it("returns false when AI output omits an expected case question", () => {
    const grades = [
      { session_id: SESSION_A, q_idx: 0, score: 80, comment: "Q0" },
    ];

    expect(hasGradesForEveryExpectedQuestion(grades, [0, 1])).toBe(false);
  });

  it("returns true when every expected case question has a grade", () => {
    const grades = [
      { session_id: SESSION_A, q_idx: 0, score: 80, comment: "Q0" },
      { session_id: SESSION_A, q_idx: 1, score: 75, comment: "Q1" },
    ];

    expect(hasGradesForEveryExpectedQuestion(grades, [0, 1])).toBe(true);
  });
});

// ─── estimateTokenCount ───────────────────────────────────────────────────────

describe("estimateTokenCount", () => {
  it("estimates tokens as chars / 4", () => {
    expect(estimateTokenCount("aaaa")).toBe(1);
    expect(estimateTokenCount("a".repeat(400))).toBe(100);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});

// ─── selectCalibrationSampleSessionIds ───────────────────────────────────────

describe("selectCalibrationSampleSessionIds", () => {
  it("keeps existing valid sample ids fixed", () => {
    const result = selectCalibrationSampleSessionIds(
      [SESSION_A, SESSION_B],
      [SESSION_B],
      3,
      () => 0,
    );
    expect(result).toEqual([SESSION_B]);
  });

  it("filters stale sample ids that are no longer submitted", () => {
    const result = selectCalibrationSampleSessionIds(
      [SESSION_A, SESSION_B],
      [UNKNOWN_SESSION, SESSION_A],
      3,
      () => 0,
    );
    expect(result).toEqual([SESSION_A]);
  });

  it("returns all submitted ids when fewer than sample size", () => {
    const result = selectCalibrationSampleSessionIds(
      [SESSION_A, SESSION_B],
      [],
      3,
      () => 0,
    );
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set([SESSION_A, SESSION_B]));
  });

  it("selects one from each equal chunk for even distribution (random=0 picks start of each chunk)", () => {
    const sessionC = "33333333-3333-3333-3333-333333333333";
    const sessionD = "44444444-4444-4444-4444-444444444444";
    // n=4, sampleSize=3 → chunkSize≈1.33
    // chunk0: [0,1) → idx 0 = SESSION_A
    // chunk1: [1,2) → idx 1 = SESSION_B
    // chunk2: [2,4) → idx 2 = sessionC  (random=0 → start of chunk)
    const result = selectCalibrationSampleSessionIds(
      [SESSION_A, SESSION_B, sessionC, sessionD],
      [],
      3,
      () => 0,
    );
    expect(result).toEqual([SESSION_A, SESSION_B, sessionC]);
  });

  it("selects last element of each chunk when random=0.99", () => {
    const sessionC = "33333333-3333-3333-3333-333333333333";
    const sessionD = "44444444-4444-4444-4444-444444444444";
    // chunk2: [2,4), size=2 → floor(0.99*2)=1 → idx 3 = sessionD
    const result = selectCalibrationSampleSessionIds(
      [SESSION_A, SESSION_B, sessionC, sessionD],
      [],
      3,
      () => 0.99,
    );
    expect(result).toHaveLength(3);
    // last chunk [2,4) with random≈1 picks sessionD
    expect(result[2]).toEqual(sessionD);
  });
});
