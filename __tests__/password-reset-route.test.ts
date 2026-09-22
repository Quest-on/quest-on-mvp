/**
 * `POST /api/auth/password-reset` — 계정 열거 차단과 레이트리밋 (이슈 #318).
 *
 * 이 라우트의 존재 이유가 곧 이 테스트의 내용이다. 클라이언트에서
 * `resetPasswordForEmail` 을 직접 부르면 (1) 서버 레이트리밋을 못 걸고
 * (2) 업스트림 응답이 그대로 화면에 드러난다.
 *
 * 가장 지키기 어려운 불변식은 **"가입된 주소와 아닌 주소의 응답이 같아야
 * 한다"** 이다. 이건 나중에 누군가 "사용자에게 친절하게" 알려주려고 분기를
 * 하나 넣는 순간 조용히 깨진다. 그래서 바이트 단위로 비교한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const checkRateLimitAsync = vi.hoisted(() =>
  vi.fn(async () => ({ allowed: true }))
);
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return { ...actual, checkRateLimitAsync };
});

vi.mock("@/lib/logger", () => ({ logError }));

const ORIGIN = "https://quest-on-staging-two.vercel.app";

function makeRequest(body: unknown, ip = "203.0.113.7") {
  return new Request(`${ORIGIN}/api/auth/password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function post(body: unknown, ip?: string) {
  const { POST } = await import("../app/api/auth/password-reset/route");
  const res = await POST(makeRequest(body, ip));
  return { status: res.status, text: await res.text() };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitAsync.mockResolvedValue({ allowed: true });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/auth/password-reset", () => {
  it("가입 여부와 무관하게 응답이 완전히 같다", async () => {
    const existing = await post({ email: "real@university.ac.kr" });

    // 업스트림이 404(미가입)로 답해도 화면에 닿는 것은 달라지지 않아야 한다.
    fetchMock.mockResolvedValueOnce(
      new Response('{"msg":"User not found"}', { status: 404 })
    );
    const unknown = await post({ email: "nobody@university.ac.kr" });

    // 업스트림이 죽어도 마찬가지다.
    fetchMock.mockRejectedValueOnce(new Error("upstream down"));
    const broken = await post({ email: "third@university.ac.kr" });

    expect(existing.status).toBe(200);
    expect(unknown).toEqual(existing);
    expect(broken).toEqual(existing);
  });

  it("업스트림 실패는 사용자에게 숨기되 로그에는 남긴다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"msg":"nope"}', { status: 500 })
    );
    const res = await post({ email: "someone@university.ac.kr" });

    expect(res.status).toBe(200);
    // 조용히 사라지면, 발송이 계속 실패하는데 화면은 늘 성공이라고 말한다.
    expect(logError).toHaveBeenCalled();
  });

  it("레이트리밋에 걸리면 429 로 분명히 알린다", async () => {
    checkRateLimitAsync.mockResolvedValueOnce({ allowed: false });
    const res = await post({ email: "someone@university.ac.kr" });

    expect(res.status).toBe(429);
    // 이 경우만 다르게 답해도 되는 이유: "이 IP 가 많이 눌렀다" 는 계정 존재
    // 여부와 무관하다. 감추면 사용자가 계속 누른다.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IP 로 제한한다 — 비로그인 요청이라 user.id 가 없다", async () => {
    await post({ email: "a@b.ac.kr" }, "198.51.100.42");
    expect(checkRateLimitAsync).toHaveBeenCalledWith(
      "password-reset:198.51.100.42",
      expect.objectContaining({ limit: 3 })
    );
  });

  it("이메일 형식이 아니면 400 이고 메일을 보내지 않는다", async () => {
    for (const email of ["", "not-an-email", "a@", 42, null]) {
      const res = await post({ email });
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("재설정 링크는 /auth/callback 을 거쳐 /reset-password 로 오게 만든다", async () => {
    await post({ email: "someone@university.ac.kr" });

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    const redirectTo = new URL(
      decodeURIComponent(new URL(calledUrl).searchParams.get("redirect_to") ?? "")
    );

    // 허용목록에 등록된 경로여야 Supabase 가 Site URL 로 갈아끼우지 않는다(#193).
    expect(redirectTo.origin).toBe(ORIGIN);
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/reset-password");
  });

  it("Supabase 환경변수가 없으면 500 을 흘리지 않고 같은 200 을 준다", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await post({ email: "someone@university.ac.kr" });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});
