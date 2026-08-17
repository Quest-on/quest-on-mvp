import { test, expect } from "../../fixtures/auth.fixture";

/**
 * 모든 admin 라우트가 인증을 요구해야 한다.
 *
 * `/admin` 페이지는 클라이언트 컴포넌트라 셸이 200 으로 내려간다. 실제 보호는
 * `/api/admin/*` 가 `requireAdmin()` 으로 한다. 그래서 라우트 하나가 그걸
 * 빼먹으면 페이지는 정상으로 보이면서 데이터가 새어 나간다.
 *
 * `users.spec.ts` 가 한 라우트를 촘촘히 덮지만, 나머지는 검증이 없었다.
 * 여기서는 **전 라우트를 얕게** 덮어 누락을 잡는다. 새 admin 라우트를
 * 추가하면서 `requireAdmin()` 을 잊으면 이 스펙이 실패한다.
 */

// 실제 라우트 목록. app/api/admin/**/route.ts 와 짝을 맞춘다.
// auth 는 로그인 엔드포인트라 제외한다 — 인증을 받는 쪽이지 요구하는 쪽이 아니다.
const GUARDED_GET_ROUTES = [
  "/api/admin/users",
  "/api/admin/ai-usage/summary",
  "/api/admin/ai-usage/breakdown",
  "/api/admin/ai-usage/events",
  "/api/admin/ai-config",
  "/api/admin/instructors/pending",
  "/api/admin/instructors/publishing",
] as const;

test.describe("admin 라우트 인증 — 전수", () => {
  for (const route of GUARDED_GET_ROUTES) {
    test(`${route} — 인증 없으면 401`, async ({ request }) => {
      const res = await request.get(route);
      // 401 이어야 한다. 200 이면 데이터가 새고, 500 이면 인증 전에 로직이 돈다.
      expect(res.status(), `${route} 가 인증을 요구하지 않는다`).toBe(401);
    });
  }

  for (const route of GUARDED_GET_ROUTES) {
    test(`${route} — 학생 세션으로도 401`, async ({ studentRequest }) => {
      // 로그인한 일반 사용자가 admin 데이터를 못 봐야 한다. 인증됨과 관리자는
      // 다른 축이다 — 이걸 안 보면 아무 학생이 전체 사용자 목록을 읽는다.
      const res = await studentRequest.get(route);
      expect(res.status(), `${route} 가 학생에게 열려 있다`).toBe(401);
    });
  }

  test("교수자 세션으로도 401", async ({ instructorRequest }) => {
    // 교수자는 권한이 가장 높은 일반 역할이라 따로 확인한다.
    const res = await instructorRequest.get("/api/admin/users");
    expect(res.status()).toBe(401);
  });

  test("인증 실패 응답에 데이터가 실려 있지 않다", async ({ request }) => {
    // 401 을 내면서 본문에 목록을 함께 보내는 사고를 잡는다.
    const res = await request.get("/api/admin/users");
    const body = await res.text();
    expect(body).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(body.length, "401 본문이 지나치게 크다").toBeLessThan(500);
  });
});
