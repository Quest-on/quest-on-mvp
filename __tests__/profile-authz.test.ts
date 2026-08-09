/**
 * 프로필 인가 경계 회귀 (이슈 #87 / AC-20, AC-21).
 *
 * 이 테스트가 증명해야 하는 것은 정상 경로가 아니라 **권한 상승 시도가 거부되는
 * 것**이다. 수정 전에는 로그인한 아무나 아래 한 번이면 승인된 교수자가 됐다:
 *
 *   PATCH /api/user/profile  {"role":"instructor","status":"approved"}
 *
 * 그래서 진짜 라우트 핸들러를 부르고, Supabase 쿼리 빌더에 실제로 무엇이
 * 실렸는지(`update` 페이로드와 `.is("role", null)` 술어)를 본다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

// ── Supabase service-role 클라이언트 목 ────────────────────────────────
const update = vi.fn();
const eq = vi.fn();
const is = vi.fn();
const select = vi.fn();
const maybeSingle = vi.fn();
const selectAfterFrom = vi.fn();

/** update(...).eq(...).is(...).select(...) 체인 */
function updateChain() {
  return { eq: (...a: unknown[]) => (eq(...a), { is: (...b: unknown[]) => (is(...b), { select }) }) };
}

/** select(...).eq(...).maybeSingle() 체인 (이미 정해진 역할 조회) */
function selectChain() {
  return { eq: () => ({ maybeSingle }) };
}

const from = vi.fn(() => ({
  update: (payload: unknown) => (update(payload), updateChain()),
  select: (cols: unknown) => (selectAfterFrom(cols), selectChain()),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({ from }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { sessionRead: { limit: 30, windowSec: 60 } },
}));

vi.mock("@/lib/logger", () => ({ logError: () => {} }));

// 두 라우트 모두 저장소 표준인 currentUser() 로 신원을 얻는다. E2E 테스트
// 바이패스가 그 경로에만 있어서, 라우트가 여기를 우회하면 브라우저 E2E 가 깨진다.
let sessionUser: { id: string; role: string | null } | null = {
  id: USER_ID,
  role: null,
};

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => sessionUser,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
}));

async function patchProfile(body: unknown) {
  const { PATCH } = await import("../app/api/user/profile/route");
  const request = new Request("https://quest-on.app/api/user/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 라우트는 NextRequest 타입을 받지만 실제로 쓰는 건 json() 뿐이다.
  const response = await PATCH(request as never);
  return { status: response.status, body: await response.json() };
}

async function claimRole(body: unknown, cookie?: string) {
  const { POST } = await import("../app/api/user/role/route");
  const request = new Request("https://quest-on.app/api/user/role", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const response = await POST(request as never);
  return { status: response.status, body: await response.json(), response };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: USER_ID, role: null };
  select.mockResolvedValue({ data: [{ role: "student", status: "approved" }], error: null });
  maybeSingle.mockResolvedValue({ data: { role: "student" }, error: null });
});

describe("PATCH /api/user/profile — 인가 필드 거부 (AC-20)", () => {
  it("role 을 보내면 400 으로 거부한다. 조용히 무시하지 않는다", async () => {
    const res = await patchProfile({ role: "instructor", display_name: "해커" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUT");
    // 거부는 "쓰기가 아예 없었다" 여야 한다. 이름만 저장되고 200 이 나가면
    // 호출부는 역할까지 반영된 줄 안다.
    expect(update).not.toHaveBeenCalled();
  });

  it("status=approved 승격 시도를 400 으로 거부한다 — 이슈 #87 재현", async () => {
    const res = await patchProfile({ role: "instructor", status: "approved" });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("plan 승격 시도도 거부한다 (#84 의 무료 한도 우회 경로)", async () => {
    const res = await patchProfile({ plan: "verified" });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("허용된 프로필 필드만 보내면 통과하고, 인가 필드는 페이로드에 없다", async () => {
    select.mockResolvedValue({ data: null, error: null });
    const res = await patchProfile({ display_name: "김교수", school: "동국대" });

    expect(res.status).toBe(200);
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ display_name: "김교수", school: "동국대" });
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("plan");
  });
});

describe("POST /api/user/role — 최초 1회 클레임 (AC-21)", () => {
  it("역할이 비어 있을 때만 쓰도록 .is('role', null) 술어를 건다 — TOCTOU 없음", async () => {
    const res = await claimRole({ role: "student" });

    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("id", USER_ID);
    expect(is).toHaveBeenCalledWith("role", null);
  });

  it("교수자 클레임의 status 는 서버가 pending 으로 강제한다", async () => {
    select.mockResolvedValue({ data: [{ role: "instructor", status: "pending" }], error: null });

    await claimRole({ role: "instructor", status: "approved" });

    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.role).toBe("instructor");
    // 본문의 status:"approved" 가 절대 실리면 안 된다.
    expect(payload.status).toBe("pending");
    expect(payload).not.toHaveProperty("plan");
  });

  it("이미 역할이 있으면 409 로 거부한다 — 역할 갈아타기 차단", async () => {
    // 술어가 걸러서 영향 행이 0이다.
    select.mockResolvedValue({ data: [], error: null });
    maybeSingle.mockResolvedValue({ data: { role: "student" }, error: null });

    const res = await claimRole({ role: "instructor" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ROLE_ALREADY_SET");
    expect(res.body.details).toEqual({ role: "student" });
  });

  it("본문이 없으면 OAuth 의도 쿠키를 서버가 읽는다", async () => {
    select.mockResolvedValue({ data: [{ role: "instructor", status: "pending" }], error: null });

    await claimRole({}, "sb-access-token=xyz; onboarding_role=instructor");

    expect((update.mock.calls[0][0] as Record<string, unknown>).role).toBe("instructor");
  });

  it("쿠키가 조작돼 역할이 아니면 400 이다 — admin 같은 값은 통과 못 한다", async () => {
    const res = await claimRole({}, "onboarding_role=admin");

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("소비한 의도 쿠키는 만료시킨다", async () => {
    const res = await claimRole({ role: "student" });

    const setCookie = res.response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("onboarding_role=");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("비로그인은 401 이다", async () => {
    sessionUser = null;

    const res = await claimRole({ role: "instructor" });

    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
});
