/**
 * 레이트리밋 키로 쓸 클라이언트 IP.
 *
 * Vercel 은 `x-vercel-forwarded-for` 를 **자기가 다시 쓴다** — 클라이언트가
 * 보낸 값을 버리고 실제 접속 IP 를 넣는다. 그래서 먼저 본다.
 * `x-forwarded-for` 도 Vercel 이 덮어쓰지만, 다른 프록시 뒤에서는 첫 값을
 * 클라이언트가 지어낼 수 있다. 그래서 두 번째다.
 *
 * 전부 비면 `unknown` 하나로 모인다. 한도가 낮은 버킷에서는 그 상태가 **한
 * 사람의 재시도로 전체를 잠근다** — 마지막 수단으로만 쓴다.
 */
export function clientIp(request: Request): string {
  const candidates = [
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0],
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return "unknown";
}
