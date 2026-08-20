import { describe, expect, it } from "vitest";
import {
  AiDeadlineExhaustedError,
  DEFAULT_SAFETY_MARGIN_MS,
  MAX_SDK_RETRY_SLEEP_MS,
  createRouteDeadline,
  resolveAiRequestBudget,
} from "@/lib/ai-deadline";
import { resolveAiTaskProfile } from "@/lib/ai-task-profile";

const CLEAN_ENV: Record<string, string | undefined> = {};

function profile(task: Parameters<typeof resolveAiTaskProfile>[0]["task"]) {
  return resolveAiTaskProfile({ task, env: CLEAN_ENV }).profile;
}

describe("createRouteDeadline", () => {
  it("subtracts the safety margin from the route budget", () => {
    const deadline = createRouteDeadline({ startedAtMs: 1_000, maxDurationSec: 60 });
    expect(deadline).toBe(1_000 + 60_000 - DEFAULT_SAFETY_MARGIN_MS);
  });
});

describe("resolveAiRequestBudget — deadline clamps effective retries", () => {
  it("clamps a 60s route down to zero retries while keeping the requested value", () => {
    // 60초 라우트: 안전 여유를 빼면 50초. 재시도 1회는 최악 60초 sleep 을 예약해야 하므로 불가능하다.
    const p = profile("bulk_grading_worker");
    const budget = resolveAiRequestBudget({ profile: p, deadlineMs: 50_000, nowMs: 0 });

    expect(budget.requestedMaxRetries).toBe(2);
    expect(budget.effectiveMaxRetries).toBe(0);
    expect(budget.transportAttemptsUpperBound).toBe(1);
    expect(budget.timeout).toBeLessThanOrEqual(p.timeoutMs);
    expect(budget.timeout).toBeGreaterThan(0);
  });

  it("allows the full requested retries when the budget is large", () => {
    const p = profile("bulk_grading_worker");
    // 2회 재시도는 최악 2*60초 sleep + 3회 시도를 감당할 예산이 필요하다.
    const generous = 3 * (1_000 + 250) + 2 * MAX_SDK_RETRY_SLEEP_MS + 10_000;
    const budget = resolveAiRequestBudget({ profile: p, deadlineMs: generous, nowMs: 0 });

    expect(budget.effectiveMaxRetries).toBe(2);
    expect(budget.transportAttemptsUpperBound).toBe(3);
  });

  it("keeps the SSE profile at zero requested and zero effective", () => {
    const p = profile("assignment_chat_stream");
    const budget = resolveAiRequestBudget({ profile: p, deadlineMs: 50_000, nowMs: 0 });

    expect(budget.requestedMaxRetries).toBe(0);
    expect(budget.effectiveMaxRetries).toBe(0);
  });

  it("never lets the attempt timeout exceed the profile timeout", () => {
    const p = profile("auto_grading_question");
    const budget = resolveAiRequestBudget({ profile: p, deadlineMs: 10_000_000, nowMs: 0 });
    expect(budget.timeout).toBe(p.timeoutMs);
  });

  it("fails before calling OpenAI when the budget cannot fund one useful attempt", () => {
    const p = profile("bulk_grading_worker");
    expect(() => resolveAiRequestBudget({ profile: p, deadlineMs: 500, nowMs: 0 })).toThrow(
      AiDeadlineExhaustedError
    );
  });

  it("reports the remaining budget for observability", () => {
    const p = profile("bulk_grading_worker");
    const budget = resolveAiRequestBudget({ profile: p, deadlineMs: 50_000, nowMs: 10_000 });
    expect(budget.remainingBudgetMs).toBe(40_000);
  });

  it("produces a signal that aborts, and honours an external signal", () => {
    const p = profile("bulk_grading_worker");
    const external = new AbortController();
    const budget = resolveAiRequestBudget({
      profile: p,
      deadlineMs: 50_000,
      nowMs: 0,
      externalSignal: external.signal,
    });

    expect(budget.signal.aborted).toBe(false);
    external.abort(new Error("client gone"));
    expect(budget.signal.aborted).toBe(true);
  });
});
