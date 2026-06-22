import { describe, expect, it } from "vitest";
import { computeAnswerIntegrityMetrics, resolvePasteAssessment } from "@/lib/answer-integrity";

describe("computeAnswerAuthenticityMetrics", () => {
  it("aggregates paste, typing, and AI metrics together", () => {
    const metrics = computeAnswerIntegrityMetrics({
      answerText: "최종 답안 본문입니다. 외부에서 가져온 내용을 수정했습니다.",
      sessionCreatedAt: "2026-06-11T01:00:00.000Z",
      submissionTime: "2026-06-11T01:20:00.000Z",
      answerUpdatedAt: "2026-06-11T01:19:00.000Z",
      pasteLogs: [
        {
          length: 30,
          is_internal: false,
          suspicious: true,
          timestamp: "2026-06-11T01:10:00.000Z",
          pasted_text: "외부에서 가져온 내용",
          paste_start: 0,
        },
      ],
      inputEvents: [
        { ts: Date.parse("2026-06-11T01:05:00.000Z"), kind: "paste", delta: 30, len: 30 },
        { ts: Date.parse("2026-06-11T01:11:00.000Z"), kind: "insert", delta: 5, len: 35 },
        { ts: Date.parse("2026-06-11T01:12:00.000Z"), kind: "delete", delta: -2, len: 33 },
        { ts: Date.parse("2026-06-11T01:13:00.000Z"), kind: "insert", delta: 10, len: 43 },
      ],
      aiMessages: [
        {
          role: "ai",
          content: "외부에서 가져온 내용과 유사한 AI 설명",
          created_at: "2026-06-11T01:08:00.000Z",
        },
      ],
    });

    expect(metrics.paste.occurred).toBe(true);
    expect(metrics.paste.external_paste_count).toBe(1);
    expect(metrics.paste.after_last_paste.chars_inserted).toBeGreaterThan(0);
    expect(metrics.typing.edit_ratio).toBeGreaterThan(0);
    expect(metrics.typing.has_write_edit_rewrite_pattern).toBe(true);
    expect(metrics.ai_usage.ai_to_final_answer_similarity).not.toBeNull();
    expect(metrics.unavailable_metrics).toContain("tab_switch_count");
  });
});

describe("resolvePasteAssessment", () => {
  it("returns analyzer paste_assessment when present", () => {
    const assessment = resolvePasteAssessment(
      {
        authenticity_score: 50,
        classification: "검토 권장",
        evidence: ["e"],
        risk_factors: [],
        reasoning_summary: "r",
        analyzed_at: "2026-01-01",
        paste_assessment: {
          external_paste_suspected: true,
          review_level: "중간",
          summary: "복합 검토 결과",
          evidence: ["외부 Paste 2회 + 수정 부족"],
        },
      },
      null
    );
    expect(assessment?.external_paste_suspected).toBe(true);
    expect(assessment?.review_level).toBe("중간");
  });
});
