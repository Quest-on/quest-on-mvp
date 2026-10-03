/**
 * 분석 기록과 그림의 권한 확인 라우트 (이슈 #545)
 *
 *   GET /api/session/[sessionId]/analysis
 *   GET /api/session/[sessionId]/analysis/figures/[messageId]/[file]
 *
 * 본인 세션 학생과 그 시험을 만든 교수만 연다. 다른 학생과 다른 교수는 403. 기록에 없는 그림 경로는 404.
 * 동의 게이트 분류는 시험 연속성이고 라우트가 동의 판정을 다시 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { classifyRoute } from "@/lib/consent-route-policy";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  consent: vi.fn(),
  signed: [] as string[],
  db: {
    session: null as Row | null,
    exam: null as Row | null,
    message: null as Row | null,
    aiMessages: [] as Row[],
  },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: h.currentUser }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  RATE_LIMITS: { sessionRead: { limit: 30, windowSec: 60 }, analysisFigure: { limit: 120, windowSec: 60 } },
}));
vi.mock("@/lib/consent-route-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/consent-route-policy")>();
  return { ...actual, assertConsentOrRespond: h.consent };
});
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(async (path: string, ttl: number) => {
          h.signed.push(`${path}@${ttl}`);
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/analysis-outputs/${path}?token=t` }, error: null };
        }),
      }),
    },
    from(table: string) {
      const filters: Row = {};
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.order = () => b;
      b.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      };
      b.maybeSingle = async () => {
        if (table === "sessions") return { data: h.db.session && filters.id === h.db.session.id ? h.db.session : null, error: null };
        if (table === "exams") return { data: h.db.exam, error: null };
        if (table === "messages") {
          const m = h.db.message;
          return { data: m && filters.id === m.id && filters.session_id === m.session_id ? m : null, error: null };
        }
        return { data: null, error: null };
      };
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: h.db.aiMessages, error: null }).then(resolve);
      return b;
    },
  }),
}));

import { GET as LIST } from "@/app/api/session/[sessionId]/analysis/route";
import { GET as FIGURE } from "@/app/api/session/[sessionId]/analysis/figures/[messageId]/[file]/route";

const SID = "00000000-0000-4000-8000-0000000000aa";
const MID = "00000000-0000-4000-8000-0000000000bb";
const EXAM_ID = "00000000-0000-4000-8000-000000000001";

function analysisMetadata() {
  return {
    analysis: {
      v: 1,
      container_id: "cntr_secret",
      files: [{ name: "a.xlsx", path: "/mnt/data/file-x-a.xlsx", file_id: "file-x", source: "https://s/a.xlsx" }],
      cells: [
        {
          index: 1,
          status: "completed",
          code: "print(1)",
          logs: "1\n",
          figures: [{ path: `${SID}/${MID}/1.png`, mime: "image/png", bytes: 10, sha256: "h" }],
        },
      ],
      cited_figures: [],
      outcome: "completed",
      notices: [],
      elapsed_ms: 10,
    },
  };
}

const req = () => new Request("https://example.test/") as unknown as Parameters<typeof LIST>[0];
const listParams = (sessionId = SID) => ({ params: Promise.resolve({ sessionId }) });
const figParams = (file = "1.png", messageId = MID, sessionId = SID) => ({ params: Promise.resolve({ sessionId, messageId, file }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.signed.length = 0;
  h.consent.mockResolvedValue(null);
  h.db.session = { id: SID, exam_id: EXAM_ID, student_id: "student-1" };
  h.db.exam = { id: EXAM_ID, instructor_id: "prof-1" };
  h.db.message = { id: MID, session_id: SID, role: "ai", metadata: analysisMetadata() };
  h.db.aiMessages = [
    { id: MID, q_idx: 0, created_at: "2026-10-03T05:00:00.000Z", metadata: analysisMetadata() },
    { id: "plain", q_idx: 0, created_at: "2026-10-03T04:00:00.000Z", metadata: { rag: {} } },
  ];
});

const VIEWERS: Array<[string, Row, number]> = [
  ["본인 세션 학생", { id: "student-1", role: "student" }, 200],
  ["그 시험의 교수", { id: "prof-1", role: "instructor" }, 200],
  ["다른 학생", { id: "student-2", role: "student" }, 403],
  ["다른 교수", { id: "prof-2", role: "instructor" }, 403],
];

describe("GET /api/session/[sessionId]/analysis", () => {
  it.each(VIEWERS)("%s → %i", async (_label, user, status) => {
    h.currentUser.mockResolvedValue(user);
    const res = await LIST(req(), listParams());
    expect(res.status).toBe(status);
    if (status === 200) {
      const body = (await res.json()) as { turns: Row[] };
      expect(body.turns).toHaveLength(1);
      expect(body.turns[0]).toMatchObject({ messageId: MID, qIdx: 0, createdAt: "2026-10-03T05:00:00.000Z", outcome: "completed" });
      expect(JSON.stringify(body)).not.toContain("cntr_secret");
      expect(JSON.stringify(body)).not.toContain("file-x");
    }
  });

  it("로그인하지 않으면 401, 세션이 없으면 404, id 가 uuid 가 아니면 400", async () => {
    h.currentUser.mockResolvedValue(null);
    expect((await LIST(req(), listParams())).status).toBe(401);
    h.currentUser.mockResolvedValue({ id: "student-1", role: "student" });
    expect((await LIST(req(), listParams("00000000-0000-4000-8000-0000000000ff"))).status).toBe(404);
    expect((await LIST(req(), listParams("not-a-uuid"))).status).toBe(400);
  });

  it("동의 게이트가 막으면 그 응답을 그대로 돌려준다", async () => {
    h.currentUser.mockResolvedValue({ id: "student-1", role: "student" });
    h.consent.mockResolvedValue(NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 428 }));
    expect((await LIST(req(), listParams())).status).toBe(428);
  });
});

describe("GET /api/session/[sessionId]/analysis/figures/[messageId]/[file]", () => {
  it.each(VIEWERS)("%s → %i", async (_label, user, status) => {
    h.currentUser.mockResolvedValue(user);
    const res = await FIGURE(req(), figParams());
    expect(res.status).toBe(status === 200 ? 302 : status);
    if (status === 200) {
      expect(res.headers.get("location")).toContain(`analysis-outputs/${SID}/${MID}/1.png`);
      expect(res.headers.get("cache-control")).toBe("private, max-age=45");
      expect(h.signed).toEqual([`${SID}/${MID}/1.png@60`]);
    } else {
      expect(h.signed).toEqual([]);
    }
  });

  it("기록에 없는 그림, 다른 세션의 메시지는 404 이고 서명하지 않는다", async () => {
    h.currentUser.mockResolvedValue({ id: "student-1", role: "student" });
    expect((await FIGURE(req(), figParams("2.png"))).status).toBe(404);
    h.db.message = { ...h.db.message!, session_id: "00000000-0000-4000-8000-0000000000cc" };
    expect((await FIGURE(req(), figParams("1.png"))).status).toBe(404);
    expect(h.signed).toEqual([]);
  });

  it("동의 게이트가 막으면 그 응답을 그대로 돌려주고 서명하지 않는다", async () => {
    h.currentUser.mockResolvedValue({ id: "student-1", role: "student" });
    h.consent.mockResolvedValue(NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 428 }));
    const res = await FIGURE(req(), figParams());
    expect(res.status).toBe(428);
    expect(h.signed).toEqual([]);
  });

  it("그림 이름 모양이 틀리면(경로 조작) 400", async () => {
    h.currentUser.mockResolvedValue({ id: "student-1", role: "student" });
    for (const bad of ["..%2F1.png", "x.png", "1.svg"]) {
      expect((await FIGURE(req(), figParams(bad))).status, bad).toBe(400);
    }
  });
});

describe("동의 게이트 분류(시험 연속성)", () => {
  it("분석 라우트들은 exam_continuity 이고 다른 메서드나 경로는 protected 다", () => {
    expect(classifyRoute("/api/chat/analysis", "POST")).toBe("exam_continuity");
    expect(classifyRoute(`/api/session/${SID}/analysis`, "GET")).toBe("exam_continuity");
    expect(classifyRoute(`/api/session/${SID}/analysis/figures/${MID}/1.png`, "GET")).toBe("exam_continuity");
    expect(classifyRoute("/api/chat/analysis", "GET")).toBe("protected");
    expect(classifyRoute(`/api/session/${SID}/analysis`, "POST")).toBe("protected");
    expect(classifyRoute(`/api/session/${SID}/analysis/other`, "GET")).toBe("protected");
  });
});
