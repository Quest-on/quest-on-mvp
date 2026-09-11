import { describe, expect, it } from "vitest";
import { isGradingOpen } from "@/lib/grading-helpers";

describe("isGradingOpen demo gate", () => {
  it("opens a draft demo exam", () => {
    expect(isGradingOpen({ is_demo: true, type: "exam", status: "draft" })).toBe(true);
  });

  it("opens a demo assignment without a deadline", () => {
    expect(isGradingOpen({ is_demo: true, type: "report", deadline: null })).toBe(true);
  });

  it("preserves the draft gate for non-demo exams", () => {
    expect(isGradingOpen({ is_demo: false, type: "exam", status: "draft" })).toBe(false);
  });

  it("preserves the closed gate when is_demo is omitted", () => {
    expect(isGradingOpen({ type: "exam", status: "closed" })).toBe(true);
  });

  it("preserves assignment deadline gates when is_demo is omitted", () => {
    expect(
      isGradingOpen({ type: "report", deadline: "2024-01-01T00:00:00Z" }),
    ).toBe(true);
    expect(
      isGradingOpen({ type: "report", deadline: "2099-12-31T23:59:59Z" }),
    ).toBe(false);
  });

  it("uses the existing gate when is_demo is undefined", () => {
    expect(
      isGradingOpen({ is_demo: undefined, type: "exam", status: "draft" }),
    ).toBe(false);
  });
});
