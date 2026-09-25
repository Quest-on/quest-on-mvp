/**
 * `POST /api/auth/password-reset` — 계정 열거 차단과 레이트리밋 (이슈 #318).
 *
 * 가장 지키기 어려운 불변식은 **"가입된 주소와 아닌 주소의 응답이 같아야
 * 한다"** 이다. 나중에 누군가 "사용자에게 친절하게" 알려주려고 분기를 하나
 * 넣는 순간 조용히 깨진다. 그래서 바이트 단위로 비교한다.
 *
 * ## 이 파일이 예전에 놓쳤던 것
 *
 * 원래는 전역 `fetch` 를 스텁해서 **요청 모양만** 봤다. 그래서 라우트가
 * `/auth/v1/recover` 를 `code_challenge` 없이 부르는 것을 잡지 못했다 —
 * 발송은 성공하는데 발급된 링크가 implicit flow 라 토큰이 URL 프래그먼트로
 * 오고, 서버 콜백이 영영 못 읽어 **모든 재설정 링크가 실패했다.** 테스트는
 * 초록이었다.
 *
 * 이제 SDK 경계를 모킹한다. `resetPasswordForEmail` 에 무엇을 넘기는지를 보는
 * 편이 HTTP 바이트를 보는 것보다 실제 계약에 가깝다. PKCE 플로우 자체는
 * SDK 가 보장하고, "SDK 를 쓰는가" 는 `password-reset-reachability.test.ts`
 * 가 고정한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const checkRateLimitAsync = vi.hoisted(() =>
  vi.fn(async (_key: string, _config: { limit: number; windowSec: number }) => ({
    allowed: true,
  }))
);
const logError = vi.hoisted(() => vi.fn());
type ResetOptions = { redirectTo?: string };
const resetPasswordForEmail = vi.hoisted(() =>
  vi.fn(
    async (_email: string, _options?: { redirectTo?: string }) => ({
      error: null as { message: string; status?: number } | null,
    })
  )
);
const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return { ...actual, checkRateLimitAsync };
});

// 재설정은 지금 닫혀 있다(#318, lib/password-reset-availability.ts). 이 파일은
// **열었을 때** 메커니즘이 맞는지를 본다 — 다시 열 때 그대로 쓰려고 남긴다.
// 닫혀 있을 때의 동작은 __tests__/password-reset-closed.test.ts 가 본다.
vi.mock("@/lib/password-reset-availability", () => ({ isPasswordResetEnabled: () => true }));

vi.mock("@/lib/logger", () => ({ logError }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: cookieSet }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { resetPasswordForEmail } }),
}));

const ORIGIN = "https://quest-on-staging-two.vercel.app";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/auth/password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function post(body: unknown, headers?: Record<string, string>) {
  const { POST } = await import("../app/api/auth/password-reset/route");
  const res = await POST(makeRequest(body, headers));
  return { status: res.status, text: await res.text() };
}

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;
let envBackup: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitAsync.mockResolvedValue({ allowed: true });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  envBackup = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
});

// process.env 는 워커 프로세스 공유다. 복구하지 않으면 같은 워커에 배정된
// 다른 파일이 오염된다 — 특히 NEXT_PUBLIC_APP_URL 은 lib/auth-redirect.ts 가
// 읽는 값이라 리다이렉트 테스트를 통째로 흔든다. 워커 배정은 실행마다 달라서
// 이런 누수는 로컬에서 통과하고 CI 에서만 깨진다.
afterEach(() => {
  for (const k of ENV_KEYS) {
    const original = envBackup[k];
    if (original === undefined) delete process.env[k];
    else process.env[k] = original;
  }
});

const IP = { "x-forwarded-for": "203.0.113.7" };

describe("POST /api/auth/password-reset", () => {
  it("가입 여부와 무관하게 응답이 완전히 같다", async () => {
    const existing = await post({ email: "real@university.ac.kr" }, IP);

    // 미가입이면 SDK 가 오류를 준다 — 화면에 닿는 것은 달라지면 안 된다.
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "User not found", status: 404 },
    });
    const unknown = await post({ email: "nobody@university.ac.kr" }, IP);

    // 업스트림이 죽어도 마찬가지다.
    resetPasswordForEmail.mockRejectedValueOnce(new Error("upstream down"));
    const broken = await post({ email: "third@university.ac.kr" }, IP);

    expect(existing.status).toBe(200);
    expect(unknown).toEqual(existing);
    expect(broken).toEqual(existing);
  });

  it("발송 실패는 사용자에게 숨기되 로그에는 남긴다", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "nope", status: 500 },
    });
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    expect(res.status).toBe(200);
    // 조용히 사라지면, 발송이 계속 실패하는데 화면은 늘 성공이라고 말한다.
    expect(logError).toHaveBeenCalled();
  });

  it("레이트리밋에 걸리면 429 로 분명히 알린다", async () => {
    checkRateLimitAsync.mockResolvedValueOnce({ allowed: false });
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    expect(res.status).toBe(429);
    // 이 경우만 다르게 답해도 되는 이유: "이 IP 가 많이 눌렀다" 는 계정 존재
    // 여부와 무관하다. 감추면 사용자가 계속 누른다.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("IP 와 주소 둘 다로 제한한다", async () => {
    // IP 단독이면 대학 NAT 환경에서 4번째 사람이 잠긴다 — 이 제품 사용자가
    // 정확히 그 환경이다. 반대로 IP 만 보면 IP 를 돌려 한 주소에 무제한
    // 발송이 가능하다. 둘 다 걸어야 양쪽이 막힌다.
    await post({ email: "a@b.ac.kr" }, { "x-forwarded-for": "198.51.100.42" });

    const keys = checkRateLimitAsync.mock.calls.map((c) => c[0]);
    expect(keys).toContain("password-reset:ip:198.51.100.42");
    expect(keys.some((k) => k.startsWith("password-reset:addr:"))).toBe(true);
    expect(checkRateLimitAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 3 })
    );
  });

  it("주소 키에 평문 이메일을 남기지 않는다", async () => {
    await post({ email: "someone@university.ac.kr" }, IP);
    const keys = checkRateLimitAsync.mock.calls.map((c) => c[0]);
    for (const k of keys) {
      expect(k).not.toContain("someone@university.ac.kr");
    }
  });

  it("대소문자가 달라도 같은 주소로 본다", async () => {
    await post({ email: "Same@University.AC.KR" }, IP);
    const first = checkRateLimitAsync.mock.calls
      .map((c) => c[0])
      .find((k) => k.startsWith("password-reset:addr:"));

    vi.clearAllMocks();
    checkRateLimitAsync.mockResolvedValue({ allowed: true });
    await post({ email: "same@university.ac.kr" }, IP);
    const second = checkRateLimitAsync.mock.calls
      .map((c) => c[0])
      .find((k) => k.startsWith("password-reset:addr:"));

    expect(first).toBe(second);
  });

  it("x-forwarded-for 가 없으면 다른 헤더를 본다", async () => {
    // 전부 비면 `unknown` 한 키로 모이는데, 이 버킷은 5분 3회라 그 상태에서는
    // 한 사람의 재시도가 전체를 잠근다.
    await post({ email: "a@b.ac.kr" }, { "x-real-ip": "198.51.100.9" });
    const keys = checkRateLimitAsync.mock.calls.map((c) => c[0]);
    expect(keys).toContain("password-reset:ip:198.51.100.9");
  });

  it("JSON 이 아닌 본문은 400 이다 — 보냈다고 말하지 않는다", async () => {
    // 계정 열거를 막는 이유는 "유효한 요청인데 주소가 없을 때" 에만 적용된다.
    // 파싱도 안 된 요청에 200 을 주면 화면이 "메일을 보냈습니다" 라고 말한다.
    const { POST } = await import("../app/api/auth/password-reset/route");
    const req = new Request(`${ORIGIN}/api/auth/password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json", ...IP },
      body: "not-json",
    }) as unknown as import("next/server").NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("이메일 형식이 아니면 400 이고 보내지 않는다", async () => {
    for (const email of ["", "not-an-email", "a@", 42, null]) {
      const res = await post({ email }, IP);
      expect(res.status).toBe(400);
    }
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("재설정 링크는 /auth/callback 을 거쳐 /reset-password 로 오게 만든다", async () => {
    await post({ email: "someone@university.ac.kr" }, IP);

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "someone@university.ac.kr",
      expect.objectContaining({ redirectTo: expect.any(String) })
    );
    const options: ResetOptions = resetPasswordForEmail.mock.calls[0]?.[1] ?? {};
    expect(options.redirectTo).toBeTruthy();
    const url = new URL(options.redirectTo as string);

    // 허용목록에 등록된 경로여야 Supabase 가 Site URL 로 갈아끼우지 않는다(#193).
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/reset-password");
  });

  it("이메일은 앞뒤 공백을 떼고 넘긴다", async () => {
    await post({ email: "  spaced@university.ac.kr  " }, IP);
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "spaced@university.ac.kr",
      expect.anything()
    );
  });

  it("Supabase 환경변수가 없으면 500 을 흘리지 않고 같은 200 을 준다", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await post({ email: "someone@university.ac.kr" }, IP);

    expect(res.status).toBe(200);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});
