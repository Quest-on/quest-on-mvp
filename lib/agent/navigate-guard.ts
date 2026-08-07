import { safeInternalPath } from "@/lib/safe-redirect";

/**
 * 에이전트 `navigate` 액션의 목적지 검증 (이슈 #101).
 *
 * `route` 는 **모델이 만든 문자열**이다. 에이전트 프롬프트에는 교수자가 넣은 시험
 * 자료·문항 텍스트가 들어가므로, 프롬프트 인젝션으로 모델이 임의 문자열을 뱉게
 * 만들 수 있다. 그 값이 검증 없이 `router.push()` 로 들어가면
 *
 *   - `javascript:...`  → 페이지 컨텍스트에서 실행 (Next.js 문서가 명시한 위험)
 *   - `https://evil.com`, `//evil.com` → 인증된 교수자 세션 상태로 외부 이동
 *
 * 교수자 세션은 학생 실명·답안·성적에 닿는 권한이라 그대로 넘어간다.
 *
 * 그래서 두 겹으로 좁힌다.
 *   1. 같은 출처 경로만 (`safeInternalPath`)
 *   2. 에이전트가 실제로 쓰는 화면만 (아래 allowlist)
 *
 * 에이전트 UI 는 `/instructor` 레이아웃 안에서만 살아 있고(`app/(app)/instructor/layout.tsx`),
 * 툴 설명도 `/instructor`, `/instructor/new` 만 예시로 든다(`lib/agent/tools.ts`).
 * 새 화면으로 이동시키고 싶으면 여기 목록을 **의도적으로** 넓혀야 한다.
 */
const ALLOWED_ROUTE_PREFIXES = ["/instructor"] as const;

export function safeAgentRoute(route: unknown): string | null {
  if (typeof route !== "string") return null;

  const path = safeInternalPath(route);
  if (!path) return null;

  const allowed = ALLOWED_ROUTE_PREFIXES.some(
    (prefix) =>
      path === prefix ||
      path.startsWith(`${prefix}/`) ||
      path.startsWith(`${prefix}?`) ||
      path.startsWith(`${prefix}#`)
  );

  return allowed ? path : null;
}
