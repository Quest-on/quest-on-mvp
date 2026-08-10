/**
 * 학생 AI 고지 확인의 1회성 (이슈 #121 / 스펙 AC-15).
 *
 * #85 는 고지를 **보여주는** 데까지만 했다. AC-15 는 "확인 시각이 기록되고
 * 이후 응시에서 재노출되지 않는다" 인데, 기록은 `sessions.preflight_accepted_at`
 * 뿐이라 세션 단위였다. 그래서 시험을 옮길 때마다 같은 3줄이 다시 떴고,
 * `onboarding_events` 에는 학생 쪽 행이 한 건도 쌓이지 않았다.
 *
 * 여기서 고정하는 것:
 *   1. preflight 수락이 마일스톤을 남긴다
 *   2. 계측 실패가 응시를 막지 않는다
 *   3. 세션 init 이 "이미 확인했는가"를 실어 보내고, 조회 실패 시 **다시 보여주는**
 *      쪽으로 실패한다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const USER_ID = "student-1";
const SESSION_ID = "3f1d4b2a-1111-4111-8111-111111111111";

const recordOnboardingEvent = vi.fn(async () => true);
const hasOnboardingEvent = vi.fn(async () => false);

vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { STUDENT_DISCLOSURE_ACK: "student_disclosure_ack" },
  recordOnboardingEvent,
  hasOnboardingEvent,
}));

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => ({ id: USER_ID, role: "student", status: "approved" }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { sessionRead: { limit: 30, windowSec: 60 } },
}));

vi.mock("@/lib/logger", () => ({ logError: () => {} }));

const session = {
  id: SESSION_ID,
  student_id: USER_ID,
  exam_id: "exam-1",
  status: "joined",
  started_at: null,
  attempt_timer_started_at: null,
  created_at: "2026-08-10T00:00:00Z",
  preflight_accepted_at: null,
  device_fingerprint: null,
};

const exam = {
  id: "exam-1",
  status: "draft",
  started_at: null,
  duration: 60,
  type: "exam",
};

// sessions/exams 조회와 update 를 모두 받아내는 최소 스텁.
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      const row = table === "sessions" ? session : exam;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: row, error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
        update: () => ({
          eq: () => ({
            eq: () => ({ select: () => ({ single: async () => ({ data: { ...session, preflight_accepted_at: "now", status: "waiting" }, error: null }) }) }),
            select: () => ({ single: async () => ({ data: { ...session, preflight_accepted_at: "now", status: "waiting" }, error: null }) }),
          }),
        }),
      };
      return chain;
    },
  }),
}));

async function acceptPreflight() {
  const { POST } = await import("../app/api/session/[sessionId]/preflight/route");
  const request = new Request(`https://quest-on.app/api/session/${SESSION_ID}/preflight`, {
    method: "POST",
  });
  const response = await POST(request as never, {
    params: Promise.resolve({ sessionId: SESSION_ID }),
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordOnboardingEvent.mockResolvedValue(true);
  hasOnboardingEvent.mockResolvedValue(false);
});

describe("preflight 수락이 고지 확인을 기록한다 (AC-15)", () => {
  it("student_disclosure_ack 마일스톤을 학생·시험과 함께 남긴다", async () => {
    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(recordOnboardingEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      role: "student",
      event: "student_disclosure_ack",
      examId: "exam-1",
    });
  });

  it("계측이 실패해도 응시는 시작된다", async () => {
    // recordOnboardingEvent 는 throw 하지 않고 false 를 돌려주도록 설계돼 있다.
    // 그 계약이 깨져 throw 하더라도 학생이 시험을 못 보면 안 된다.
    recordOnboardingEvent.mockResolvedValue(false);

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(res.body.preflightAcceptedAt).toBeTruthy();
  });
});

describe("고지 재노출 차단 배선 (AC-15)", () => {
  const handlers = readFileSync("app/api/supa/handlers/session-handlers.ts", "utf8");
  const hook = readFileSync("hooks/useExamSession.ts", "utf8");
  const page = readFileSync("app/(app)/exam/[code]/page.tsx", "utf8");

  it("세션 init 이 disclosureAcknowledged 를 내려준다", () => {
    expect(handlers).toMatch(/hasOnboardingEvent\(/);
    expect(handlers).toMatch(/disclosureAcknowledged,/);
  });

  it("훅이 서버 값을 그대로 상태로 옮긴다 — 클라이언트가 판정하지 않는다", () => {
    expect(hook).toMatch(
      /setDisclosureAcknowledged\(initData\.disclosureAcknowledged === true\)/
    );
    expect(hook).toMatch(/^\s*disclosureAcknowledged,$/m);
  });

  it("페이지가 확인 여부의 역을 모달에 넘긴다", () => {
    expect(page).toContain("showAiDisclosure={!session.disclosureAcknowledged}");
  });

  it("확인 사실은 세션이 아니라 사람 단위다 — preflight_accepted_at 로 게이팅하지 않는다", () => {
    // 세션 컬럼으로 게이팅하면 시험을 옮길 때마다 다시 뜬다. 그게 이 이슈다.
    expect(page).not.toContain("showAiDisclosure={!session.preflightAcceptedAt}");
    expect(hook).not.toMatch(/disclosureAcknowledged.*preflight_accepted_at/);
  });
});
