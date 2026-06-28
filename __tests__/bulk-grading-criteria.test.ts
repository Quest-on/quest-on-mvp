import { describe, it, expect } from "vitest";
import {
  parseCriteriaReadyMarker,
  stripCriteriaReadyMarker,
  isInterviewReady,
  buildInterviewChatMeta,
} from "@/lib/bulk-grading-criteria";
import { MIN_BULK_GRADE_INTERVIEW_QUESTIONS } from "@/lib/bulk-grade-thread";

describe("parseCriteriaReadyMarker", () => {
  it("parses score_range from CRITERIA_READY block (min/max only)", () => {
    const content = `기준이 확정되었습니다.
[CRITERIA_READY]
{"score_range":{"min":70,"max":92,"notes":"이번 수업"}}
[/CRITERIA_READY]`;
    expect(parseCriteriaReadyMarker(content)).toEqual({
      min: 70,
      max: 92,
      notes: "이번 수업",
    });
  });

  it("returns null when marker is absent", () => {
    expect(parseCriteriaReadyMarker("아직 인터뷰 중")).toBeNull();
  });
});

describe("stripCriteriaReadyMarker", () => {
  it("removes marker from assistant-visible text", () => {
    const raw = `확인했습니다.\n[CRITERIA_READY]\n{"score_range":{"min":0,"max":100}}\n[/CRITERIA_READY]`;
    expect(stripCriteriaReadyMarker(raw)).toBe("확인했습니다.");
  });
});

describe("isInterviewReady", () => {
  it("is true when calibration_status is sample_review", () => {
    expect(isInterviewReady("sample_review")).toBe(true);
    expect(isInterviewReady("interviewing")).toBe(false);
  });
});

describe("buildInterviewChatMeta", () => {
  it("allows proceed after minimum interview rounds", () => {
    const messages = [
      { role: "assistant" as const, content: "첫 질문" },
      ...Array.from({ length: MIN_BULK_GRADE_INTERVIEW_QUESTIONS }, (_, i) => [
        { role: "user" as const, content: `답 ${i + 1}` },
        { role: "assistant" as const, content: `질문 ${i + 2}` },
      ]).flat(),
    ];
    const meta = buildInterviewChatMeta(messages, "interviewing");
    expect(meta.interviewQuestionCount).toBe(MIN_BULK_GRADE_INTERVIEW_QUESTIONS);
    expect(meta.canProceedToGrading).toBe(true);
    expect(meta.canStartGrading).toBe(false);
  });
});
