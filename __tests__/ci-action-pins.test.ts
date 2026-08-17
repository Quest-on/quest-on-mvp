import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * CI 액션은 부동 참조를 쓰지 않는다. (#145)
 *
 * `supabase/setup-cli` 가 `version: latest` 였다. 그러면 액션이 **매 실행마다
 * GitHub API 로 최신 릴리스를 조회**한다. Actions 러너는 공용 IP 풀을 쓰고 이
 * 조회는 인증 없이 나가므로 시간당 60회 IP 공유 한도에 걸린다. PR 여러 개가
 * 동시에 돌면 금방 닿는다.
 *
 * 부수 효과도 있다 — 업스트림이 릴리스하면 우리 CI 가 말없이 따라간다.
 * 어제 통과한 PR 이 오늘 깨지는데 우리 쪽 diff 는 비어 있다.
 */
const workflowFiles = () =>
  execSync("git ls-files .github", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.(yml|yaml)$/.test(f));

describe("CI 액션 버전 핀", () => {
  it("version: latest 를 쓰지 않는다", () => {
    const offenders: string[] = [];
    for (const file of workflowFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*version:\s*latest\s*$/.test(line)) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("액션 참조가 @master / @main 으로 떠 있지 않다", () => {
    // 브랜치 참조는 업스트림 커밋마다 내용이 바뀐다. 태그가 최소 조건이다.
    const offenders: string[] = [];
    for (const file of workflowFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const m = line.match(/uses:\s*(\S+@(?:master|main|latest))/);
          if (m) offenders.push(`${file}:${i + 1} — ${m[1]}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("외부 액션은 모두 버전 참조를 갖는다", () => {
    // `uses: owner/repo` 처럼 참조가 없으면 기본 브랜치를 따라간다.
    const offenders: string[] = [];
    for (const file of workflowFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const m = line.match(/uses:\s*(\S+)/);
          if (!m) return;
          const ref = m[1];
          // 로컬 composite action 은 저장소 안에 있으므로 버전이 필요 없다.
          if (ref.startsWith("./")) return;
          if (!ref.includes("@")) offenders.push(`${file}:${i + 1} — ${ref}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("supabase CLI 가 구체 버전으로 고정돼 있다", () => {
    const setup = readFileSync(".github/actions/test-setup/action.yml", "utf8");
    const idx = setup.indexOf("supabase/setup-cli");
    expect(idx, "setup-cli 사용처를 못 찾았다").toBeGreaterThan(-1);
    // 사용처 바로 뒤 with 블록에 x.y.z 형태가 있어야 한다.
    expect(setup.slice(idx, idx + 200)).toMatch(/version:\s*\d+\.\d+\.\d+/);
  });

  it("로컬 composite action 은 예외로 남는다", () => {
    // 예외를 지우면 `./.github/actions/test-setup` 이 위반으로 잡힌다.
    const all = workflowFiles()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(all).toMatch(/uses:\s*\.\/\.github\/actions\//);
  });
});
