/**
 * 사용자 입력으로 들어온 리다이렉트 목적지를 **같은 출처의 경로**로만 좁힌다.
 *
 * `value.startsWith("/")` 만으로는 부족하다. `//evil.com` 은 프로토콜 상대 URL 이라
 * `location.href` 에 넣는 순간 외부 사이트로 나가고, 브라우저는 `/\evil.com` 의
 * 역슬래시를 슬래시로 정규화하므로 이것도 같은 결과가 된다.
 *
 *   new URL("https://quest-on.app" + "//evil.com")  -> https://quest-on.app//evil.com
 *   location.href = "//evil.com"                    -> https://evil.com   ← 외부
 *
 * 로그인/온보딩 직후처럼 "방금 우리 도메인에서 인증했다"는 맥락에서 외부로 튕기면
 * 피싱 신뢰도가 그대로 넘어간다. 판정은 소비 지점 한 곳에서만 한다.
 *
 * @returns 안전하면 정규화된 경로, 아니면 null (호출부가 기본 목적지를 쓴다)
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;

  // //host, /\host — 프로토콜 상대 URL. 외부로 나간다.
  if (/^\/[\\/]/.test(trimmed)) return null;

  // 제어문자(개행·탭·NUL)로 파서를 속이는 입력 차단.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  // 보이지 않는 문자(제로폭·NBSP·BOM·양방향 제어·줄구분자)도 거부한다.
  // 이것들만으로 오리진이 바뀌지는 않는다 — `new URL("/\u200Bevil.com", origin)`
  // 은 여전히 우리 오리진의 경로다. 다만 리다이렉트 목적지에 안 보이는 문자를
  // 넣을 정당한 이유가 없고, 로그·사람 눈으로 하는 검증을 흐리기만 한다.
  if (/[\u0085\u00A0\u1680\u180E\u2000-\u200F\u2028\u2029\u202A-\u202F\u205F-\u2064\u2066-\u206F\u3000\uFEFF]/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * OAuth 콜백이 돌아갈 절대 URL 을 만든다.
 *
 * 문자열 결합(`${origin}${next}`)이 위험한 이유: URL 파서는 결합된 문자열을 다시
 * 해석하므로 `next` 가 호스트를 바꿔치기할 수 있다.
 *
 *   new URL("https://quest-on.app" + "@evil.com")  ->  https://quest-on.app@evil.com/
 *                                                       ^ userinfo        ^ 실제 호스트
 *
 * 즉 `/auth/callback?code=<유효>&next=@evil.com` 이면 **로그인에 성공한 직후**
 * 외부 사이트로 튕긴다. 우리 도메인에서 방금 인증을 마친 맥락이라 피싱 신뢰도가
 * 그대로 넘어간다.
 *
 * 그래서 (1) safeInternalPath 로 경로만 통과시키고 (2) 결합 대신 base 인자를 쓴다.
 */
export function buildCallbackRedirectUrl(
  origin: string,
  next: string | null | undefined,
  fallback = "/"
): string {
  const safeNext = safeInternalPath(next) ?? fallback;
  return new URL(safeNext, origin).toString();
}
