import { describe, expect, it } from "vitest";
import { buildMemoryExtractionSystemPrompt } from "@/lib/prompts";

const emojiPattern = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("buildMemoryExtractionSystemPrompt", () => {
  const prompt = buildMemoryExtractionSystemPrompt();

  it("lists every machine-supported commitment value", () => {
    for (const commitment of [
      "asserted",
      "tentative",
      "hypothetical",
      "reported",
      "negated",
    ]) {
      expect(prompt).toContain(commitment);
    }
  });

  it("bans every specified sensitive category", () => {
    for (const category of ["건강", "정치", "종교", "장애", "노조", "특정 학생 관련 특성"]) {
      expect(prompt).toContain(category);
    }
  });

  it("requires an empty array when no candidate survives", () => {
    expect(prompt).toContain("빈 배열 []");
  });

  it("contains no emoji", () => {
    expect(prompt).not.toMatch(emojiPattern);
  });

  it("keeps Korean politeness hedging independent from commitment", () => {
    expect(prompt).toContain("공손성 완화 표현은 commitment를 낮추지 않습니다");
    expect(prompt).toContain("가능하면 계산 문제는 조금 줄여주시면 좋겠습니다");
    expect(prompt).toContain("ASSERTION");
    expect(prompt).toContain("tentative가 아닙니다");
  });

  it("requires both evidence quote and span", () => {
    expect(prompt).toContain("evidence.quote와 evidence.span을 반드시 포함");
    expect(prompt).toContain("verbatim");
    expect(prompt).toContain("문자 오프셋");
  });

  it("does not mention predicates outside the closed vocabulary", () => {
    for (const forbidden of ["authoring.", "rubric_mode", "late_policy", "operations."]) {
      expect(prompt).not.toContain(forbidden);
    }
  });
});
