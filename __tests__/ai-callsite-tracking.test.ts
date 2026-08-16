import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TASKS, TASK_REGISTRY } from "@/lib/ai-task-profile";

/**
 * 호출부 인벤토리 (이슈 #118, AC-6)
 *
 * 해석 계층을 만들어 두고 제품 코드가 쓰지 않으면 아무 의미가 없다.
 * 실제로 터미널 크리틱이 이 상태를 잡아냈다: 리졸버는 있는데 6개 채점 호출부가
 * 여전히 모델을 하드코딩하고 있었다.
 *
 * 이 테스트는 승인된 seam 을 우회하는 호출이 다시 생기는 것을 막는다.
 */

const REPO = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** 프로필이 통제해야 하는 호출부와, 그 호출이 쓰는 태스크. */
const PROFILE_CONTROLLED_CALLSITES: ReadonlyArray<{ file: string; tasks: string[] }> = [
  {
    file: "lib/grading.ts",
    tasks: ["auto_grading_question", "auto_grading_question_summary", "auto_grading_summary"],
  },
  { file: "lib/bulk-grading-criteria.ts", tasks: ["bulk_grading_criteria_extract"] },
  { file: "lib/bulk-grade-score-cluster.ts", tasks: ["bulk_grading_score_cluster"] },
  { file: "app/api/internal/bulk-grade-worker/route.ts", tasks: ["bulk_grading_worker"] },
  { file: "app/api/assignment-chat/route.ts", tasks: ["assignment_chat_stream"] },
];

describe("every profile-controlled callsite actually uses the profile layer", () => {
  it("covers all seven declared tasks exactly once", () => {
    const covered = PROFILE_CONTROLLED_CALLSITES.flatMap((entry) => entry.tasks);
    expect(covered.sort()).toEqual([...AI_TASKS].sort());
  });

  it.each(PROFILE_CONTROLLED_CALLSITES)(
    "$file resolves its model from a profile instead of a constant",
    ({ file }) => {
      const code = stripComments(read(file));

      // 하드코딩된 모델 상수가 남아 있으면 관리자 설정이 그 경로만 비켜 간다.
      expect(code).not.toMatch(/AI_MODEL_HEAVY/);
      expect(code).not.toMatch(/AI_MODEL_BULK_GRADING_WORKER/);
      expect(code).not.toMatch(/model:\s*AI_MODEL\b/);

      // 바디는 반드시 변환기를 거친다.
      expect(code).toMatch(/applyProfileTo(Chat|Responses)Body\(/);
    }
  );

  it.each(PROFILE_CONTROLLED_CALLSITES)(
    "$file passes SDK request options rather than relying on client defaults",
    ({ file }) => {
      const code = stripComments(read(file));
      // 클라이언트 기본 maxRetries 가 0 이므로 명시하지 않으면 재시도가 사라진다.
      expect(code).toMatch(/maxRetries:/);
      expect(code).toMatch(/timeout:/);
    }
  );

  it("keeps every task's endpoint consistent with the callsite that uses it", () => {
    for (const { file, tasks } of PROFILE_CONTROLLED_CALLSITES) {
      const code = stripComments(read(file));
      for (const task of tasks) {
        const endpoint = TASK_REGISTRY[task as keyof typeof TASK_REGISTRY].endpoint;
        if (endpoint === "chat.completions") {
          expect(code).toMatch(/applyProfileToChatBody\(/);
        } else {
          expect(code).toMatch(/applyProfileToResponsesBody\(/);
        }
      }
    }
  });
});

describe("run-pinned paths never re-read the live label", () => {
  it("the worker builds its request from the pinned snapshot", () => {
    const code = stripComments(read("app/api/internal/bulk-grade-worker/route.ts"));
    expect(code).toMatch(/createPinnedExecutionContext\(/);
    expect(code).toMatch(/aiContext\.profile/);
    // 핀이 있는데 라벨을 다시 읽으면 런 안에서 설정이 갈린다.
    expect(code).not.toMatch(/loadCurrentVersion\(/);
  });

  it("score-cluster recalibration reuses the run's pinned profile", () => {
    const code = stripComments(read("lib/bulk-grade-score-cluster.ts"));
    expect(code).toMatch(/ai_profile_snapshot/);
    expect(code).toMatch(/validatePinnedProfile\(/);
    expect(code).not.toMatch(/loadCurrentVersion\(/);
  });

  it("bulk start pins the config it resolved, in the same conditional update", () => {
    const code = stripComments(read("app/api/exam/[examId]/bulk-grade/start/route.ts"));
    expect(code).toMatch(/loadCurrentVersion\(/);
    expect(code).toMatch(/buildRunProfileSnapshot\(/);
    expect(code).toMatch(/ai_config_version_id:\s*pinnedVersionId/);
    expect(code).toMatch(/ai_profile_snapshot:\s*pinnedSnapshot/);
    expect(code).toMatch(/pinRequired:\s*true/);
  });
});

describe("streaming path stamps the version it actually used", () => {
  it("assignment-chat passes its context version to the event recorder", () => {
    const code = stripComments(read("app/api/assignment-chat/route.ts"));
    expect(code).toMatch(/createCurrentExecutionContext\(/);
    expect(code).toMatch(/configVersion:\s*aiContext\.configVersionId/);
    expect(code).toMatch(/model:\s*aiContext\.profile\.model/);
  });
});

describe("config version reaches every profile-controlled event (migration 030)", () => {
  const FILES: ReadonlyArray<[string, string]> = [
    ["lib/grading.ts", "configVersion: aiVersion.versionId"],
    ["lib/bulk-grading-criteria.ts", "configVersion: params.configVersionId"],
    ["lib/bulk-grade-score-cluster.ts", "configVersion:"],
    ["app/api/internal/bulk-grade-worker/route.ts", "configVersion: aiContext.configVersionId"],
    ["app/api/assignment-chat/route.ts", "configVersion: aiContext.configVersionId"],
  ];

  it.each(FILES)("%s stamps the version it actually used", (file, marker) => {
    // 안 찍으면 마이그레이션 030 의 컬럼이 빈 채로 남고, 어떤 설정이 이 결과를
    // 만들었는지 성적 이의제기 때 되짚을 수 없다.
    expect(stripComments(read(file))).toContain(marker);
  });

  it("the tracker persists config_version on both success and failure", () => {
    const code = stripComments(read("lib/ai-tracking.ts"));
    const stamps = code.match(/config_version:/g) ?? [];
    // 스트림 기록기 1 + 성공 1 + 실패 1.
    expect(stamps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("admin overrides reach the ordinary grading tasks", () => {
  it("grading resolves against the loaded version, not bare code defaults", () => {
    const code = stripComments(read("lib/grading.ts"));
    // overrides 를 넘기지 않으면 관리자 설정이 이 경로만 통째로 비켜 간다.
    expect(code).toMatch(/loadCurrentVersion()/);
    const resolves = code.match(/resolveAiTaskProfile\(\{[\s\S]{0,160}?\}\)/g) ?? [];
    expect(resolves.length).toBe(3);
    for (const call of resolves) {
      expect(call).toMatch(/overrides:\s*aiVersion\.overrides/);
    }
  });
});

describe("inline dev dispatch takes the same code path as the queue", () => {
  it("sends the cutover sentinel and the pinned version", () => {
    const code = stripComments(read("app/api/exam/[examId]/bulk-grade/start/route.ts"));
    // 빠뜨리면 워커가 레거시 분기로 떨어져 개발 환경만 핀 없이 돈다.
    const sentinels = code.match(/pinRequired:\s*true/g) ?? [];
    expect(sentinels.length).toBe(2);
    expect(code).toMatch(/runBulkGradeInline\([\s\S]{0,200}?pinnedVersionId/);
  });
});
