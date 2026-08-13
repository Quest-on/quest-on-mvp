/**
 * 신규 가입자 프로필 행 프로비저닝 회귀 테스트.
 *
 * Supabase Auth 가입은 `auth.users` 만 만든다. `public.profiles` 를 아무도 만들지
 * 않으면 `currentUser()` 가 null 이 되어 온보딩 API 가 전부 401 이고, 프로필을
 * 만들어야 온보딩이 끝나는데 온보딩이 끝나야 프로필이 생기는 교착이 된다.
 * 스테이징 QA 가 이 교착으로 통째로 막혔다.
 *
 * `@/lib/supabase-auth` 는 vitest alias 로 목이 걸려 있어서 실제 구현을 검사하려면
 * 상대경로로 임포트해야 한다.
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
let adminProfile: Row | null = null;
let upsertCalls: Array<Record<string, unknown>> = [];
let upsertOptions: Array<Record<string, unknown> | undefined> = [];
let upsertError: { message: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sessionProfile }),
          single: async () => ({ data: sessionProfile }),
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
      upsert: async (values: Record<string, unknown>, options?: Record<string, unknown>) => {
        upsertCalls.push(values);
        upsertOptions.push(options);
        if (!upsertError) adminProfile = adminProfile ?? null;
        return { error: upsertError };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: adminProfile }),
        }),
      }),
    }),
  }),
}));

async function loadCurrentUser() {
  vi.resetModules();
  const mod = await import("../lib/supabase-auth");
  return mod.currentUser;
}

beforeEach(() => {
  authUser = null;
  sessionProfile = null;
  adminProfile = null;
  upsertCalls = [];
  upsertOptions = [];
  upsertError = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("currentUser 프로필 프로비저닝", () => {
  it("프로필 행이 없으면 만들고 사용자를 돌려준다 — 여기서 null 이면 온보딩이 교착이다", async () => {
    authUser = {
      id: "user-1",
      email: "someone@example.test",
      user_metadata: { role: "instructor" },
    };
    adminProfile = {
      role: "instructor",
      status: "approved",
      display_name: "someone",
      avatar_url: null,
    };

    const currentUser = await loadCurrentUser();
    const user = await currentUser();

    expect(upsertCalls).toHaveLength(1);
    expect(user).toMatchObject({ id: "user-1", role: "instructor", status: "approved" });
  });

  it("이메일 가입의 metadata role 만 반영한다 — 값이 이상하면 null 로 남긴다", async () => {
    authUser = {
      id: "user-2",
      email: "attacker@example.test",
      user_metadata: { role: "admin" },
    };
    adminProfile = { role: null, status: "approved", display_name: "attacker", avatar_url: null };

    const currentUser = await loadCurrentUser();
    await currentUser();

    // 역할은 POST /api/user/role 이 단 한 번 확정한다. 여기서 추측하면 계정이 굳는다.
    expect(upsertCalls[0]).toMatchObject({ id: "user-2", role: null, status: "approved" });
  });

  it("display_name 을 절대 null 로 넣지 않는다 — 배포 DB 는 NOT NULL 이다", async () => {
    authUser = { id: "user-3", email: "nameless@example.test", user_metadata: {} };
    adminProfile = { role: null, status: "approved", display_name: "nameless", avatar_url: null };

    const currentUser = await loadCurrentUser();
    await currentUser();

    expect(upsertCalls[0].display_name).toBe("nameless");
  });

  it("동시 요청이 서로를 덮지 않도록 중복은 무시한다", async () => {
    authUser = { id: "user-4", email: "race@example.test", user_metadata: {} };
    adminProfile = { role: "student", status: "approved", display_name: "먼저", avatar_url: null };

    const currentUser = await loadCurrentUser();
    const user = await currentUser();

    expect(upsertOptions[0]).toMatchObject({ onConflict: "id", ignoreDuplicates: true });
    // 이미 있는 행이 이겨야 한다. 덮어쓰면 온보딩이 끝난 사용자의 이름이 날아간다.
    expect(user).toMatchObject({ role: "student", fullName: "먼저" });
  });

  it("행이 이미 있으면 쓰지 않는다", async () => {
    authUser = { id: "user-5", email: "existing@example.test", user_metadata: {} };
    sessionProfile = {
      role: "instructor",
      status: "approved",
      display_name: "기존 사용자",
      avatar_url: null,
    };

    const currentUser = await loadCurrentUser();
    const user = await currentUser();

    expect(upsertCalls).toHaveLength(0);
    expect(user).toMatchObject({ id: "user-5", role: "instructor" });
  });

  it("프로비저닝이 실패하면 인증을 통과시키지 않는다", async () => {
    authUser = { id: "user-6", email: "broken@example.test", user_metadata: {} };
    upsertError = { message: "permission denied" };

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toBeNull();
  });

  it("세션이 없으면 프로필을 만들지 않는다", async () => {
    authUser = null;

    const currentUser = await loadCurrentUser();
    expect(await currentUser()).toBeNull();
    expect(upsertCalls).toHaveLength(0);
  });
});
