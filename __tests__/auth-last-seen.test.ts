/**
 * last_seen_at 터치 (#354). auth.users.last_sign_in_at 은 세션 리프레시에 갱신되지
 * 않아 "마지막 활동" 지표로 쓸 수 없다. currentUser() 가 스로틀(15분)로
 * profiles.last_seen_at 을 갱신하되, 이 쓰기가 실패해도 인증은 깨지 않아야 한다.
 *
 * "@/lib/supabase-auth" 는 vitest alias 로 목이 걸려 있어서 실제 구현을 검증하려면
 * 상대경로로 임포트해야 한다 (auth-profile-provisioning.test.ts 와 같은 방식).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = {
  role: string | null;
  status: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

let authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null = null;
let sessionProfile: Row | null = null;
let updateCalls: Array<{ values: Record<string, unknown>; id: unknown }> = [];
let updateError: { message: string; code?: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sessionProfile }),
        }),
      }),
    }),
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("../lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, value: unknown) => {
          updateCalls.push({ values, id: value });
          return { error: updateError };
        },
      }),
    }),
  }),
}));

async function loadCurrentUser() {
  // 모듈 레벨 스로틀 캐시를 초기화하려고 매번 새로 로드한다.
  vi.resetModules();
  const mod = await import("../lib/supabase-auth");
  return mod.currentUser;
}

beforeEach(() => {
  authUser = { id: "user-1", email: "someone@example.test", user_metadata: {} };
  sessionProfile = {
    role: "instructor",
    status: "approved",
    display_name: "기존 사용자",
    avatar_url: null,
  };
  updateCalls = [];
  updateError = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("currentUser last_seen_at 터치", () => {
  it("인증된 요청에서 profiles.last_seen_at 을 갱신한다", async () => {
    const currentUser = await loadCurrentUser();
    const user = await currentUser();

    expect(user).toMatchObject({ id: "user-1" });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe("user-1");
    expect(typeof updateCalls[0].values.last_seen_at).toBe("string");
    // ISO 시각이어야 운영 조회에서 그대로 쓸 수 있다.
    expect(Number.isNaN(Date.parse(updateCalls[0].values.last_seen_at as string))).toBe(false);
  });

  it("스로틀 창(15분) 안의 두 번째 호출은 쓰지 않는다", async () => {
    const currentUser = await loadCurrentUser();
    await currentUser();
    await currentUser();

    expect(updateCalls).toHaveLength(1);
  });

  it("035 migration 미적용 환경(42703)이어도 인증은 그대로 통과한다", async () => {
    updateError = { message: "column profiles.last_seen_at does not exist", code: "42703" };

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toMatchObject({ id: "user-1" });
    // 42703 은 재시도해도 같으므로 스로틀을 유지한다 (로그 스팸 방지).
    await currentUser();
    expect(updateCalls).toHaveLength(1);
  });

  it("쓰기가 다른 이유로 실패하면 인증은 통과하고 다음 호출에서 재시도한다", async () => {
    updateError = { message: "connection reset" };

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toMatchObject({ id: "user-1" });

    updateError = null;
    await currentUser();
    expect(updateCalls).toHaveLength(2);
  });

  it("로그아웃 상태에서는 쓰지 않는다", async () => {
    authUser = null;

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toBeNull();
    expect(updateCalls).toHaveLength(0);
  });
});
