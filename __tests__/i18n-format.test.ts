import { describe, it, expect } from "vitest";
import { formatDate, formatNumber, formatDateTime } from "@/lib/i18n/format";

describe("i18n format", () => {
  const d = new Date("2026-01-02T03:04:00Z");

  it("연도를 두 로케일 모두 포함한다", () => {
    expect(formatDate(d, "ko")).toContain("2026");
    expect(formatDate(d, "en")).toContain("2026");
  });

  it("en 날짜는 영문 월 이름을 쓴다", () => {
    expect(formatDate(d, "en")).toMatch(/January/);
  });

  it("숫자를 로케일별로 포맷한다", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234567, "ko")).toBe("1,234,567");
  });

  it("문자열/타임스탬프 입력도 처리한다", () => {
    expect(formatDateTime("2026-01-02T03:04:00Z", "en")).toContain("2026");
    expect(formatDateTime(d.getTime(), "ko")).toContain("2026");
  });
});
