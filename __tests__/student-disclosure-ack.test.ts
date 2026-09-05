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
 *   2. 확인 기록이 영속되지 않으면 응시를 성공 처리하지 않는다
 *   3. 세션 init 이 "이미 확인했는가"를 실어 보내고, 조회 실패 시 **다시 보여주는**
 *      쪽으로 실패한다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const USER_ID = "student-1";
const SESSION_ID = "3f1d4b2a-1111-4111-8111-111111111111";

const logError = vi.fn();
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

vi.mock("@/lib/logger", () => ({ logError }));

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

// 기본은 서술형 시험 — 3줄 고지가 실제로 노출되는 시험이다.
let exam: Record<string, unknown> = {
  id: "exam-1",
  status: "draft",
  started_at: null,
  duration: 60,
  type: "exam",
  questions: [{ id: "q1", type: "essay", text: "..." }],
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
  // 이 파일은 라우트를 동적 import 한다. 워커가 파일 간 모듈 레지스트리를
  // 재사용하면 앞선 테스트 파일이 세운 목이 붙은 라우트 인스턴스를 잡아,
  // 전체 스위트에서만 산발적으로 실패한다(단독 실행은 항상 통과).
  // 매번 새 모듈을 받게 해서 결정적으로 만든다.
  vi.resetModules();
  // 시험 종류를 바꾸는 케이스가 있으므로 매번 서술형 기본으로 되돌린다.
  exam = {
    id: "exam-1",
    status: "draft",
    started_at: null,
    duration: 60,
    type: "exam",
    questions: [{ id: "q1", type: "essay", text: "..." }],
    is_demo: false,
    instructor_id: "other-instructor",
  };
  recordOnboardingEvent.mockResolvedValue(true);
  hasOnboardingEvent.mockResolvedValue(true);
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

  it("객관식 전용 시험 수락도 ACK 를 만든다 — AI 미제공 고지를 확인한다", async () => {
    exam = {
      ...exam,
      questions: [
        { id: "q1", type: "multiple-choice", text: "..." },
        { id: "q2", type: "true-false", text: "..." },
      ],
    };

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(recordOnboardingEvent).toHaveBeenCalled();
  });

  it("문항 정보가 없어도 ACK 를 만든다 — 고지는 시험 유형과 무관하다", async () => {
    exam = { ...exam, questions: null };

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(recordOnboardingEvent).toHaveBeenCalled();
  });

  // 이 단언은 한 번 뒤집혔다.
  //
  // 예전에는 기록이 영속되지 않으면 500 을 돌려줘서 "확인 시각 없는 응시" 를
  // 막았다. 그런데 그러면 onboarding_events 가 잠시 흔들리는 것만으로
  // **모든 학생이 모든 시험에 입장하지 못한다.** 계측 장애를 시험 중단으로
  // 바꾸는 거래고, 이 저장소는 admit_exam_session 에서 같은 상황을 이미
  // fail-open 으로 판단했다.
  //
  // 진짜 불변식은 "쓰지도 않은 기록을 근거로 고지를 숨기지 않는다" 이고,
  // 그건 아래 "고지 재노출 차단 배선" describe 가 지키는 읽기 경로의 일이다.
  it("확인 기록이 영속되지 않아도 응시를 막지 않는다", async () => {
    recordOnboardingEvent.mockResolvedValue(false);
    hasOnboardingEvent.mockResolvedValue(false);

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
  });

  it("그래도 조용히 지나가지는 않는다", async () => {
    // #324: 기록 실패가 무음이면 관측을 잃었는지도 모른 채 몇 주가 간다.
    recordOnboardingEvent.mockResolvedValue(false);
    hasOnboardingEvent.mockResolvedValue(false);

    await acceptPreflight();

    expect(logError).toHaveBeenCalledWith(
      "[preflight] disclosure_ack_not_persisted",
      expect.any(Error),
      expect.objectContaining({ additionalData: expect.objectContaining({ examId: "exam-1" }) })
    );
  });

  it("기록이 이미 있으면 중복 수락도 성공한다", async () => {
    recordOnboardingEvent.mockResolvedValue(false);
    hasOnboardingEvent.mockResolvedValue(true);

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
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
