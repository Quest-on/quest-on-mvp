import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  callOpenAIWithTelemetry,
  isOpenAITimeoutError,
  openai,
  getOpenAI,
} from "@/lib/openai";

/**
 * 재시도 계층 불변식 (이슈 #118, AC-7/10/11)
 *
 * 이 이슈가 고친 실제 결함:
 *   SDK 기본 maxRetries=2 (설정한 적 없음) × 래퍼 수동 루프 3회 × QStash 3회
 *   = 한 번의 논리적 호출이 최악 27회 전송.
 * 게다가 `Promise.race` 타임아웃은 진 쪽을 취소하지 않아 좀비 요청을 남겼고,
 * 그 120초 예산은 maxDuration=60 라우트에서 애초에 도달할 수 없었다.
 *
 * 여기 있는 테스트가 깨지면 그 결함이 되살아난 것이다.
 */

const OPENAI_SOURCE = readFileSync(path.join(process.cwd(), "lib", "openai.ts"), "utf8");

/**
 * 구조 검사는 **코드만** 봐야 한다. 이 파일들의 주석은 옛 결함을 설명하느라
 * `Promise.race` 같은 문자열을 그대로 담고 있어서, 주석을 지우지 않으면
 * 가드가 자기 설명문에 걸려 오탐한다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const OPENAI_CODE = stripComments(OPENAI_SOURCE);

describe("client construction closes hidden SDK retries", () => {
  it("sets maxRetries to 0 on the eager client", () => {
    expect((openai as unknown as { maxRetries: number }).maxRetries).toBe(0);
  });

  it("sets maxRetries to 0 on the lazy client", () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      expect((getOpenAI() as unknown as { maxRetries: number }).maxRetries).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
});

describe("the transport wrapper no longer owns retry or timeout", () => {
  it("calls the thunk exactly once on success", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await callOpenAIWithTelemetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.data).toBe("ok");
  });

  it("does not retry a failure — one logical operation, one call", async () => {
    // 예전 래퍼는 5xx/429 를 3회까지 재시도했다. 이제는 SDK 요청 옵션만이 재시도한다.
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("boom"), { status: 500 });
    });

    await expect(callOpenAIWithTelemetry(fn)).rejects.toThrow(/OpenAI call failed/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports attemptCount as a logical operation count, not wire attempts", async () => {
    const result = await callOpenAIWithTelemetry(async () => "ok");
    expect(result.attemptCount).toBe(1);
  });

  it("still measures latency", async () => {
    const result = await callOpenAIWithTelemetry(async () => "ok");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("exposes no timeout or retry knobs on its signature", () => {
    // 죽은 옵션을 남겨 두면 호출부가 설정했다고 착각한다.
    expect(callOpenAIWithTelemetry.length).toBe(1);
  });
});

describe("structural guards against the old defect", () => {
  it("contains no Promise.race timeout", () => {
    expect(OPENAI_CODE).not.toMatch(/Promise\.race/);
  });

  it("contains no manual backoff or retry loop", () => {
    expect(OPENAI_CODE).not.toMatch(/RETRYABLE_STATUS/);
    expect(OPENAI_CODE).not.toMatch(/Math\.pow\(2, attempt\)/);
    expect(OPENAI_CODE).not.toMatch(/for \(let attempt/);
  });

  it("no longer declares an unreachable 120s module timeout", () => {
    expect(OPENAI_CODE).not.toMatch(/OPENAI_TIMEOUT_MS/);
  });

  it("keeps the global concurrency limiter", () => {
    expect(OPENAI_CODE).toMatch(/pLimit\(100\)/);
  });

  it("pins maxRetries 0 at both construction sites", () => {
    const occurrences = OPENAI_CODE.match(/maxRetries:\s*0/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});

describe("grading no longer runs its own transport retry loop", () => {
  const GRADING_CODE = stripComments(readFileSync(
    path.join(process.cwd(), "lib", "grading.ts"),
    "utf8"
  ));

  it("removed MAX_GRADING_RETRIES and its delay table", () => {
    expect(GRADING_CODE).not.toMatch(/MAX_GRADING_RETRIES/);
    expect(GRADING_CODE).not.toMatch(/RETRY_DELAYS_MS/);
  });

  it("passes retry and timeout as SDK request options instead", () => {
    // 타임아웃도 프로필이 상한을 갖는다 — ad-hoc 값만 쓰면 관리자 오버라이드가 무력화된다.
    expect(GRADING_CODE).toMatch(/timeout:\s*Math\.min\(\s*\w+Profile\.timeoutMs/);
    // 재시도 수는 하드코딩이 아니라 태스크 프로필에서 온다 — 관리자가 조정할 수 있어야 한다.
    expect(GRADING_CODE).toMatch(/maxRetries:\s*\w+Profile\.maxRetries/);
    expect(GRADING_CODE).not.toMatch(/maxRetries:\s*\d/);
  });

  it("takes its model from the resolved profile, never a hardcoded constant", () => {
    // 하드코딩된 모델이 남아 있으면 관리자 설정이 이 경로만 비켜 간다.
    expect(GRADING_CODE).not.toMatch(/AI_MODEL_HEAVY/);
    expect(GRADING_CODE).toMatch(/applyProfileToChatBody\(/);
    expect(GRADING_CODE).toMatch(/resolveAiTaskProfile\(/);
  });

  it("no longer disables wrapper retries through a dead option", () => {
    expect(GRADING_CODE).not.toMatch(/maxAttempts/);
  });
});

describe("timeout classification", () => {
  it("recognises the SDK connection timeout by name", () => {
    const err = new Error("timed out");
    err.name = "APIConnectionTimeoutError";
    expect(isOpenAITimeoutError(err)).toBe(true);
  });

  it("does not classify an ordinary error as a timeout", () => {
    expect(isOpenAITimeoutError(new Error("nope"))).toBe(false);
    expect(isOpenAITimeoutError(null)).toBe(false);
  });
});
