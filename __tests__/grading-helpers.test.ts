import { describe, it, expect } from "vitest";
import {
  selectBestSubmission,
  decompressSubmissions,
  decompressMessages,
  normalizeQuestions,
  calculateWeightedScore,
  calculateAiDependencyPenalty,
  analyzeAiDependency,
  analyzeAssignmentResearchEngagement,
  summarizeAiDependencyAssessments,
  formatSummaryScoreLabel,
  resolveByQIdx,
  isAssignmentType,
  buildAssignmentScoreMap,
  isGradingOpen,
} from "@/lib/grading-helpers";

describe("isGradingOpen", () => {
  // Fixed reference point: 2026-06-16 (today per MEMORY). Tests use relative
  // ISO strings that are clearly in the past or future.
  const PAST = "2024-01-01T00:00:00Z";   // well before today
  const FUTURE = "2099-12-31T23:59:59Z"; // well after today

  describe("assignment (type='report')", () => {
    it("returns true when deadline is in the past", () => {
      expect(isGradingOpen({ type: "report", deadline: PAST })).toBe(true);
    });

    it("returns false when deadline is in the future", () => {
      expect(isGradingOpen({ type: "report", deadline: FUTURE })).toBe(false);
    });

    it("returns false when deadline is null (not yet set)", () => {
      expect(isGradingOpen({ type: "report", deadline: null })).toBe(false);
    });

    it("returns false when deadline is undefined", () => {
      expect(isGradingOpen({ type: "report" })).toBe(false);
    });

    it("ignores status field — assignment gate depends only on deadline", () => {
      expect(isGradingOpen({ type: "report", status: "closed", deadline: FUTURE })).toBe(false);
      expect(isGradingOpen({ type: "report", status: "draft",  deadline: PAST  })).toBe(true);
    });
  });

  describe("exam (type='exam' or null/undefined)", () => {
    it("returns true when status is 'closed'", () => {
      expect(isGradingOpen({ type: "exam",  status: "closed" })).toBe(true);
      expect(isGradingOpen({ type: null,    status: "closed" })).toBe(true);
      expect(isGradingOpen({ type: undefined, status: "closed" })).toBe(true);
    });

    it("returns false when status is 'draft'", () => {
      expect(isGradingOpen({ type: "exam", status: "draft" })).toBe(false);
    });

    it("returns false when status is 'open'", () => {
      expect(isGradingOpen({ type: "exam", status: "open" })).toBe(false);
    });

    it("returns false when status is null", () => {
      expect(isGradingOpen({ type: "exam", status: null })).toBe(false);
    });

    it("ignores deadline field — exam gate depends only on status", () => {
      // Past deadline should not make a non-closed exam gradable
      expect(isGradingOpen({ type: "exam", status: "open", deadline: PAST })).toBe(false);
      // Future deadline should not block a closed exam
      expect(isGradingOpen({ type: "exam", status: "closed", deadline: FUTURE })).toBe(true);
    });
  });
});

describe("isAssignmentType", () => {
  it("treats every non-exam task type as an assignment", () => {
    for (const type of ["report", "code", "erd", "mindmap", "assignment"]) {
      expect(isAssignmentType(type)).toBe(true);
    }
  });

  it("treats exam and empty/null type as not an assignment", () => {
    expect(isAssignmentType("exam")).toBe(false);
    expect(isAssignmentType(null)).toBe(false);
    expect(isAssignmentType(undefined)).toBe(false);
  });
});

describe("buildAssignmentScoreMap", () => {
  it("maps session_id → score for valid numeric scores", () => {
    const map = buildAssignmentScoreMap([
      { session_id: "s1", score: 82 },
      { session_id: "s2", score: 0 },
      { session_id: "s3", score: 100 },
    ]);
    expect(map.get("s1")).toBe(82);
    expect(map.get("s2")).toBe(0); // 0점도 유효한 확정 점수
    expect(map.get("s3")).toBe(100);
    expect(map.size).toBe(3);
  });

  it("preserves the raw AI score without rounding to grade bands (82 stays 82)", () => {
    const map = buildAssignmentScoreMap([{ session_id: "s1", score: 82 }]);
    expect(map.get("s1")).toBe(82);
  });

  it("excludes rows with non-finite or non-number scores so ungraded items never show as 0", () => {
    const map = buildAssignmentScoreMap([
      { session_id: "s1", score: null },
      { session_id: "s2", score: undefined },
      { session_id: "s3", score: "85" },
      { session_id: "s4", score: NaN },
    ]);
    expect(map.size).toBe(0);
  });

  it("returns an empty map for no rows", () => {
    expect(buildAssignmentScoreMap([]).size).toBe(0);
  });
});

describe("resolveByQIdx", () => {
  // 회귀: 채점 페이지가 question.idx 로만 조회해, idx ≠ 배열 위치인 시험에서
  // 답안/채팅이 빈 값으로 빠지던 버그. [idx, 배열위치] 폴백으로 복구한다.
  const submissions = { 17: { answer: "essay-A" }, 18: { answer: "essay-B" } };

  it("idx ≠ 배열 위치일 때 배열 위치 키로 폴백한다", () => {
    // question.idx 22 → 저장은 배열 위치 17
    expect(resolveByQIdx(submissions, [22, 17])).toEqual({ answer: "essay-A" });
  });

  it("idx == 배열 위치인 일반 시험은 그대로 첫 키로 찾는다", () => {
    expect(resolveByQIdx(submissions, [17, 17])).toEqual({ answer: "essay-A" });
  });

  it("앞선 키에 값이 있으면 그 값을 우선한다", () => {
    const both = { 17: "pos", 22: "idx" };
    expect(resolveByQIdx(both, [22, 17])).toBe("idx");
  });

  it("어느 키에도 값이 없으면 undefined", () => {
    expect(resolveByQIdx(submissions, [22, 23])).toBeUndefined();
  });

  it("빈 배열 값도 정의된 값으로 취급한다(메시지 빈 배열)", () => {
    const messages = { 17: [] as unknown[] };
    expect(resolveByQIdx(messages, [22, 17])).toEqual([]);
  });

  it("record 가 없으면 undefined", () => {
    expect(resolveByQIdx(undefined, [1, 2])).toBeUndefined();
    expect(resolveByQIdx(null, [1, 2])).toBeUndefined();
  });
});

describe("selectBestSubmission", () => {
  it("uses deterministic id-based tiebreak when timestamps match", () => {
    const subs = [
      { id: "aaa", answer: "short", created_at: "2024-01-01T00:00:00Z" },
      { id: "bbb", answer: "a longer answer here", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    // Higher id wins (deterministic, not answer-length-based)
    expect(best.id).toBe("bbb");
  });

  it("prefers the most recent when answers are equal length", () => {
    const subs = [
      { answer: "same", created_at: "2024-01-01T00:00:00Z" },
      { answer: "same", created_at: "2024-06-15T12:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.created_at).toBe("2024-06-15T12:00:00Z");
  });

  it("returns the only submission when there is one", () => {
    const subs = [{ answer: "only one", created_at: "2024-01-01T00:00:00Z" }];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("only one");
  });

  it("handles empty answer strings", () => {
    const subs = [
      { answer: "", created_at: "2024-06-15T12:00:00Z" },
      { answer: "", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    // Both empty, should pick the more recent one
    expect(best.created_at).toBe("2024-06-15T12:00:00Z");
  });

  it("handles null/undefined answer", () => {
    const subs = [
      { answer: null, created_at: "2024-01-01T00:00:00Z" },
      { answer: "has answer", created_at: "2024-01-02T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("has answer");
  });

  it("prefers submitted over draft even if draft has longer answer", () => {
    const subs = [
      { answer: "a very long draft auto-saved answer", created_at: "2024-01-01T00:00:00Z", submitted_at: null },
      { answer: "short final", created_at: "2024-01-02T00:00:00Z", submitted_at: "2024-01-02T00:01:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("short final");
  });

  it("prefers most recent submission when both are submitted", () => {
    const subs = [
      { answer: "first submit", created_at: "2024-01-01T00:00:00Z", submitted_at: "2024-01-01T00:01:00Z" },
      { answer: "second submit", created_at: "2024-01-02T00:00:00Z", submitted_at: "2024-01-02T00:01:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("second submit");
  });

  it("prefers most recent draft when neither is submitted", () => {
    const subs = [
      { answer: "old draft with more text", created_at: "2024-01-01T00:00:00Z" },
      { answer: "new draft", created_at: "2024-01-02T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("new draft");
  });

  it("prefers non-empty answer over empty auto-save with same status (P0-3)", () => {
    const subs = [
      { answer: "", created_at: "2024-01-01T00:01:00Z" },
      { answer: "my actual answer with content", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("my actual answer with content");
  });

  it("prefers non-empty answer over whitespace-only answer (P0-3)", () => {
    const subs = [
      { answer: "   \n  ", created_at: "2024-01-01T00:02:00Z" },
      { answer: "real answer", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("real answer");
  });

  it("uses created_at tiebreak when both have content (P0-3)", () => {
    const subs = [
      { answer: "first version", created_at: "2024-01-01T00:00:00Z" },
      { answer: "second version", created_at: "2024-01-01T00:05:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("second version");
  });

  it("handles auto-submit race: auto-submit empty vs manual submit", () => {
    const subs = [
      { answer: "", created_at: "2024-01-01T00:00:00Z", submitted_at: "2024-01-01T00:30:00Z" },
      { answer: "my real answer", created_at: "2024-01-01T00:01:00Z", submitted_at: "2024-01-01T00:30:05Z" },
    ];
    const best = selectBestSubmission(subs);
    // Both submitted — should pick the more recent one
    expect(best.answer).toBe("my real answer");
  });
});

describe("decompressSubmissions", () => {
  it("groups by q_idx and picks best", () => {
    const submissions = [
      { q_idx: 0, answer: "short", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 0, answer: "longer answer", created_at: "2024-01-02T00:00:00Z" },
      { q_idx: 1, answer: "q1 answer", created_at: "2024-01-01T00:00:00Z" },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[0].answer).toBe("longer answer");
    expect(result[1].answer).toBe("q1 answer");
  });

  it("returns empty object for empty array", () => {
    expect(decompressSubmissions([])).toEqual({});
  });

  it("returns empty object for null/undefined", () => {
    expect(decompressSubmissions(null as unknown as Array<Record<string, unknown>>)).toEqual({});
  });

  it("handles duplicate q_idx entries — picks most recent", () => {
    const submissions = [
      { q_idx: 2, answer: "first", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 2, answer: "second longer", created_at: "2024-01-02T00:00:00Z" },
      { q_idx: 2, answer: "third", created_at: "2024-01-03T00:00:00Z" },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[2].answer).toBe("third");
  });

  it("falls back to raw answer when decompression fails", () => {
    const submissions = [
      {
        q_idx: 0,
        answer: "raw fallback",
        compressed_answer_data: "invalid_compressed_data",
        created_at: "2024-01-01T00:00:00Z",
      },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[0].answer).toBe("raw fallback");
  });
});

describe("decompressMessages", () => {
  it("groups messages by q_idx", () => {
    const messages = [
      { q_idx: 0, role: "user", content: "hello", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 0, role: "assistant", content: "hi", created_at: "2024-01-01T00:01:00Z" },
      { q_idx: 1, role: "user", content: "q1", created_at: "2024-01-01T00:02:00Z" },
    ];
    const result = decompressMessages(messages);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(1);
    expect(result[0][0].content).toBe("hello");
  });

  it("returns empty object for empty array", () => {
    expect(decompressMessages([])).toEqual({});
  });

  it("returns empty object for null/undefined", () => {
    expect(decompressMessages(null as unknown as Array<Record<string, unknown>>)).toEqual({});
  });

  it("falls back to raw content when decompression fails", () => {
    const messages = [
      {
        q_idx: 0,
        role: "user",
        content: "fallback content",
        compressed_content: "invalid_data",
      },
    ];
    const result = decompressMessages(messages);
    expect(result[0][0].content).toBe("fallback content");
  });
});

describe("normalizeQuestions", () => {
  it("maps text to prompt when prompt is missing", () => {
    const questions = [{ text: "What is 2+2?", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].prompt).toBe("What is 2+2?");
    expect(result[0].idx).toBe(0);
  });

  it("prefers prompt over text", () => {
    const questions = [{ text: "text field", prompt: "prompt field", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].prompt).toBe("prompt field");
  });

  it("uses array index when idx is not present", () => {
    const questions = [{ text: "first" }, { text: "second" }];
    const result = normalizeQuestions(questions);
    expect(result[0].idx).toBe(0);
    expect(result[1].idx).toBe(1);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions(undefined)).toEqual([]);
    expect(normalizeQuestions("string")).toEqual([]);
  });

  it("converts string idx to number (P0-3)", () => {
    const questions = [{ text: "q1", idx: "2" }, { text: "q2", idx: "0" }];
    const result = normalizeQuestions(questions);
    expect(result[0].idx).toBe(2);
    expect(result[1].idx).toBe(0);
    expect(typeof result[0].idx).toBe("number");
  });

  it("falls back to array index for NaN idx (P0-3)", () => {
    const questions = [{ text: "q1", idx: "abc" }, { text: "q2", idx: NaN }];
    const result = normalizeQuestions(questions);
    expect(result[0].idx).toBe(0);
    expect(result[1].idx).toBe(1);
  });

  it("handles non-sequential idx values (P0-1)", () => {
    const questions = [
      { text: "q1", idx: 5 },
      { text: "q2", idx: 10 },
      { text: "q3", idx: 0 },
    ];
    const result = normalizeQuestions(questions);
    expect(result[0].idx).toBe(5);
    expect(result[1].idx).toBe(10);
    expect(result[2].idx).toBe(0);
  });

  it("preserves ai_context", () => {
    const questions = [{ text: "q", ai_context: "context info", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].ai_context).toBe("context info");
  });

  it("sets ai_context to undefined for non-string values", () => {
    const questions = [{ text: "q", ai_context: 123, idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].ai_context).toBeUndefined();
  });
});

describe("analyzeAiDependency", () => {
  it("detects delegation and starting-point dependency without recovery", () => {
    const assessment = analyzeAiDependency({
      messages: [
        { role: "user", content: "이 문제 어떻게 풀어?" },
        { role: "assistant", content: "먼저 조건을 정리한 뒤 에너지 보존을 적용하세요." },
        { role: "user", content: "정답만 알려줘." },
        { role: "assistant", content: "정답은 42입니다." },
      ],
      finalAnswer: "정답은 42이다.",
    });

    expect(assessment.delegationRequestCount).toBeGreaterThan(0);
    expect(assessment.directAnswerRequestCount).toBeGreaterThan(0);
    expect(assessment.recoveryObserved).toBe(false);
    expect(assessment.overallRisk).toBe("high");
    expect(assessment.penaltyApplied).toBeGreaterThan(0);
  });

  it("recognizes independent-reasoning recovery after AI help", () => {
    const assessment = analyzeAiDependency({
      messages: [
        { role: "user", content: "어떤 개념을 써야 해?" },
        { role: "assistant", content: "등온 과정이므로 내부에너지 변화는 0입니다." },
        {
          role: "user",
          content:
            "그러면 제 생각에는 먼저 등온 과정이라서 ΔU=0을 두고, 주어진 조건을 보면 Q=W 관계로 정리할 수 있습니다.",
        },
      ],
      finalAnswer:
        "등온 과정이라 내부에너지 변화는 0이고, 따라서 공급된 열량과 한 일의 크기가 같습니다.",
    });

    expect(assessment.startingPointDependencyCount).toBeGreaterThan(0);
    expect(assessment.recoveryObserved).toBe(true);
    expect(assessment.recoveryEvidence.length).toBeGreaterThan(0);
    expect(["low", "medium"]).toContain(assessment.overallRisk);
  });
});

describe("analyzeAssignmentResearchEngagement", () => {
  it("treats follow-up and verification questions as positive research signals", () => {
    const assessment = analyzeAssignmentResearchEngagement({
      messages: [
        { role: "user", content: "A와 B의 차이가 뭐야?" },
        { role: "assistant", content: "A는 ... B는 ..." },
        { role: "user", content: "그 근거는 실제로 맞아? 반례는 없어?" },
        { role: "assistant", content: "일반적으로는 ..." },
        { role: "user", content: "그러면 과제 요구사항에 맞추면 핵심은 뭐야?" },
      ],
      finalAnswer: "핵심은 ...",
    });

    expect(assessment.evaluationMode).toBe("assignment");
    expect(assessment.assignmentMetrics?.followUpQuestionCount).toBeGreaterThan(0);
    expect(assessment.assignmentMetrics?.verificationQuestionCount).toBeGreaterThan(0);
    expect(assessment.startingPointDependencyCount).toBe(0);
    expect(assessment.penaltyApplied).toBe(0);
    expect(assessment.overallRisk).toBe("low");
    expect(assessment.recoveryObserved).toBe(true);
  });

  it("flags answer-delegation without research flow", () => {
    const assessment = analyzeAssignmentResearchEngagement({
      messages: [
        { role: "user", content: "모르겠어 그냥 답 써줘" },
        { role: "assistant", content: "..." },
        { role: "user", content: "완성된 보고서 써줘" },
      ],
      finalAnswer: "...",
    });

    expect(assessment.assignmentMetrics?.answerDelegationCount).toBeGreaterThan(0);
    expect(["medium", "high"]).toContain(assessment.overallRisk);
  });
});

describe("formatSummaryScoreLabel", () => {
  it("uses 미채점 for submitted case questions without a grade", () => {
    expect(
      formatSummaryScoreLabel({
        hasSubmission: true,
        questionType: "essay",
      })
    ).toBe("미채점");
  });

  it("uses 미채점 for explicit ungraded case placeholders", () => {
    expect(
      formatSummaryScoreLabel({
        score: 0,
        ungraded: true,
        hasSubmission: true,
        questionType: "short-answer",
      })
    ).toBe("미채점");
  });

  it("keeps a real manual zero distinct from ungraded", () => {
    expect(
      formatSummaryScoreLabel({
        score: 0,
        hasSubmission: true,
        questionType: "essay",
      })
    ).toBe("0점");
  });

  it("does not mark missing objective grades as case 미채점", () => {
    expect(
      formatSummaryScoreLabel({
        hasSubmission: true,
        questionType: "multiple-choice",
      })
    ).toBe("0점");
  });
});

describe("summarizeAiDependencyAssessments", () => {
  it("aggregates per-question dependency signals", () => {
    const summary = summarizeAiDependencyAssessments([
      {
        q_idx: 0,
        assessment: analyzeAiDependency({
          messages: [
            { role: "user", content: "정답만 알려줘." },
            { role: "assistant", content: "정답은 42입니다." },
          ],
          finalAnswer: "정답은 42이다.",
        }),
      },
      {
        q_idx: 1,
        assessment: analyzeAiDependency({
          messages: [
            { role: "user", content: "어떤 개념을 써야 해?" },
            { role: "assistant", content: "등온 과정입니다." },
            {
              role: "user",
              content: "정리하면 등온이므로 ΔU=0이고, 그래서 Q와 W를 비교하면 됩니다.",
            },
          ],
          finalAnswer: "등온 과정이라 ΔU=0이다.",
        }),
      },
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.triggerCount).toBeGreaterThan(0);
    expect(summary?.questionBreakdown).toHaveLength(2);
  });
});

describe("calculateWeightedScore", () => {
  it("calculates 50/50 weighted average by default", () => {
    const result = calculateWeightedScore({
      chat: { score: 80 },
      answer: { score: 60 },
    });
    expect(result).toBe(70); // (80*0.5 + 60*0.5)
  });

  it("applies custom weight", () => {
    const result = calculateWeightedScore(
      { chat: { score: 100 }, answer: { score: 0 } },
      30
    );
    expect(result).toBe(30); // (100*0.3 + 0*0.7)
  });

  it("uses chat score alone when answer is missing", () => {
    const result = calculateWeightedScore({ chat: { score: 85 } });
    expect(result).toBe(85);
  });

  it("uses answer score alone when chat is missing", () => {
    const result = calculateWeightedScore({ answer: { score: 72 } });
    expect(result).toBe(72);
  });

  it("returns 0 when both stages are missing", () => {
    const result = calculateWeightedScore({});
    expect(result).toBe(0);
  });

  it("clamps score to 0-100 range", () => {
    expect(
      calculateWeightedScore({
        chat: { score: 150 },
        answer: { score: 150 },
      })
    ).toBe(100);

    expect(
      calculateWeightedScore({
        chat: { score: -50 },
        answer: { score: -50 },
      })
    ).toBe(0);
  });

  it("throws on NaN chat score (P1-3)", () => {
    expect(() =>
      calculateWeightedScore({ chat: { score: NaN } })
    ).toThrow("not a finite number");
  });

  it("throws on Infinity answer score (P1-3)", () => {
    expect(() =>
      calculateWeightedScore({ answer: { score: Infinity } })
    ).toThrow("not a finite number");
  });

  it("throws on -Infinity chat score (P1-3)", () => {
    expect(() =>
      calculateWeightedScore({ chat: { score: -Infinity } })
    ).toThrow("not a finite number");
  });
});

describe("calculateAiDependencyPenalty", () => {
  it("uses Math.floor for recovery penalty (P1-10)", () => {
    // A penalty that would differ between Math.round and Math.floor
    // delegation: 8, starting: 5 → base 13, recovery: floor(13*0.45)=floor(5.85)=5
    const penalty = calculateAiDependencyPenalty({
      delegationRequestCount: 1,
      startingPointDependencyCount: 1,
      directAnswerRequestCount: 0,
      directAnswerRelianceCount: 0,
      finalAnswerOverlapScore: 0,
      recoveryObserved: true,
    });
    // floor(13 * 0.45) = floor(5.85) = 5 (Math.round would give 6)
    expect(penalty).toBe(5);
  });

  it("returns 0 for no dependency signals", () => {
    const penalty = calculateAiDependencyPenalty({
      delegationRequestCount: 0,
      startingPointDependencyCount: 0,
      directAnswerRequestCount: 0,
      directAnswerRelianceCount: 0,
      finalAnswerOverlapScore: 0,
      recoveryObserved: false,
    });
    expect(penalty).toBe(0);
  });
});
