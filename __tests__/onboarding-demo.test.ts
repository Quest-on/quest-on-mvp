/**
 * 온보딩 JTBD 2문항 → 데모 시험 생성 (이슈 #82 / 스펙 AC-4·AC-5·AC-6).
 *
 * 가장 중요한 인수 조건은 **"이 과정에서 OpenAI 호출이 0회"** 다. 데모가 AI 를
 * 부르면 (1) 엉터리 생성물이 첫인상을 망치고 (2) 미인증 계정에 비용이 노출된다.
 * 그래서 템플릿 선택은 순수 함수고, 라우트는 그 결과를 그대로 넣는다.
 *
 * 두 번째로 중요한 건 **멱등성**이다. 온보딩은 새로고침·뒤로가기·중복 클릭이
 * 일상인 화면이라, 데모가 쌓이면 드라이브가 지저분해지고 무엇이 "그" 데모인지
 * 알 수 없게 된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const USER_ID = "instructor-1";

type RecordedEvent = {
  userId: string;
  role: string;
  event: string;
  examId?: string | null;
  metadata?: Record<string, unknown>;
};

const createExam = vi.fn(
  async (_payload: Record<string, unknown>): Promise<Response> => {
    throw new Error("createExam mock not stubbed");
  }
);
const recordOnboardingEvent = vi.fn(async (_params: RecordedEvent) => true);
let sessionUser: { id: string; role: string } | null = {
  id: USER_ID,
  role: "instructor",
};
let existingDemo: Record<string, unknown> | null = null;
let lookupError: Error | null = null;

const maybeSingle = vi.fn();
const eqCalls: Array<[string, unknown]> = [];

vi.mock("@/lib/get-current-user", () => ({
  currentUser: async () => sessionUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { examControl: { limit: 10, windowSec: 60 } },
}));

vi.mock("@/lib/logger", () => ({ logError: () => {} }));

vi.mock("@/app/api/supa/handlers/exam-handlers", () => ({ createExam }));

vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: {
    INTAKE_SUBMITTED: "intake_submitted",
    DEMO_CREATED: "demo_created",
  },
  recordOnboardingEvent,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (...args: [string, unknown]) => {
          eqCalls.push(args);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle,
      };
      return chain;
    },
  }),
}));

async function callDemo(body: unknown) {
  const { POST } = await import("../app/api/onboarding/demo/route");
  const request = new Request("https://quest-on.app/api/onboarding/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request as never);
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  sessionUser = { id: USER_ID, role: "instructor" };
  existingDemo = null;
  lookupError = null;
  maybeSingle.mockImplementation(async () =>
    lookupError ? { data: null, error: lookupError } : { data: existingDemo, error: null }
  );
  createExam.mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, exam: { id: "exam-1", code: "ABC123", title: "[데모] 주장과 근거 서술" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
  recordOnboardingEvent.mockResolvedValue(true);
});

describe("POST /api/onboarding/demo — 데모 생성 (AC-5)", () => {
  it("교수자가 아니면 403 이고 아무것도 만들지 않는다", async () => {
    sessionUser = { id: "student-1", role: "student" };

    const res = await callDemo({ subject: "business" });

    expect(res.status).toBe(403);
    expect(createExam).not.toHaveBeenCalled();
  });

  it("비로그인은 401 이다", async () => {
    sessionUser = null;

    expect((await callDemo({})).status).toBe(401);
    expect(createExam).not.toHaveBeenCalled();
  });

  it("intake 답에 맞는 템플릿으로 is_demo=true exam 을 만든다", async () => {
    const res = await callDemo({
      subject: "engineering",
      language: "ko",
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);

    const payload = createExam.mock.calls[0][0] as Record<string, any>;
    expect(payload.is_demo).toBe(true);
    // 데모는 항상 시험이다. 과제형은 교수자가 학생 시점으로 겪을 경로가 없어
    // 계약에서 뺐다 — 겪을 수 없는 데모를 만드는 건 도움이 아니다.
    expect(payload.type).toBe("exam");
    expect(payload.status).toBe("draft");
    expect(payload.questions).toHaveLength(1);
    // 공학 템플릿이 실제로 선택됐는지 — 아무 템플릿이나 나오면 AC-5 가 의미 없다.
    expect(payload.questions[0].text).toContain("캐시");
    expect(payload.rubric).toBeTruthy();
  });

  it("이미 데모가 있으면 새로 만들지 않고 기존 것을 돌려준다", async () => {
    existingDemo = { id: "exam-old", code: "OLD123", title: "[데모] 기존" };

    const res = await callDemo({ subject: "business" });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.examId).toBe("exam-old");
    expect(createExam).not.toHaveBeenCalled();
    // 중복 방지는 is_demo 로 좁힌 조회에 달려 있다.
    expect(eqCalls).toContainEqual(["is_demo", true]);
    expect(eqCalls).toContainEqual(["instructor_id", USER_ID]);
  });

  it("기존 데모 조회가 실패하면 만들지 않고 500 이다 — 조용히 하나 더 만들지 않는다", async () => {
    lookupError = new Error("db down");

    const res = await callDemo({ subject: "business" });

    expect(res.status).toBe(500);
    expect(createExam).not.toHaveBeenCalled();
  });

  it("스키마 밖 필드는 거부한다 — 데모 생성으로 임의 컬럼을 쓰지 못한다", async () => {
    const res = await callDemo({ is_demo: false, instructor_id: "other" });

    expect(res.status).toBe(400);
    expect(createExam).not.toHaveBeenCalled();
  });
});

describe("건너뛰기 (AC-6)", () => {
  it("본문 없이 불러도 기본 템플릿으로 데모를 만든다", async () => {
    const res = await callDemo({ skipped: true });

    expect(res.status).toBe(200);
    const payload = createExam.mock.calls[0][0] as Record<string, any>;
    expect(payload.is_demo).toBe(true);
    expect(payload.type).toBe("exam");
  });

  it("건너뛴 사실을 마일스톤에 남긴다 — 발행 직전 재질문의 근거다", async () => {
    await callDemo({ skipped: true });

    const intake = recordOnboardingEvent.mock.calls.find(
      (call) => call[0].event === "intake_submitted"
    );
    expect(intake?.[0].metadata?.skipped).toBe(true);
  });
});

describe("마일스톤 기록 (AC-7 계측)", () => {
  it("intake_submitted 와 demo_created 를 둘 다 남긴다", async () => {
    await callDemo({ subject: "health" });

    const events = recordOnboardingEvent.mock.calls.map(
      (call) => call[0].event
    );
    expect(events).toContain("intake_submitted");
    expect(events).toContain("demo_created");
  });

  it("계측이 실패해도 데모 생성은 성공이다", async () => {
    recordOnboardingEvent.mockResolvedValue(false);

    const res = await callDemo({ subject: "health" });

    expect(res.status).toBe(200);
    expect(res.body.examId).toBe("exam-1");
  });

  it("intake 답을 metadata 로 남긴다 — 세그먼트 분석의 유일한 근거다", async () => {
    await callDemo({ subject: "humanities" });

    const intake = recordOnboardingEvent.mock.calls.find(
      (call) => call[0].event === "intake_submitted"
    );
    expect(intake?.[0].metadata).toMatchObject({
      subject: "humanities",
    });
  });
});

describe("AI 호출 0회 (AC-5 핵심)", () => {
  const routeSource = readFileSync("app/api/onboarding/demo/route.ts", "utf8");
  const templateSource = readFileSync("lib/demo-templates.ts", "utf8");

  it("데모 경로가 OpenAI/AI 헬퍼를 import 하지 않는다", () => {
    for (const source of [routeSource, templateSource]) {
      expect(source).not.toMatch(/from "@\/lib\/openai"/);
      expect(source).not.toMatch(/from "openai"/);
      expect(source).not.toMatch(/generate-questions|createChatCompletion|trackedChat/);
    }
  });

  it("템플릿은 정적 데이터다 — 런타임 fetch 가 없다", () => {
    expect(templateSource).not.toMatch(/\bfetch\(/);
  });
});
