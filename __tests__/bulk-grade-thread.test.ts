import { describe, it, expect } from "vitest";
import {
  resolveSendMode,
  orderThreadItems,
  isNearBottom,
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
