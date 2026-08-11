/**
 * 교수자 데모 응시의 계측 격리 (이슈 #167).
 *
 * #128(고지 ACK 기록)과 #166(교수자가 자기 데모를 학생 시점으로 응시) 각각은
 * 멀쩡한데 합쳐지니 **교수자 id 가 role:"student" 로 학생 퍼널에 박혔다.**
 * 데모 템플릿은 전부 서술형이라 고지 노출 판정이 항상 참이 되므로, 온보딩을
 * 마친 교수자 전원이 오염됐다. 에픽 DoD 가 `COUNT(DISTINCT user_id)` 로 학생
 * 지표를 산출하기 때문에 지표가 교수자 수만큼 부풀어 있었다.
 *
 * 고지 자체는 계속 보여준다 — 안 보여주는 게 아니라 **안 세는** 것이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const USER_ID = "instructor-1";
const SESSION_ID = "3f1d4b2a-1111-4111-8111-111111111111";

const recordOnboardingEvent = vi.fn(async () => true);

vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: { STUDENT_DISCLOSURE_ACK: "student_disclosure_ack" },
  recordOnboardingEvent,
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
  questions: [{ id: "q1", type: "essay", text: "..." }],
  is_demo: false as unknown,
  instructor_id: "other-instructor" as unknown,
};

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
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { ...session, preflight_accepted_at: "now", status: "waiting" },
                  error: null,
                }),
              }),
            }),
            select: () => ({
              single: async () => ({
                data: { ...session, preflight_accepted_at: "now", status: "waiting" },
                error: null,
              }),
            }),
          }),
        }),
      };
      return chain;
    },
  }),
}));

async function acceptPreflight() {
  // 라우트를 매번 새로 받는다. beforeEach 에서만 리셋하면 첫 실행의 모듈
  // 초기화 순서에 따라 앞선 목이 붙은 인스턴스를 잡을 수 있다.
  vi.resetModules();
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
  vi.resetModules();
  recordOnboardingEvent.mockResolvedValue(true);
  exam.is_demo = false;
  exam.instructor_id = "other-instructor";
});

describe("데모 미리보기는 학생 고지 퍼널에 안 잡힌다 (#167)", () => {
  it("교수자가 자기 데모를 응시하면 ACK 를 기록하지 않는다", async () => {
    exam.is_demo = true;
    exam.instructor_id = USER_ID;

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(recordOnboardingEvent).not.toHaveBeenCalled();
  });

  it("일반 학생의 수락은 그대로 기록한다", async () => {
    exam.is_demo = false;
    exam.instructor_id = "other-instructor";

    const res = await acceptPreflight();

    expect(res.status).toBe(200);
    expect(recordOnboardingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "student_disclosure_ack", userId: USER_ID })
    );
  });

  it("미리보기여도 응시는 정상 진행된다 — 고지를 안 보여주는 게 아니라 안 세는 것이다", async () => {
    exam.is_demo = true;
    exam.instructor_id = USER_ID;

    const res = await acceptPreflight();

    expect(res.body.preflightAcceptedAt).toBeTruthy();
  });
});

describe("판정이 한 곳에만 있다", () => {
  const preflight = read("app/api/session/[sessionId]/preflight/route.ts");
  const feedback = read("app/api/feedback/route.ts");
  const sessions = read("app/api/supa/handlers/session-handlers.ts");

  it("세 호출부가 모두 공용 순수 판정을 쓴다", () => {
    // 판정식을 호출부마다 다시 쓰면 한쪽만 고쳐졌을 때 지표가 조용히 갈라진다.
    for (const source of [preflight, feedback, sessions]) {
      expect(source).toContain('from "@/lib/demo-completion"');
      expect(source).toMatch(/isDemoPreview\(\{/);
    }
  });

  it("인라인 판정식이 남아 있지 않다", () => {
    for (const source of [preflight, feedback, sessions]) {
      expect(source).not.toMatch(/is_demo === true && \w+\.instructor_id ===/);
    }
  });

  it("판정에 쓰는 컬럼을 기존 exam 조회에서 함께 읽는다", () => {
    // 별도 조회를 추가하면 학생 전원이 때리는 경로에 왕복이 하나씩 붙는다.
    expect(preflight).toMatch(/\.select\("[^"]*is_demo, instructor_id"\)/);
    expect(feedback).toMatch(/\.select\("[^"]*is_demo, instructor_id"\)/);
  });

  it("판정 불능일 때는 세지 않는다 — false 로 단정하지 않는다", () => {
    // null 을 false 로 뭉개면 018 미적용·조회 실패 때 오염이 다시 시작된다.
    expect(preflight).toMatch(/preview === false/);
    expect(feedback).toMatch(/preview === false/);
  });
});

describe("isDemoPreview 순수 판정", () => {
  it("데모 + 소유자면 true", async () => {
    const { isDemoPreview } = await import("../lib/demo-completion");
    expect(isDemoPreview({ isDemo: true, instructorId: "i1", userId: "i1" })).toBe(true);
  });

  it("데모인데 남이면 false — 실제 학생의 데모 응시는 세야 한다", async () => {
    const { isDemoPreview } = await import("../lib/demo-completion");
    expect(isDemoPreview({ isDemo: true, instructorId: "i1", userId: "s1" })).toBe(false);
  });

  it("일반 시험은 소유자가 들어와도 false", async () => {
    // 자기 시험에 세션을 만드는 건 미리보기가 아니다. 여기까지 열면 교수자가
    // 자기 시험 통계를 마음대로 오염시킬 수 있다.
    const { isDemoPreview } = await import("../lib/demo-completion");
    expect(isDemoPreview({ isDemo: false, instructorId: "i1", userId: "i1" })).toBe(false);
  });

  it("컬럼을 못 읽으면 null — false 로 단정하지 않는다", async () => {
    const { isDemoPreview } = await import("../lib/demo-completion");
    expect(isDemoPreview({ isDemo: undefined, instructorId: "i1", userId: "i1" })).toBeNull();
    expect(isDemoPreview({ isDemo: true, instructorId: undefined, userId: "i1" })).toBeNull();
    expect(isDemoPreview({ isDemo: null, instructorId: null, userId: "i1" })).toBeNull();
  });
});

describe("오염 데이터 정리 마이그레이션 (022)", () => {
  const sql = read("database/022_clean_demo_preview_metrics.sql");

  it("원자적이다", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it("데모 소유자의 행만 지운다 — 일반 학생 행은 건드리지 않는다", () => {
    expect(sql).toMatch(/e\.is_demo = true/);
    expect(sql).toMatch(/e\.instructor_id = oe\.user_id/);
    expect(sql).toMatch(/oe\.event = 'student_disclosure_ack'/);
  });

  it("데모의 student_count 를 되돌린다", () => {
    expect(sql).toMatch(/UPDATE public\.exams[\s\S]*?is_demo = true/);
  });

  it("멱등하다 — 대상이 없으면 아무것도 안 한다", () => {
    expect(sql).toMatch(/student_count <> 0/);
  });
});
