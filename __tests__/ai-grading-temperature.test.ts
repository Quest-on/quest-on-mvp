import { describe, expect, it } from "vitest";
import {
  AI_TASKS,
  TASK_REGISTRY,
  applyProfileToBody,
  resolveAiTaskProfile,
  type AiTask,
} from "@/lib/ai-task-profile";

const CLEAN_ENV: Record<string, string | undefined> = {};

/**
 * 이슈 #421 의 재현.
 *
 * staging 에서 CASE 일괄 가채점이 전부 실패했다. ai_events 의 실패 행은
 * feature=bulk_grading_execute, model=gpt-5.6-luna, error_code=unsupported_value 였고,
 * 같은 모델·같은 엔드포인트인 bulk_grading_chat_options 는 7/7 성공했다.
 * 두 호출의 유일한 차이가 temperature 다.
 *
 * 그래서 여기서 고정하는 것은 "기본값이 0이다" 가 아니라
 * "채점 경로의 요청 바디에 temperature 가 실리지 않는다" 다.
 */

/** 프로필이 temperature 를 싣지 않아야 하는 태스크. */
const NO_TEMPERATURE: readonly AiTask[] = [
  "bulk_grading_worker",
  "bulk_grading_score_cluster",
  "auto_grading_question_summary",
];

function bodyFor(task: AiTask, overrides?: Parameters<typeof resolveAiTaskProfile>[0]["overrides"]) {
  const { profile } = resolveAiTaskProfile({ task, overrides, env: CLEAN_ENV });
  return applyProfileToBody(task, profile, {});
}

describe("채점 태스크는 temperature 를 보내지 않는다 (#421)", () => {
  it.each(NO_TEMPERATURE)("%s 의 기본 프로필에 temperature 가 없다", (task) => {
    const { profile } = resolveAiTaskProfile({ task, env: CLEAN_ENV });
    expect(profile).not.toHaveProperty("temperature");
  });

  it.each(NO_TEMPERATURE)("%s 의 요청 바디에 temperature 가 실리지 않는다", (task) => {
    expect(bodyFor(task)).not.toHaveProperty("temperature");
  });

  it.each(NO_TEMPERATURE)("%s 는 관리자 오버라이드로도 temperature 가 되살아나지 않는다", (task) => {
    // DB 설정으로 다시 들어오는 경로까지 막혀야 한다.
    const body = bodyFor(task, { [task]: { temperature: 0 } });
    expect(body).not.toHaveProperty("temperature");
  });

  it.each(NO_TEMPERATURE)("%s 는 레지스트리에서 temperature 를 미지원으로 선언한다", (task) => {
    expect(TASK_REGISTRY[task].supports.temperature).toBe(false);
  });

  it("temperature 를 싣는 태스크가 새로 생기면 알아차린다", () => {
    // 이 목록이 늘어난다는 건 모델이 거부하는 파라미터를 다시 보내기 시작했다는 뜻이다.
    // 의도한 추가라면 해당 모델이 temperature 를 받는지 확인하고 여기에 적는다.
    const carriers = AI_TASKS.filter((task) => {
      const { profile } = resolveAiTaskProfile({ task, env: CLEAN_ENV });
      return profile.temperature !== undefined;
    });
    expect(carriers).toEqual([]);
  });
});
