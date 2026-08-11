import { test, expect } from "../../fixtures/auth.fixture";
import { assertLocalTestEnv } from "../../helpers/assert-local-test-env";

/**
 * AC-U1 / AC-U2 / AC-U6 (live) — 동의 기록 API 를 실제 HTTP 로 검증한다.
 *
 * 단위 테스트는 Supabase 클라이언트를 mock 한다. 여기서는 진짜 라우트가
 * 진짜 DB 에 붙었을 때 계약이 유지되는지 본다. 특히 strict Zod 거절과
 * "거절 시 INSERT 0회" 는 mock 으로는 완전히 증명되지 않는다.
 */

test.beforeAll(() => {
  assertLocalTestEnv();
});

const ENDPOINT = "/api/consents/onboarding";

test.describe("POST /api/consents/onboarding", () => {
  test("미인증 요청은 401 이다", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { ageOver14: true, terms: true },
    });
    expect(res.status()).toBe(401);
  });

  test("서버 소유 필드를 보내면 400 이다", async ({ studentRequest }) => {
    for (const forged of [
      { user_id: "someone-else" },
      { controller_type: "institution" },
      { policy_version: "forged-release" },
      { __injected__: true },
    ]) {
      const res = await studentRequest.post(ENDPOINT, {
        data: { ageOver14: true, terms: true, ...forged },
      });
      expect(
        res.status(),
        `${JSON.stringify(forged)} 가 거절되지 않았다`,
      ).toBe(400);
    }
  });

  test("필수 항목이 false 면 400 이다", async ({ studentRequest }) => {
    const res = await studentRequest.post(ENDPOINT, {
      data: { ageOver14: false, terms: true },
    });
    expect(res.status()).toBe(400);
  });

  test("GET 은 수집 활성 여부와 완료 여부를 함께 준다", async ({ studentRequest }) => {
    const res = await studentRequest.get(ENDPOINT);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(typeof body.collecting).toBe("boolean");
    expect(typeof body.complete).toBe("boolean");
  });

  test("GET 도 미인증이면 401 이다", async ({ request }) => {
    const res = await request.get(ENDPOINT);
    expect(res.status()).toBe(401);
  });
});
