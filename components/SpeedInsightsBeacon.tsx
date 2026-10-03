"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { speedInsightsBeforeSend } from "@/lib/speed-insights";

/**
 * `<SpeedInsights />` 에 쿼리를 떼는 `beforeSend` 를 단다. 함수 prop 이라
 * 서버 컴포넌트인 레이아웃에서 직접 넘길 수 없어 클라이언트 래퍼로 둔다.
 */
export function SpeedInsightsBeacon() {
  return <SpeedInsights beforeSend={speedInsightsBeforeSend} />;
}
