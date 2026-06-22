import { describe, it, expect } from "vitest";
import {
  parseCriteriaReadyMarker,
  stripCriteriaReadyMarker,
  isInterviewReady,
} from "@/lib/bulk-grading-criteria";

describe("parseCriteriaReadyMarker", () => {
  it("parses score_range from CRITERIA_READY block", () => {
    const content = `기준이 확정되었습니다.
[CRITERIA_READY]
{"score_range":{"min":0,"max":100,"typical_min":52,"typical_max":70,"excellent_min":82}}
[/CRITERIA_READY]`;
    expect(parseCriteriaReadyMarker(content)).toEqual({
      min: 0,
      max: 100,
      typical_min: 52,
      typical_max: 70,
      excellent_min: 82,
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
