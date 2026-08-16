import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

/**
 * CI 중복 실행 방지 (이슈 #205)
 *
 * staging 에 푸시하면 두 이벤트가 각각 CI 를 띄웠다:
 *   1. push: branches [main, staging]
 *   2. 상시 열려 있는 staging -> main PR 의 pull_request: synchronize
 *
 * 같은 커밋을 두 벌이 동시에 검증하면서 Supabase 컨테이너·Next 서버·목 서버·포트를
 * 두고 경쟁했고, Browser E2E 가 page.waitForLoadState 타임아웃으로 죽었다.
 * 재현율 2/2 로 매번 push 런만 죽었다(pull_request 런은 통과).
 *
 * 워크플로 파일은 유닛 테스트로 실행할 수 없으므로 **구조로** 강제한다.
 * 이 저장소에는 설정 파일을 파싱해 검증하는 선례가 있다(next-config-csp 등).
 */

const WORKFLOW_PATH = path.join(process.cwd(), ".github", "workflows", "ci.yml");

type Workflow = {
  on?: Record<string, unknown>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs?: Record<string, { if?: string; name?: string }>;
};

function loadWorkflow(): Workflow {
  return yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
}

describe("ci.yml — 같은 커밋을 두 벌 동시에 돌리지 않는다", () => {
  it("동시 실행을 커밋 SHA 로 묶는다", () => {
    const { concurrency } = loadWorkflow();

    expect(concurrency).toBeDefined();
    // ref 로 묶으면 push 와 pull_request 의 ref 가 달라 두 런이 안 합쳐진다.
    // 반드시 SHA 여야 한다.
    expect(concurrency?.group).toMatch(/github\.sha|pull_request\.head\.sha/);
    expect(concurrency?.group).not.toMatch(/github\.ref(_name)?\s*}}/);
  });

  it("진행 중인 런을 취소하지 않는다", () => {
    const { concurrency } = loadWorkflow();

    // deploy.yml 은 CI 런의 conclusion 이 success 일 때만 배포한다.
    // 먼저 시작한 런을 취소하면 결론이 cancelled 이 되어 배포가 건너뛰어진다.
    expect(concurrency?.["cancel-in-progress"]).toBe(false);
  });
});

describe("ci.yml — 중복 트리거를 건너뛴다", () => {
  const GUARDED_JOBS = [
    "quality",
    "build",
    "unit-test",
    "api-integration-test",
    "browser-e2e-test",
    "consent-flow-test",
  ];

  it("모든 잡이 main/staging head PR 을 건너뛴다", () => {
    const { jobs } = loadWorkflow();
    expect(jobs).toBeDefined();

    for (const job of GUARDED_JOBS) {
      const condition = jobs?.[job]?.if;
      expect(condition, `${job} 에 중복 실행 가드가 없다`).toBeTruthy();
      // push 이벤트는 항상 통과해야 한다 — 배포가 그 런의 결론을 본다.
      expect(condition).toMatch(/github\.event_name\s*!=\s*'pull_request'/);
      // main/staging 이 head 인 PR 만 건너뛴다.
      expect(condition).toMatch(/pull_request\.head\.ref/);
      expect(condition).toMatch(/main/);
      expect(condition).toMatch(/staging/);
    }
  });

  it("가드 대상 잡 목록이 실제 잡 목록과 일치한다", () => {
    const { jobs } = loadWorkflow();
    // 잡이 새로 생기면 가드도 같이 달아야 한다. 빠뜨리면 그 잡만 두 벌 돈다.
    expect(Object.keys(jobs ?? {}).sort()).toEqual([...GUARDED_JOBS].sort());
  });
});

describe("ci.yml — 트리거 계약은 유지한다", () => {
  it("push 는 main/staging 을 계속 검증한다", () => {
    const on = loadWorkflow().on as { push?: { branches?: string[] } };
    expect(on.push?.branches).toEqual(expect.arrayContaining(["main", "staging"]));
  });

  it("pull_request 에 base 제한을 걸지 않는다", () => {
    const on = loadWorkflow().on as Record<string, unknown>;
    // 스택 PR(작업 브랜치 위에 쌓은 PR)의 base 는 staging 도 main 도 아니다.
    // 목록으로 제한하면 그 PR 들만 CI 없이 머지되는 구멍이 생긴다.
    expect("pull_request" in on).toBe(true);
    const pr = on.pull_request as { branches?: string[] } | null;
    expect(pr?.branches).toBeUndefined();
  });
});

describe("ci.yml — 한 잡이 서버를 두 번 띄우지 않는다 (#219)", () => {
  it("각 E2E 잡은 playwright 를 한 번만 실행한다", () => {
    // 한 잡에서 두 번 돌리면 2차가 CONSENT_GATE_MODE=prompt 로 서버를 새로
    // 띄워야 하는데(값이 부팅 시점에 읽힌다), CI 는 reuseExistingServer=false 라
    // 1차 서버가 포트를 놓을 때까지 기다리다 60초 타임아웃이 났다.
    const { jobs } = loadWorkflow();
    for (const name of ["browser-e2e-test", "consent-flow-test"]) {
      const job = jobs?.[name] as { steps?: Array<{ run?: string }> } | undefined;
      const run = (job?.steps ?? []).map((s) => s.run ?? "").join("\n");
      const count = (run.match(/npx playwright test/g) ?? []).length;
      expect(count, `${name} 의 playwright 실행 횟수`).toBe(1);
    }
  });

  it("동의 플로우는 별도 잡에서 돈다", () => {
    const { jobs } = loadWorkflow();
    const consent = jobs?.["consent-flow-test"] as { steps?: Array<{ run?: string }> };
    const run = (consent?.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(run).toMatch(/CONSENT_GATE_MODE=prompt/);
    expect(run).toMatch(/consent-onboarding-flow\.spec\.ts/);

    // 1차 잡에는 남아 있으면 안 된다.
    const browser = jobs?.["browser-e2e-test"] as { steps?: Array<{ run?: string }> };
    const browserRun = (browser?.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(browserRun).not.toMatch(/CONSENT_GATE_MODE=prompt/);
  });
});
