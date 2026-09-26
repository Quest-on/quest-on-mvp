/**
 * Vercel Speed Insights 비콘은 페이지 주소를 `location.href` 그대로 보낸다
 * (이슈 #318 리뷰). 쿼리에는 1회용 토큰이 실릴 수 있다 —
 * `/auth/recovery?token_hash=…`, 초대 코드 등. 보내기 전에 쿼리와 해시를
 * 떼어 낸다. 성능 집계는 경로(route)로 묶이므로 잃는 것이 없다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { speedInsightsBeforeSend } from "@/lib/speed-insights";

const code = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("Speed Insights 비콘", () => {
  it("쿼리와 해시를 떼고 보낸다", () => {
    expect(
      speedInsightsBeforeSend({
        type: "vital",
        url: "https://quest-on-staging-two.vercel.app/auth/recovery?token_hash=abc&type=recovery#x",
        route: "/auth/recovery",
      })
    ).toEqual({
      type: "vital",
      url: "https://quest-on-staging-two.vercel.app/auth/recovery",
      route: "/auth/recovery",
    });
  });

  it("쿼리가 없으면 그대로다", () => {
    const event = { type: "vital" as const, url: "https://quest-on.app/sign-in" };
    expect(speedInsightsBeforeSend(event)).toEqual(event);
  });

  it("주소를 못 읽으면 보내지 않는다", () => {
    expect(speedInsightsBeforeSend({ type: "vital", url: "not a url?token=1" })).toBeNull();
  });

  it("레이아웃은 필터를 거치는 래퍼만 쓴다", () => {
    // 한 곳이라도 <SpeedInsights /> 를 직접 붙이면 거기서 쿼리가 샌다.
    expect(code("app/layout.tsx")).not.toContain("@vercel/speed-insights");
    const wrapper = code("components/SpeedInsightsBeacon.tsx");
    expect(wrapper).toContain("beforeSend={speedInsightsBeforeSend}");
  });
});
