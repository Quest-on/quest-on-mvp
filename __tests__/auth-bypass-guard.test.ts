/**
 * TEST_BYPASS_SECRET 가드 회귀 테스트.
 *
 * 이 바이패스는 헤더 하나로 임의 사용자가 되는 문이다. 배포 환경(프로덕션·스테이징)
 * 에서는 조용히 무시하는 게 아니라 즉시 throw 해야 한다 — 조용히 무시하면 키가
 * 주입된 사실을 아무도 모른 채로 남는다.
 *
 * `@/lib/supabase-auth` 는 vitest alias 로 목이 걸려 있어서, 실제 구현을 검사하려면
 * 상대경로로 임포트해야 한다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const headerStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerStore.get(name) ?? null,
  }),
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

async function loadCurrentUser() {
  vi.resetModules();
  const mod = await import("../lib/supabase-auth");
  return mod.currentUser;
}

beforeEach(() => {
  headerStore.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("currentUser test bypass", () => {
  it("throws in production when the bypass secret is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("TEST_BYPASS_SECRET", "leaked-secret");

    const currentUser = await loadCurrentUser();
    await expect(currentUser()).rejects.toThrow(/TEST_BYPASS_SECRET/);
  });

  it("throws on staging too — staging is a production-grade environment", async () => {
    // 별도 Vercel 프로젝트로 띄운 스테이징(VERCEL_ENV=production)에서도 동일해야 한다.
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TEST_BYPASS_SECRET", "leaked-secret");

    const currentUser = await loadCurrentUser();
    await expect(currentUser()).rejects.toThrow(/TEST_BYPASS_SECRET/);
  });

  // 레드팀 지적: 라벨이 development/test 로 잘못 들어간 배포에서 유효한
  // 바이패스 헤더가 실제로 통과하는지. 배포 신호가 라벨을 이겨야 한다.
  it("throws when a deployment signal is present even if the label says development", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TEST_BYPASS_SECRET", "leaked-secret");
    headerStore.set("x-test-bypass-token", "leaked-secret");
    headerStore.set("x-test-user-id", "attacker");
    headerStore.set("x-test-user-role", "instructor");

    const currentUser = await loadCurrentUser();
    await expect(currentUser()).rejects.toThrow(/TEST_BYPASS_SECRET/);
  });

  it("throws when VERCEL_ENV is present but empty — a hand-set value is not trustworthy", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TEST_BYPASS_SECRET", "leaked-secret");
    headerStore.set("x-test-bypass-token", "leaked-secret");
    headerStore.set("x-test-user-id", "attacker");

    const currentUser = await loadCurrentUser();
    await expect(currentUser()).rejects.toThrow(/TEST_BYPASS_SECRET/);
  });

  it("resolves the bypass user in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("TEST_BYPASS_SECRET", "local-secret");
    headerStore.set("x-test-bypass-token", "local-secret");
    headerStore.set("x-test-user-id", "user-123");
    headerStore.set("x-test-user-role", "instructor");

    const currentUser = await loadCurrentUser();
    const user = await currentUser();

    expect(user).toMatchObject({ id: "user-123", role: "instructor" });
  });

  it("rejects a wrong bypass token in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("TEST_BYPASS_SECRET", "local-secret");
    headerStore.set("x-test-bypass-token", "wrong-secret");
    headerStore.set("x-test-user-id", "user-123");

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toBeNull();
  });
});
