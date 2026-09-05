import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  record: vi.fn(),
  isDemoPreview: vi.fn(),
  triggerGrading: vi.fn(),
  audit: vi.fn(),
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => mocks.supabase }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: mocks.rateLimit,
  RATE_LIMITS: { submission: {} },
}));
vi.mock("@/lib/compression", () => ({
  compressData: () => ({ data: "compressed", metadata: {} }),
}));
vi.mock("@/lib/onboarding-events", () => ({
  ONBOARDING_EVENTS: {
    DEMO_ANSWERED: "demo_answered",
    FIRST_PUBLISH: "first_publish",
    FIRST_STUDENT_SUBMISSION: "first_student_submission",
    STUDENT_DISCLOSURE_ACK: "student_disclosure_ack",
  },
  recordOnboardingEvent: mocks.record,
  hasOnboardingEvent: vi.fn(async () => false),
}));
vi.mock("@/lib/demo-completion", () => ({ isDemoPreview: mocks.isDemoPreview }));
vi.mock("@/lib/grading-trigger", () => ({ triggerGradingIfNeeded: mocks.triggerGrading }));
vi.mock("@/lib/audit", () => ({ auditLog: mocks.audit }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

import { POST } from "@/app/api/feedback/route";
import { initExamSession } from "@/app/api/supa/handlers/session-handlers";

type Result = { data: unknown; error: unknown };

function chain({ single, maybeSingle, selected, awaited }: {
  single?: Result;
  maybeSingle?: Result;
  selected?: Result;
  awaited?: Result;
} = {}) {
  const result = awaited ?? { data: null, error: null };
  const builder = {
    select: vi.fn(() => selected ? Promise.resolve(selected) : builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(single ?? { data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingle ?? { data: null, error: null }),
    then: vi.fn((resolve: (value: Result) => unknown) => Promise.resolve(resolve(result))),
  };
  return builder;
}

function queueTables(tables: Record<string, ReturnType<typeof chain>[]>) {
  mocks.supabase.from.mockImplementation((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`Missing mock for ${table}`);
    return next;
  });
}

function request(sessionId = "session-1") {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ examCode: "EXAM", examId: "exam-1", sessionId, answers: [{ text: "answer" }] }),
  }) as NextRequest;
}

function feedbackTables(exam: Record<string, unknown>, submitted = false) {
  return {
    exams: [chain({ single: { data: exam, error: null } })],
    sessions: [
      chain({ single: { data: { id: "session-1", student_id: "student-1", exam_id: "exam-1", submitted_at: submitted ? "2026-01-01" : null, created_at: "2026-01-01", attempt_timer_started_at: null, started_at: null }, error: null } }),
      chain({ maybeSingle: { data: { id: "session-1" }, error: null } }),
    ],
    submissions: [chain({ selected: { data: [], error: null } })],
    messages: [chain({ awaited: { data: [], error: null } })],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "student-1" });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.record.mockResolvedValue(true);
  mocks.isDemoPreview.mockReturnValue(false);
  mocks.triggerGrading.mockResolvedValue({ queued: true });
  mocks.audit.mockResolvedValue(true);
  mocks.supabase.rpc.mockResolvedValue({ data: { admitted: true }, error: null });
});

describe("onboarding funnel milestones", () => {
  it("records demo_answered for an instructor demo submission without blocking success when recording returns false", async () => {
    mocks.record.mockResolvedValue(false);
    mocks.isDemoPreview.mockReturnValue(true);
    queueTables(feedbackTables({ id: "exam-1", code: "EXAM", status: "draft", duration: 0, is_demo: true, instructor_id: "student-1" }));

    expect((await POST(request())).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith({ userId: "student-1", role: "instructor", event: "demo_answered", examId: "exam-1" });
  });

  it("records first_student_submission for the instructor, not a regular student", async () => {
    queueTables(feedbackTables({ id: "exam-1", code: "EXAM", status: "running", duration: 0, is_demo: false, instructor_id: "instructor-1" }));

    expect((await POST(request())).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith({ userId: "instructor-1", role: "instructor", event: "first_student_submission", examId: "exam-1" });
    expect(mocks.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: "demo_answered" }));
  });

  it("does not record a submission milestone when demo ownership is indeterminate", async () => {
    mocks.isDemoPreview.mockReturnValue(null);
    queueTables(feedbackTables({ id: "exam-1", code: "EXAM", status: "running", duration: 0, is_demo: false, instructor_id: "instructor-1" }));

    expect((await POST(request())).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does not record a milestone for an already submitted session", async () => {
    queueTables(feedbackTables({ id: "exam-1", code: "EXAM", status: "running", duration: 0, is_demo: true, instructor_id: "student-1" }, true));

    expect((await POST(request())).status).toBe(409);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("records first_publish for an admitted non-demo cold-start session", async () => {
    queueTables({
      exams: [chain({ single: { data: { id: "exam-1", code: "EXAM", status: "running", duration: 0, is_demo: false, instructor_id: "instructor-1" }, error: null } })],
      sessions: [
        chain({ maybeSingle: { data: null, error: null } }),
        chain({ maybeSingle: { data: null, error: null } }),
        chain({ maybeSingle: { data: { id: "session-1" }, error: null } }),
        chain({ maybeSingle: { data: { id: "session-1" }, error: null } }),
      ],
      submissions: [chain({ selected: { data: [], error: null } })],
      messages: [chain({ awaited: { data: [], error: null } })],
    });

    expect((await POST(request(""))).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith({ userId: "instructor-1", role: "instructor", event: "first_publish", examId: "exam-1" });
  });

  it("does not record first_publish for a demo admission", async () => {
    queueTables({
      exams: [chain({ single: { data: { id: "exam-1", code: "EXAM", status: "running", duration: 0, is_demo: true, instructor_id: "instructor-1" }, error: null } })],
      sessions: [chain({ maybeSingle: { data: null, error: null } }), chain({ maybeSingle: { data: null, error: null } }), chain({ maybeSingle: { data: { id: "session-1" }, error: null } }), chain({ maybeSingle: { data: { id: "session-1" }, error: null } })],
      submissions: [chain({ selected: { data: [], error: null } })],
      messages: [chain({ awaited: { data: [], error: null } })],
    });

    expect((await POST(request(""))).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: "first_publish" }));
  });

  it("records first_publish from initExamSession for an admitted non-demo session", async () => {
    queueTables({
      exams: [chain({ single: { data: { id: "exam-1", code: "EXAM", title: "Exam", status: "running", duration: 0, is_demo: false, instructor_id: "instructor-1", questions: [], rubric_public: false, type: "exam", open_at: null, close_at: null, started_at: null, deadline: null }, error: null } })],
      sessions: [
        chain({ awaited: { data: [], error: null } }),
        chain({ maybeSingle: { data: { id: "session-1", created_at: "2026-01-01", status: "in_progress" }, error: null } }),
      ],
      submissions: [chain({ awaited: { data: [], error: null } })],
    });

    expect((await initExamSession({ examCode: "EXAM", studentId: "student-1" })).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith({ userId: "instructor-1", role: "instructor", event: "first_publish", examId: "exam-1" });
  });
});
