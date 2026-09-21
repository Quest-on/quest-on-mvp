import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_TASKS,
  TASK_REGISTRY,
  applyProfileToBody,
  deriveSessionSeed,
  resolveAiTaskProfile,
  validatePinnedProfile,
  type AiTask,
} from "@/lib/ai-task-profile";

const CLEAN_ENV: Record<string, string | undefined> = {};

/**
 * 이슈 #421 의 재현과, 코드리뷰에서 드러난 재발 입구들.
 *
 * staging 에서 CASE 일괄 가채점이 전부 실패했다. ai_events 의 실패 행은
 * feature=bulk_grading_execute, model=gpt-5.6-luna, error_code=unsupported_value 였고,
 * 같은 모델·같은 엔드포인트인 bulk_grading_chat_options 는 7/7 성공했다.
 * 두 호출의 유일한 차이가 temperature 다.
 *
 * 고정하는 것은 "기본값이 0이다" 가 아니라 **"요청 바디에 temperature 가 실리지 않는다"** 다.
 * 값이 들어올 수 있는 입구가 셋이라 셋 다 막는다:
 *   1. CODE_DEFAULTS
 *   2. 관리자 오버라이드 (resolve 단계)
 *   3. 핀된 스냅샷 (예전 배포가 쓴 값이 남아 있을 수 있다)
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function bodyFor(task: AiTask, overrides?: Parameters<typeof resolveAiTaskProfile>[0]["overrides"]) {
  const { profile } = resolveAiTaskProfile({ task, overrides, env: CLEAN_ENV });
  return applyProfileToBody(task, profile, {});
}

describe("어느 태스크도 temperature 를 보내지 않는다 (#421)", () => {
  it.each(AI_TASKS)("%s 의 기본 프로필에 temperature 가 없다", (task) => {
    const { profile } = resolveAiTaskProfile({ task, env: CLEAN_ENV });
    expect(profile).not.toHaveProperty("temperature");
  });

  it.each(AI_TASKS)("%s 의 요청 바디에 temperature 가 실리지 않는다", (task) => {
    expect(bodyFor(task)).not.toHaveProperty("temperature");
  });

  it.each(AI_TASKS)("%s 는 관리자 오버라이드로도 되살아나지 않는다", (task) => {
    expect(bodyFor(task, { [task]: { temperature: 0 } })).not.toHaveProperty("temperature");
  });

  it.each(AI_TASKS)("%s 는 핀된 스냅샷에 값이 남아 있어도 걷어낸다", (task) => {
    // 배포 전에 시작된 런의 스냅샷에는 temperature 가 들어 있다. QStash 재시도나
    // 스위퍼가 그 런을 다시 집으면 validatePinnedProfile 을 지나는데, 여기서
    // 안 걷으면 #421 이 그대로 재발한다.
    const base = resolveAiTaskProfile({ task, env: CLEAN_ENV }).profile;
    const stale = { ...base, temperature: 0 };
    expect(validatePinnedProfile(task, stale)).not.toHaveProperty("temperature");
  });

  it.each(AI_TASKS)("%s 는 레지스트리에서 temperature 를 미지원으로 선언한다", (task) => {
    expect(TASK_REGISTRY[task].supports.temperature).toBe(false);
  });
});

describe("temperature 를 뺀 자리를 seed 가 메운다", () => {
  it("채점 워커가 학생 세션 단위 seed 를 싣는다", () => {
    // temperature 0 을 걷어내면 프로바이더 기본 샘플링으로 떨어진다. 채점은
    // 같은 답안이 재시도마다 다른 점수를 받으면 안 되므로 seed 로 고정한다.
    // lib/grading.ts 의 요약 경로가 같은 이유로 먼저 쓰던 방식이다.
    const worker = read("app/api/internal/bulk-grade-worker/route.ts");
    expect(worker).toMatch(/seed:\s*deriveSessionSeed\(studentSessionId\)/);
    expect(TASK_REGISTRY.bulk_grading_worker.callsiteOwnedFields).toContain("seed");
  });

  it("seed 는 입력이 같으면 같은 값을 준다", () => {
    const a = deriveSessionSeed("89dbb864-b1b8-4166-ac2b-d95c34e8d1bf");
    const b = deriveSessionSeed("89dbb864-b1b8-4166-ac2b-d95c34e8d1bf");
    expect(a).toBe(b);
    expect(a).not.toBe(deriveSessionSeed("ffdf0f68-2a29-4b9e-bfcb-f38a35c280a4"));
    expect(Number.isInteger(a)).toBe(true);
  });

  it("seed 정의가 한 곳뿐이다", () => {
    // 같은 해시를 두 군데 두면 둘이 갈라지는 날 점수가 조용히 달라진다.
    const grading = read("lib/grading.ts");
    expect(grading).not.toMatch(/function deriveSessionSeed/);
    expect(grading).toMatch(/deriveSessionSeed/);
  });
});
