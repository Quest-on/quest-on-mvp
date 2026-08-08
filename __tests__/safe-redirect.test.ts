/**
 * 오픈 리다이렉트 회귀 테스트.
 *
 * `/student/profile-setup?redirect=...` 이 쿼리를 `/onboarding` 으로 그대로 넘기므로
 * (PR #89), 소비 지점의 검증이 유일한 방어선이다. 기존 `startsWith("/")` 검사는
 * 프로토콜 상대 URL 을 통과시켜 로그인 직후 외부 사이트로 튕길 수 있었다.
 */
import { describe, it, expect } from "vitest";
import { safeInternalPath } from "../lib/safe-redirect";

describe("safeInternalPath", () => {
  it("같은 출처의 경로는 그대로 통과시킨다", () => {
    expect(safeInternalPath("/exam/ABC")).toBe("/exam/ABC");
    expect(safeInternalPath("/student")).toBe("/student");
    expect(safeInternalPath("/exam/ABC?tab=1#top")).toBe("/exam/ABC?tab=1#top");
    expect(safeInternalPath("/")).toBe("/");
  });

  it("프로토콜 상대 URL 을 거부한다 — location.href 에 넣으면 외부로 나간다", () => {
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("//evil.com/path")).toBeNull();
  });

  it("역슬래시 변형을 거부한다 — 브라우저가 //evil.com 으로 정규화한다", () => {
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath("/\\/evil.com")).toBeNull();
  });

  it("앞뒤 공백으로 검사를 우회할 수 없다", () => {
    expect(safeInternalPath("  //evil.com")).toBeNull();
    expect(safeInternalPath("\t//evil.com")).toBeNull();
  });

  it("절대 URL 과 스킴을 거부한다", () => {
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("http://evil.com")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("data:text/html,<script>")).toBeNull();
  });

  it("경로가 아닌 상대 입력을 거부한다", () => {
    expect(safeInternalPath("evil.com")).toBeNull();
    expect(safeInternalPath("../admin")).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });

  it("제어문자가 섞인 입력을 거부한다", () => {
    expect(safeInternalPath("/exam\nhttps://evil.com")).toBeNull();
    expect(safeInternalPath("/exam\u0000")).toBeNull();
  });

  // 레드팀 지적. 이것들만으로 오리진이 바뀌지는 않지만(아래 교차 검증 참고),
  // 리다이렉트 목적지에 안 보이는 문자를 넣을 정당한 이유가 없다.
  it("보이지 않는 문자를 거부한다 — 제로폭·NBSP·BOM·양방향 제어", () => {
    expect(safeInternalPath("/\u200Bevil.com")).toBeNull();
    expect(safeInternalPath("/\u00A0evil.com")).toBeNull();
    expect(safeInternalPath("/\uFEFFevil.com")).toBeNull();
    expect(safeInternalPath("/\u2028evil.com")).toBeNull();
    expect(safeInternalPath("/\u202Eevil.com")).toBeNull();
    expect(safeInternalPath("/\u0085//evil.com")).toBeNull();
  });

  it("거부한 보이지 않는 문자들은 원래도 오리진을 바꾸지는 못했다 (사실 기록)", () => {
    // 이 차단은 심층 방어이지 오리진 탈출 수정이 아니라는 근거를 남긴다.
    for (const value of ["/\u200Bevil.com", "/\u00A0evil.com", "/\uFEFFevil.com"]) {
      expect(new URL(value, "https://quest-on.app").origin).toBe("https://quest-on.app");
    }
  });

  it("값이 없으면 null 이다 — 호출부가 기본 목적지를 쓴다", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });

  it("실제로 외부로 나가는 입력만 걸러낸다 (URL 파싱으로 교차 확인)", () => {
    const origin = "https://quest-on.app";
    const externallyEscaping = ["//evil.com", "/\\evil.com"];

    for (const value of externallyEscaping) {
      // 브라우저 기준으로는 외부 호스트가 된다 — 그래서 거부해야 한다.
      expect(safeInternalPath(value)).toBeNull();
    }

    const stayingInternal = ["/exam/ABC", "/student"];
    for (const value of stayingInternal) {
      const resolved = new URL(safeInternalPath(value)!, origin);
      expect(resolved.origin).toBe(origin);
    }
  });
});
