import { describe, expect, it, beforeEach, vi } from "vitest";

const select = vi.fn();
const upsert = vi.fn(() => ({ select }));
const supabaseMock = { from: vi.fn(() => ({ upsert })) };

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import {
  ONBOARDING_EVENTS,
  recordOnboardingEvent,
} from "@/lib/onboarding-events";

beforeEach(() => {
  select.mockReset();
  upsert.mockClear();
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
