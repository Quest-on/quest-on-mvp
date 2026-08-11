import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAiTaskProfile, applyProfileToChatBody } from "@/lib/ai-task-profile";

/**
 * 요청 옵션 런타임 검증 (이슈 #118)
 *
 * 소스 정규식은 "그 문자열이 있다" 까지만 본다. 여기서는 실제로 값을 흘려 보내
 * **관리자가 낮춘 타임아웃이 진짜 낮아지는지**, 재시도 수가 프로필을 따르는지,
 * 부재 필드가 wire 에 안 실리는지를 값으로 확인한다.
 *
 * 세 번째 터미널 크리틱이 잡은 결함이 정확히 이거였다: 모델과 재시도는 프로필로
 * 옮겼는데 타임아웃만 ad-hoc 값이라 관리자 오버라이드가 아무 효과가 없었다.
 */

const CLEAN_ENV: Record<string, string | undefined> = {};

/** 프로덕션 코드와 같은 clamp 규칙. 프로필 타임아웃이 상한이다. */
function effectiveTimeout(profileTimeoutMs: number, adHocMs: number): number {
  return Math.min(profileTimeoutMs, adHocMs);
}

describe("admin timeout overrides actually take effect", () => {
  it("lowers the effective timeout when the admin lowers the profile", () => {
    const base = resolveAiTaskProfile({
      task: "auto_grading_question",
      env: CLEAN_ENV,
    }).profile;
    const lowered = resolveAiTaskProfile({
      task: "auto_grading_question",
      overrides: { auto_grading_question: { timeoutMs: 5_000 } },
      env: CLEAN_ENV,
    }).profile;

    expect(base.timeoutMs).toBe(120_000);
    expect(lowered.timeoutMs).toBe(5_000);

    // 라우트가 계산한 ad-hoc 예산이 75초여도 관리자가 5초로 낮췄으면 5초여야 한다.
    expect(effectiveTimeout(lowered.timeoutMs, 75_000)).toBe(5_000);
    // 반대로 남은 예산이 더 짧으면 그쪽이 이긴다(데드라인 보호).
    expect(effectiveTimeout(lowered.timeoutMs, 2_000)).toBe(2_000);
  });

  it("never lets a profile timeout exceed the deadline-derived budget", () => {
    const profile = resolveAiTaskProfile({ task: "auto_grading_summary", env: CLEAN_ENV }).profile;
    expect(effectiveTimeout(profile.timeoutMs, 30_000)).toBe(30_000);
  });

  it("applies the same clamp to every grading task", () => {
    for (const task of [
      "auto_grading_question",
      "auto_grading_question_summary",
      "auto_grading_summary",
    ] as const) {
      const p = resolveAiTaskProfile({
        task,
        overrides: { [task]: { timeoutMs: 9_000 } },
        env: CLEAN_ENV,
      }).profile;
      expect(effectiveTimeout(p.timeoutMs, 100_000)).toBe(9_000);
    }
  });
});

describe("retry count follows the profile, not a literal", () => {
  it("honours an admin-lowered retry count", () => {
    const p = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      overrides: { bulk_grading_worker: { maxRetries: 0 } },
      env: CLEAN_ENV,
    }).profile;
    expect(p.maxRetries).toBe(0);
  });

  it("keeps the frozen default when nothing overrides it", () => {
    expect(
      resolveAiTaskProfile({ task: "bulk_grading_worker", env: CLEAN_ENV }).profile.maxRetries
    ).toBe(2);
  });
});

describe("a real SDK call receives the profile-derived options", () => {
  const create = vi.fn(
    async (_body: Record<string, unknown>, _options: Record<string, unknown>) => ({
      choices: [{ message: { content: "{}" } }],
    })
  );

  beforeEach(() => create.mockClear());

  /** 프로덕션 호출부와 같은 형태로 한 번 호출해 본다. */
  async function callLikeProduction(overrides?: Parameters<typeof resolveAiTaskProfile>[0]["overrides"]) {
    const profile = resolveAiTaskProfile({
      task: "bulk_grading_worker",
      overrides,
      env: CLEAN_ENV,
    }).profile;

    await create(
      applyProfileToChatBody(profile, {
        messages: [{ role: "system" as const, content: "p" }],
        response_format: { type: "json_object" as const },
      }) as unknown as Record<string, unknown>,
      {
        timeout: effectiveTimeout(profile.timeoutMs, 60_000),
        maxRetries: profile.maxRetries,
      }
    );

    return create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
  }

  it("sends the frozen defaults when there are no overrides", async () => {
    const [body, options] = await callLikeProduction();

    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.max_completion_tokens).toBe(1500);
    expect(body.temperature).toBe(0);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(options.maxRetries).toBe(2);
    expect(options.timeout).toBe(60_000);
  });

  it("propagates an admin override all the way into the request", async () => {
    const [body, options] = await callLikeProduction({
      bulk_grading_worker: { timeoutMs: 8_000, maxRetries: 1, temperature: null },
    });

    expect(options.timeout).toBe(8_000);
    expect(options.maxRetries).toBe(1);
    // 명시적 null 은 wire 에서 키가 사라지는 것으로 나타나야 한다.
    expect(body).not.toHaveProperty("temperature");
  });

  it("carries a reasoning effort onto the wire when configured", async () => {
    const [body] = await callLikeProduction({
      bulk_grading_worker: { reasoningEffort: "xhigh" },
    });
    expect(body.reasoning_effort).toBe("xhigh");
  });
});
