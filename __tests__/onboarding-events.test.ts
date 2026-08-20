import { describe, expect, it, beforeEach, vi } from "vitest";

const select = vi.fn();
const upsert = vi.fn(() => ({ select }));
const maybeSingle = vi.fn();
const eqEvent = vi.fn(() => ({ maybeSingle }));
const eqUser = vi.fn(() => ({ eq: eqEvent }));
const readSelect = vi.fn(() => ({ eq: eqUser }));
const supabaseMock = { from: vi.fn(() => ({ upsert, select: readSelect })) };

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import {
  ONBOARDING_EVENTS,
  hasOnboardingEvent,
  recordOnboardingEvent,
} from "@/lib/onboarding-events";

beforeEach(() => {
  select.mockReset();
  maybeSingle.mockReset();
  upsert.mockClear();
  readSelect.mockClear();
  eqUser.mockClear();
  eqEvent.mockClear();
  supabaseMock.from.mockClear();
});

describe("recordOnboardingEvent 멱등성 (AC-18)", () => {
  it("최초 기록은 새 행을 남기고 true 를 돌려준다", async () => {
    select.mockResolvedValueOnce({ data: [{ id: "evt-1" }], error: null });

    await expect(
      recordOnboardingEvent({
        userId: "u1",
        role: "instructor",
        event: ONBOARDING_EVENTS.DEMO_GRADED_VIEWED,
      })
    ).resolves.toBe(true);

    expect(supabaseMock.from).toHaveBeenCalledWith("onboarding_events");
  });

  // UNIQUE (user_id, event) + ignoreDuplicates 조합이라 중복은 오류가 아니다.
  it("같은 (user_id, event) 재기록은 오류 없이 false 를 돌려준다", async () => {
    select.mockResolvedValueOnce({ data: [], error: null });

    await expect(
      recordOnboardingEvent({
        userId: "u1",
        role: "instructor",
        event: ONBOARDING_EVENTS.DEMO_GRADED_VIEWED,
      })
    ).resolves.toBe(false);
  });

  it("중복을 무시하도록 onConflict 를 (user_id, event) 로 지정한다", async () => {
    select.mockResolvedValueOnce({ data: [{ id: "evt-2" }], error: null });

    await recordOnboardingEvent({
      userId: "u2",
      role: "student",
      event: ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u2", event: "student_disclosure_ack" }),
      { onConflict: "user_id,event", ignoreDuplicates: true }
    );
  });

  it("exam_id 와 metadata 기본값을 채운다", async () => {
    select.mockResolvedValueOnce({ data: [{ id: "evt-3" }], error: null });

    await recordOnboardingEvent({
      userId: "u3",
      role: "instructor",
      event: ONBOARDING_EVENTS.DEMO_CREATED,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ exam_id: null, metadata: {} }),
      expect.anything()
    );
  });
});

describe("계측 실패는 제품 동작을 막지 않는다", () => {
  it("DB 오류에도 throw 하지 않고 false 를 돌려준다", async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(
      recordOnboardingEvent({
        userId: "u4",
        role: "instructor",
        event: ONBOARDING_EVENTS.FIRST_PUBLISH,
      })
    ).resolves.toBe(false);
  });

  it("클라이언트가 던져도 삼키고 false 를 돌려준다", async () => {
    select.mockRejectedValueOnce(new Error("network"));

    await expect(
      recordOnboardingEvent({
        userId: "u5",
        role: "student",
        event: ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION,
      })
    ).resolves.toBe(false);
  });
});

describe("hasOnboardingEvent — 게이팅 근거 (AC-15)", () => {
  it("행이 있으면 true 다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "evt-1" }, error: null });

    await expect(
      hasOnboardingEvent("u1", ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK)
    ).resolves.toBe(true);

    expect(supabaseMock.from).toHaveBeenCalledWith("onboarding_events");
    expect(eqUser).toHaveBeenCalledWith("user_id", "u1");
    expect(eqEvent).toHaveBeenCalledWith("event", "student_disclosure_ack");
  });

  it("행이 없으면 false 다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      hasOnboardingEvent("u2", ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK)
    ).resolves.toBe(false);
  });

  // 조회 장애 시 true 를 돌려주면 고지를 못 받은 학생이 그냥 응시하게 된다.
  // 한 번 더 보여주는 쪽이 실패의 안전한 방향이다.
  it("조회가 실패하면 false 다 — 고지를 다시 보여주는 쪽으로 실패한다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("db down") });

    await expect(
      hasOnboardingEvent("u3", ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK)
    ).resolves.toBe(false);
  });

  it("예외가 나도 throw 하지 않는다 — 계측이 응시를 막지 않는다", async () => {
    maybeSingle.mockRejectedValueOnce(new Error("boom"));

    await expect(
      hasOnboardingEvent("u4", ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK)
    ).resolves.toBe(false);
  });
});
