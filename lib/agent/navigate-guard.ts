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

  // 접두사 검사는 **정규화 후** 해야 한다. `/instructor/../admin` 은 문자열로는
  // /instructor 로 시작하지만 실제로는 /admin 으로 간다 — 문자열 비교만 하면
  // allowlist 가 뚫린다. 파서에 한 번 통과시켜 최종 경로로 판정하고, 통과시킨
  // 값도 그 정규화된 형태로 돌려준다(검증한 것과 이동하는 것이 같아야 한다).
  let normalized: URL;
  try {
    normalized = new URL(path, "https://agent-route.invalid");
  } catch {
    return null;
  }

  const allowed = ALLOWED_ROUTE_PREFIXES.some(
    (prefix) =>
      normalized.pathname === prefix || normalized.pathname.startsWith(`${prefix}/`)
  );
  if (!allowed) return null;

  return `${normalized.pathname}${normalized.search}${normalized.hash}`;
}

/**
 * navigate 액션 실행 결정 (실행 가능한 seam).
 *
 * 컨트롤러가 이 결정을 인라인으로 갖고 있으면 "거부된 route 에서 push 가 정말
 * 호출되지 않는가"를 실행으로 검증할 수 없다(저장소에 React 렌더 테스트 인프라가
 * 없다). 결정만 순수 함수로 빼서 push 스파이로 검증한다.
 *
 * @param push 실제 이동 함수 (`router.push`)
 * @param currentPathname 현재 경로. 같으면 이동하지 않는다.
 */
export function decideNavigate(
  route: unknown,
  currentPathname: string | null
): { ok: false } | { ok: true; navigate: false } | { ok: true; navigate: true; route: string } {
  const target = safeAgentRoute(route);
  if (!target) return { ok: false };

  if (currentPathname !== null && currentPathname === target) {
    return { ok: true, navigate: false };
  }

  return { ok: true, navigate: true, route: target };
}
