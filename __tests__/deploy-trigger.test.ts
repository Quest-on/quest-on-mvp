import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

/**
 * 배포 트리거. (#209)
 *
 * ## 이 테스트가 한 번 틀렸다
 *
 * 예전 버전은 `deploy.yml` 의 `workflow_run.branches` 에 `staging` 이 있는지만
 * 봤다. 그건 내내 초록이었는데 **자동 배포는 한 번도 걸린 적이 없었다.**
 * 배포 12건이 전부 손으로 돌린 `workflow_dispatch` 였다.
 *
 * `workflow_run` 트리거는 **기본 브랜치(main)의 워크플로 파일 기준**으로
 * 등록된다. 현재 브랜치 파일이 아니다. staging 쪽을 아무리 고쳐도 main 이
 * `branches: [main]` 이면 등록되지 않는다. main 은 staging 보다 379 커밋
 * 뒤처져 있었다.
 *
 * 즉 이 파일만 읽고 판정하는 것 자체가 틀린 접근이었다. 초록인 테스트가
 * 아무것도 지켜주지 않았다.
 *
 * ## 지금 계약
 *
 * - **staging**: `ci.yml` 이 모든 검사를 통과한 뒤 `deploy.yml` 을
 *   `workflow_call` 로 직접 부른다. `push` 와 `workflow_call` 은 그 브랜치의
 *   파일을 쓰므로 main 에 의존하지 않는다.
 * - **main**: 기존 `workflow_run` 경로를 그대로 둔다. 프로덕션 배포 동작을
 *   바꾸지 않는다.
 *
 * "CI 가 초록일 때만 배포한다" 는 원칙은 staging 쪽에서 `needs:` 로 더 강하게
 * 지켜진다 — conclusion 을 나중에 읽는 게 아니라 순서 자체가 강제된다.
 */

const WORKFLOWS = path.join(process.cwd(), ".github", "workflows");
const readWorkflow = (name: string) =>
  readFileSync(path.join(WORKFLOWS, name), "utf8");

type DeployWorkflow = {
  on?: {
    workflow_run?: { workflows?: string[]; types?: string[]; branches?: string[] };
    workflow_call?: { inputs?: Record<string, unknown> };
    workflow_dispatch?: unknown;
  };
  jobs?: Record<string, { if?: string; env?: Record<string, string> }>;
};

type CiWorkflow = {
  jobs?: Record<
    string,
    { uses?: string; needs?: string[]; if?: string; with?: Record<string, unknown> }
  >;
};

const DEPLOY_RAW = readWorkflow("deploy.yml");
const DEPLOY = yaml.load(DEPLOY_RAW) as DeployWorkflow;
const CI = yaml.load(readWorkflow("ci.yml")) as CiWorkflow;

describe("staging 자동 배포는 main 에 의존하지 않는다", () => {
  it("ci.yml 이 deploy.yml 을 직접 부른다", () => {
    // workflow_run 은 기본 브랜치 파일 기준이라 staging 에서 쓸 수 없다.
    const job = CI.jobs?.["deploy-staging"];
    expect(job, "ci.yml 에 deploy-staging 잡이 없다").toBeDefined();
    expect(job?.uses).toBe("./.github/workflows/deploy.yml");
  });

  it("모든 검사를 통과한 뒤에만 배포한다", () => {
    const needs = CI.jobs?.["deploy-staging"]?.needs ?? [];
    const testJobs = Object.entries(CI.jobs ?? {})
      .filter(([name, job]) => name !== "deploy-staging" && !job.uses)
      .map(([name]) => name);

    // 검사 잡이 새로 생기면 배포 앞에도 세워야 한다. 빠뜨리면 그 검사가
    // 실패해도 배포가 나간다.
    for (const job of testJobs) {
      expect(needs, `deploy-staging 이 ${job} 을 기다리지 않는다`).toContain(job);
    }
  });

  it("push 로 staging 에 들어왔을 때만 배포한다", () => {
    const condition = CI.jobs?.["deploy-staging"]?.if ?? "";
    // PR 에서 돌면 머지되지도 않은 코드가 스테이징에 나간다.
    expect(condition).toMatch(/github\.event_name\s*==\s*'push'/);
    expect(condition).toMatch(/refs\/heads\/staging/);
  });

  it("스테이징 프로젝트의 프로덕션 타깃으로 보낸다", () => {
    // preview 로 두면 Vercel Cron 이 돌지 않아 채점 스위퍼를 검증할 수 없다.
    expect(CI.jobs?.["deploy-staging"]?.with).toEqual({
      environment: "staging",
      target: "production",
    });
  });

  it("deploy.yml 이 workflow_call 을 받는다", () => {
    const inputs = DEPLOY.on?.workflow_call?.inputs ?? {};
    expect(Object.keys(inputs).sort()).toEqual(["environment", "target"]);
  });
});

describe("프로덕션 배포 경로는 그대로다", () => {
  it("main 은 계속 workflow_run 으로 배포한다", () => {
    expect(DEPLOY.on?.workflow_run?.branches ?? []).toContain("main");
  });

  it("CI 완료를 기다린다", () => {
    expect(DEPLOY.on?.workflow_run?.workflows ?? []).toContain("CI");
    expect(DEPLOY.on?.workflow_run?.types ?? []).toContain("completed");
  });

  it("CI conclusion 이 success 일 때만 배포한다", () => {
    expect(DEPLOY_RAW).toMatch(
      /conclusion\s*==\s*'success'|conclusion\s*==\s*"success"/
    );
  });

  it("수동 실행 경로도 남아 있다", () => {
    // 자동이 걸려도 재배포·롤백에 필요하다.
    expect(DEPLOY.on?.workflow_dispatch).toBeDefined();
  });
});

describe("호출 경로 판별", () => {
  it("event_name 이 아니라 inputs 로 가른다", () => {
    // 재사용 워크플로 안에서 github 컨텍스트는 호출자의 것이다.
    // workflow_call 로 불려도 event_name 은 push 라서 그걸로 가를 수 없다.
    const condition = DEPLOY.jobs?.deploy?.if ?? "";
    expect(condition).toMatch(/inputs\.environment/);
    expect(condition).not.toMatch(/event_name\s*==\s*'workflow_call'/);
  });

  it("CI 가 검증한 커밋을 배포한다", () => {
    // 브랜치명으로 체크아웃하면 CI 가 도는 동안 들어온 다음 커밋이 나간다.
    expect(DEPLOY_RAW).toMatch(/ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\|\|\s*github\.sha\s*\}\}/);
  });
});
