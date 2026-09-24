/**
 * 프로필 없는 로그인 학생이 프로필 폼에 도달한다 (이슈 #480).
 *
 * 시험 페이지의 프로필 게이트는 `/student/profile-setup?redirect=/exam/X` 로
 * 보낸다. 그 페이지는 이제 쿼리를 보존해 `/onboarding` 으로 넘기는 shim 인데,
 * 프록시의 공개 라우트 목록은 **로그인 사용자에게 반대로** 작동한다 — 예외
 * 목록에 없으면 대시보드로 되돌린다. 그래서 shim 이 로그인 학생에게 한 번도
 * 실행되지 않았고, 대시보드는 프로필이 없다며 다시 shim 으로 보냈다.
 *
 * `proxy.ts` 의 목록 텍스트가 아니라 `proxy()` 가 실제로 돌려주는 응답을 본다.
 * 목록 포함 여부만 보다가 로그인된 경우를 놓친 게 #456 이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

const SECRET = "profile-setup-reachability-secret";
const ORIGIN = "http://localhost:3000";

let proxy: (typeof import("../proxy"))["proxy"];

beforeEach(async () => {
  // 브라우저 E2E 와 같은 바이패스 경로로 역할을 정한다. Supabase 를 부르지 않는다.
  vi.stubEnv("TEST_BYPASS_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  // 가장 엄격한 모드로 둔다. 동의 게이트(두 번째 겹)가 이 경로를 public 으로
  // 분류하지 않으면 evaluateConsentGate 가 DB 를 부르다 실패해 드러난다.
  vi.stubEnv("CONSENT_GATE_MODE", "enforce");
  vi.stubEnv("VERCEL", "");
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  vi.resetModules();
  ({ proxy } = await import("../proxy"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, role: string | null) {
  const req = new NextRequest(new URL(path, ORIGIN));
  req.cookies.set("__test_bypass", SECRET);
  if (role) req.cookies.set("__test_user_role", role);
  return req;
}

function redirectTarget(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location) return null;
  const url = new URL(location);
  return url.pathname + url.search;
}

describe("#480 — /student/profile-setup 은 로그인 학생에게 열려 있다", () => {
  it("시험에서 온 프로필 없는 학생을 대시보드로 되돌리지 않는다", async () => {
    const res = await proxy(
      request(`/student/profile-setup?redirect=${encodeURIComponent("/exam/ABC123")}`, "student")
    );

    expect(
      redirectTarget(res),
      "로그인 학생이 프로필 폼 대신 대시보드로 튕겼다 — 대시보드는 다시 여기로 보낸다"
    ).toBeNull();
  });

  it("쿼리 없이 와도 통과한다 (대시보드가 보내는 경로)", async () => {
    const res = await proxy(request("/student/profile-setup", "student"));
    expect(redirectTarget(res)).toBeNull();
  });

  it("역할이 없으면 지금처럼 온보딩으로 간다", async () => {
    // 역할 클레임 전 사용자. shim 도 결국 /onboarding 이지만 프록시가 먼저
    // 보낸다 — 이 경로는 바꾸지 않는다.
    const res = await proxy(request("/sign-in", null));
    expect(redirectTarget(res)).toBe("/onboarding");
  });

  it("다른 공개 라우트는 로그인 학생을 계속 대시보드로 보낸다", async () => {
    // 예외 목록을 넓히는 게 아니라 이 경로 하나만 연다.
    const res = await proxy(request("/sign-in", "student"));
    expect(redirectTarget(res)).toBe("/student");
  });
});
