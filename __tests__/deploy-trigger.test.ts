import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

/**
 * 배포 트리거. (#209)
 *
 * `deploy.yml` 의 `workflow_run.branches` 가 `[main]` 뿐이면 **staging 머지가
 * 배포를 걸지 않는다.** 그러면 매번 손으로 `workflow_dispatch` 를 돌려야 하고,
 * 잊으면 머지됐는데 배포가 안 된 상태로 남는다.
 *
 * 실제로 그랬다 — 이 저장소의 최근 배포는 전부 `workflow_dispatch` 다.
 * `main` 의 `deploy.yml` 이 옛 버전(`branches: [main]`)이라 GitHub 이 그걸
 * 기준으로 등록하기 때문이다. GitHub 은 `workflow_run` 을 **기본 브랜치 파일
 * 기준**으로 읽는다.
 *
 * `staging` 쪽은 이미 고쳐져 있다. 이 테스트는 그 상태가 되돌아가지 않게
 * 고정한다 — `main` 에 반영된 뒤에도 계속 유효하다.
 */
const WORKFLOW = yaml.load(
  readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy.yml"), "utf8")
) as {
  on?: {
    workflow_run?: { workflows?: string[]; types?: string[]; branches?: string[] };
    workflow_dispatch?: unknown;
  };
};

describe("배포 트리거", () => {
  it("workflow_run 이 정의돼 있다", () => {
    expect(WORKFLOW.on?.workflow_run).toBeDefined();
  });

  it("staging 머지도 배포를 건다", () => {
    // 이게 빠지면 매번 손으로 돌려야 한다. #209 의 본체다.
    const branches = WORKFLOW.on?.workflow_run?.branches ?? [];
    expect(branches, `branches: ${JSON.stringify(branches)}`).toContain("staging");
  });

  it("main 도 계속 건다", () => {
    // staging 만 남기면 프로덕션 승격 경로가 끊긴다.
    expect(WORKFLOW.on?.workflow_run?.branches ?? []).toContain("main");
  });

  it("CI 완료를 기다린다", () => {
    // 검증 전에 배포하면 깨진 커밋이 나간다.
    expect(WORKFLOW.on?.workflow_run?.workflows ?? []).toContain("CI");
    expect(WORKFLOW.on?.workflow_run?.types ?? []).toContain("completed");
  });

  it("수동 실행 경로도 남아 있다", () => {
    // 자동이 걸려도 재배포·롤백에 필요하다.
    expect(WORKFLOW.on?.workflow_dispatch).toBeDefined();
  });
});

/**
 * CI 가 실패했는데 배포되면 안 된다.
 */
describe("배포 전 검증", () => {
  const RAW = readFileSync(
    path.join(process.cwd(), ".github", "workflows", "deploy.yml"),
    "utf8"
  );

  it("CI conclusion 이 success 일 때만 배포한다", () => {
    expect(RAW).toMatch(/conclusion\s*==\s*'success'|conclusion\s*==\s*"success"/);
  });
});
