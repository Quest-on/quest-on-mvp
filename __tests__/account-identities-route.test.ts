/**
 * GET /api/account/identities — 비밀번호를 가진 계정을 로그인 수단으로 센다 (#408).
 *
 * 소셜로 가입한 뒤 설정에서 비밀번호를 설정하면 Supabase 는 `auth.identities` 에
 * `email` 행을 만들지 않는다 — `encrypted_password` 만 채우고 로그인은 된다.
 * 그래서 `getUserIdentities()` 만 보면 여전히 [kakao] 이고, 로그인 수단 카드가
 * "하나뿐이라 해제 불가" 로 잠기고 이메일 로그인이 목록에 안 뜬다.
 *
 * 비밀번호 보유 여부는 `app_metadata.providers` 에 `email` 이 있는지로 안다 —
 * `ChangePasswordForm` 이 이미 그 규칙으로 `hasPassword` 를 판정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserIdentities = vi.fn();
const getUser = vi.fn();
const unlinkIdentity = vi.fn(async () => ({ data: {}, error: null }));

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => ({ id: "user-9", email: "u@example.com", role: "student" }),
}));
vi.mock("@/lib/supabase-auth", () => ({
  getSupabaseAuthClient: async () => ({ auth: { getUserIdentities, getUser, unlinkIdentity } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { sessionRead: {}, general: {} },
}));
vi.mock("@/lib/logger", () => ({ logError: () => {} }));

const kakao = { identity_id: "id-k", provider: "kakao", identity_data: { email: "k@kakao.com" }, created_at: "2026-09-19T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdentities.mockResolvedValue({ data: { identities: [kakao] }, error: null });
});

async function callGet() {
  const { GET } = await import("../app/api/account/identities/route");
  return (await GET()).json();
}

describe("GET /api/account/identities — 비밀번호 로그인 수단", () => {
  it("소셜만 있고 비밀번호가 없으면 identity 그대로", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-9", email: "u@example.com", app_metadata: { providers: ["kakao"] } } }, error: null });
    const body = await callGet();
    expect(body.identities.map((i: { provider: string }) => i.provider)).toEqual(["kakao"]);
  });

  it("비밀번호를 설정한 소셜 계정은 email 수단이 목록에 붙는다 — #408 재현", async () => {
    // updateUser({ password }) 뒤의 실제 상태: identities 는 [kakao] 그대로,
    // app_metadata.providers 에만 email 이 추가된다.
    getUser.mockResolvedValue({ data: { user: { id: "user-9", email: "u@example.com", app_metadata: { providers: ["kakao", "email"] } } }, error: null });
    const body = await callGet();
    const providers = body.identities.map((i: { provider: string }) => i.provider);
    expect(providers).toContain("kakao");
    expect(providers, "비밀번호 로그인이 수단 목록에 없다").toContain("email");
    expect(body.identities.find((i: { provider: string }) => i.provider === "email").email).toBe("u@example.com");
  });

  it("email identity 행이 실제로 있으면 중복 추가하지 않는다", async () => {
    const emailId = { identity_id: "id-e", provider: "email", identity_data: { email: "u@example.com" }, created_at: "2026-01-01T00:00:00Z" };
    getUserIdentities.mockResolvedValue({ data: { identities: [emailId, kakao] }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-9", email: "u@example.com", app_metadata: { providers: ["email", "kakao"] } } }, error: null });
    const body = await callGet();
    expect(body.identities.filter((i: { provider: string }) => i.provider === "email")).toHaveLength(1);
  });
});
