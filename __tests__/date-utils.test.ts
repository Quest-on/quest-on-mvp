import { describe, expect, it } from "vitest";
import { isoToKSTDateString } from "@/lib/date-utils";

describe("isoToKSTDateString", () => {
  /**
   * Round-trip test: create 페이지와 동일한 변환 공식
   *   date "YYYY-MM-DD"  →  new Date(date + "T23:59:00+09:00").toISOString()  →  isoToKSTDateString(iso)
   * 결과가 원래 날짜 문자열과 일치해야 한다.
   */
  it("round-trips through the create-page deadline formula", () => {
    const dateStr = "2026-06-10";
    const iso = new Date(dateStr + "T23:59:00+09:00").toISOString();
    expect(isoToKSTDateString(iso)).toBe(dateStr);
  });

  it("round-trips for an earlier date", () => {
    const dateStr = "2025-01-01";
    const iso = new Date(dateStr + "T23:59:00+09:00").toISOString();
    expect(isoToKSTDateString(iso)).toBe(dateStr);
  });

  it("round-trips for a date in a month with leading zero", () => {
    const dateStr = "2026-03-05";
    const iso = new Date(dateStr + "T23:59:00+09:00").toISOString();
    expect(isoToKSTDateString(iso)).toBe(dateStr);
  });

  it("returns empty string for null", () => {
    expect(isoToKSTDateString(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(isoToKSTDateString(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(isoToKSTDateString("")).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(isoToKSTDateString("not-a-date")).toBe("");
  });

  it("returns empty string for random garbage", () => {
    expect(isoToKSTDateString("2026-99-99")).toBe("");
  });
});
