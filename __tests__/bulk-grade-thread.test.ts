import { describe, it, expect } from "vitest";
import {
  resolveSendMode,
  orderThreadItems,
  isNearBottom,
  countInterviewQuestions,
  formatPickedQACriteria,
  type SendModeState,
} from "@/lib/bulk-grade-thread";

const baseState: SendModeState = {
  committed: false,
  isGrading: false,
  gradingDone: false,
  gradingFailed: false,
  regradeArmed: false,
};

describe("resolveSendMode", () => {
  it("committed → discuss (start would 409 + wipe proposed grades)", () => {
    expect(
      resolveSendMode({ ...baseState, committed: true, gradingDone: true, regradeArmed: true }),
    ).toBe("discuss");
  });

  it("isGrading → discuss (start would 409 mid-run)", () => {
    expect(
      resolveSendMode({ ...baseState, isGrading: true, regradeArmed: true }),
    ).toBe("discuss");
  });

  it("regradeArmed (not committed/grading) → start", () => {
    expect(
      resolveSendMode({ ...baseState, gradingDone: true, regradeArmed: true }),
    ).toBe("start");
  });

  it("gradingDone && !regradeArmed → discuss", () => {
    expect(resolveSendMode({ ...baseState, gradingDone: true })).toBe("discuss");
  });

  it("gradingFailed && !regradeArmed → discuss", () => {
    expect(resolveSendMode({ ...baseState, gradingFailed: true })).toBe("discuss");
  });

  it("cold start (no run yet) → start", () => {
    expect(resolveSendMode(baseState)).toBe("start");
  });
});

describe("orderThreadItems", () => {
  it("sorts ascending by ts so newer items land at the bottom", () => {
    const items = [
      { id: "c", ts: 300 },
      { id: "a", ts: 100 },
      { id: "b", ts: 200 },
    ];
    expect(orderThreadItems(items).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by explicit seq", () => {
    const items = [
      { id: "result", ts: 500, seq: 2 },
      { id: "criteria", ts: 500, seq: 0 },
      { id: "status", ts: 500, seq: 1 },
    ];
    expect(orderThreadItems(items).map((i) => i.id)).toEqual([
      "criteria",
      "status",
      "result",
    ]);
  });

  it("is stable for equal ts with no seq (input order preserved)", () => {
    const items = [
      { id: "first", ts: 10 },
      { id: "second", ts: 10 },
      { id: "third", ts: 10 },
    ];
    expect(orderThreadItems(items).map((i) => i.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

describe("isNearBottom", () => {
  it("true when exactly at bottom", () => {
    expect(
      isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it("true at the threshold boundary (48px gap)", () => {
    expect(
      isNearBottom({ scrollTop: 852, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it("false just past the threshold (49px gap)", () => {
    expect(
      isNearBottom({ scrollTop: 851, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(
      isNearBottom(
        { scrollTop: 800, scrollHeight: 1000, clientHeight: 100 },
        100,
      ),
    ).toBe(true);
  });
});

describe("countInterviewQuestions", () => {
  it("no messages → 0", () => {
    expect(countInterviewQuestions([])).toBe(0);
  });

  it("only an assistant welcome message, no user message → 0", () => {
    expect(
      countInterviewQuestions([{ role: "assistant", content: "안녕하세요! 채점 기준을 알려주세요." }]),
    ).toBe(0);
  });

  it("welcome + user answer + 1 AI question → 1 (excludes welcome)", () => {
    const messages = [
      { role: "assistant" as const, content: "안녕하세요! 채점 기준을 알려주세요." },
      { role: "user" as const, content: "논리 40·완성도 30·개념 30" },
      { role: "assistant" as const, content: "문항 길이에 따라 점수 차등을 두나요?" },
    ];
    expect(countInterviewQuestions(messages)).toBe(1);
  });

  it("welcome + user + Q1 + user + Q2 → 2", () => {
    const messages = [
      { role: "assistant" as const, content: "채점 기준을 알려주세요." },
      { role: "user" as const, content: "핵심 개념 중심" },
      { role: "assistant" as const, content: "표현 실수는 얼마나 감점하나요?" },
      { role: "user" as const, content: "관대하게 봐주세요" },
      { role: "assistant" as const, content: "부분 점수는 어떻게 처리할까요?" },
    ];
    expect(countInterviewQuestions(messages)).toBe(2);
  });

  it("messages starting with user (no welcome assistant) → counts assistant msgs after first user", () => {
    const messages = [
      { role: "user" as const, content: "채점 시작" },
      { role: "assistant" as const, content: "첫 번째 질문" },
      { role: "assistant" as const, content: "두 번째 질문" },
    ];
    expect(countInterviewQuestions(messages)).toBe(2);
  });

  it("no user message at all (only assistant messages) → 0", () => {
    const messages = [
      { role: "assistant" as const, content: "welcome" },
      { role: "assistant" as const, content: "follow-up" },
    ];
    expect(countInterviewQuestions(messages)).toBe(0);
  });
});

describe("formatPickedQACriteria", () => {
  it("empty picks → empty string", () => {
    expect(formatPickedQACriteria([])).toBe("");
  });

  it("single pick → correct format with header", () => {
    const result = formatPickedQACriteria([{ q: "부분 점수를 줄까요?", a: "네" }]);
    expect(result).toContain("---");
    expect(result).toContain("추가 기준 (채팅 Q&A에서 도출):");
    expect(result).toContain("Q: 부분 점수를 줄까요?");
    expect(result).toContain("A: 네");
  });

  it("multiple picks → all Q&A pairs included", () => {
    const result = formatPickedQACriteria([
      { q: "Q1", a: "A1" },
      { q: "Q2", a: "A2" },
    ]);
    expect(result).toContain("Q: Q1\nA: A1");
    expect(result).toContain("Q: Q2\nA: A2");
  });

  it("preserves exact question and answer text", () => {
    const q = "핵심 개념 정확성을 가장 중요하게 볼까요?";
    const a = "아니요, 논리 구조가 더 중요합니다";
    const result = formatPickedQACriteria([{ q, a }]);
    expect(result).toContain(q);
    expect(result).toContain(a);
  });

  it("concatenation with base text works without double-separator", () => {
    const base = "논리 40·완성도 30·개념 30";
    const result = base + formatPickedQACriteria([{ q: "Q", a: "A" }]);
    expect(result.startsWith(base)).toBe(true);
    expect(result).toContain("---");
  });
});
