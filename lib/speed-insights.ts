/**
 * Vercel Speed Insights 비콘에서 쿼리와 해시를 뗀다 (이슈 #318 리뷰).
 *
 * 비콘은 `location.href` 를 그대로 싣는다. 쿼리에는 1회용 토큰이 올 수 있다
 * — `/auth/recovery?token_hash=…` 가 그렇다. 성능 집계는 경로로 묶이니 떼어도
 * 잃는 게 없다. 주소를 못 읽으면 그 측정값은 버린다.
 *
 * 타입은 SDK 의 `BeforeSendEvent` 와 같은 모양이다. `@vercel/speed-insights/next`
 * 는 그 타입을 내보내지 않는다.
 */
export function speedInsightsBeforeSend<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}
