import { describe, it, expect } from "vitest";
import { isLocale, defaultLocale, locales, intlLocaleMap } from "@/lib/i18n/config";

describe("i18n config", () => {
  it("기본 로케일은 ko", () => {
    expect(defaultLocale).toBe("ko");
  });

  it("ko/en을 지원한다", () => {
    expect(locales).toEqual(["ko", "en"]);
  });

  it("isLocale은 지원 로케일만 통과시킨다", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("모든 로케일에 Intl 매핑이 있다", () => {
    for (const l of locales) {
      expect(intlLocaleMap[l]).toBeTruthy();
    }
  });
});
