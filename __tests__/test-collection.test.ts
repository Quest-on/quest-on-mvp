import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const tracked = () =>
  execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

/**
 * 안 도는 테스트는 없는 것보다 나쁘다.
 *
 * `vitest.config.ts` 의 `include` 는 `__tests__/**\/*.test.ts` 다. `.test.tsx`
 * 로 쓰면 파일이 존재하고 커밋도 되는데 **한 번도 실행되지 않는다.** 실제로
 * 이 세션에서 `.test.tsx` 를 만들었다가 "No test files found" 를 보고 알았다.
 *
 * 그때는 바로 알아챘지만, 기존 파일 틈에 섞이면 아무도 모른다.
 */
describe("테스트 수집", () => {
  it("어느 러너에도 안 걸리는 테스트 파일이 없다", () => {
    const all = tracked();
    const testish = all.filter((f) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f));
    const vitest = all.filter((f) => /^__tests__\/.*\.test\.ts$/.test(f));
    const playwright = testish.filter((f) => f.startsWith("e2e/"));

    const orphan = testish.filter(
      (f) => !vitest.includes(f) && !playwright.includes(f)
    );

    expect(
      orphan,
      `어느 러너도 실행하지 않는 테스트 파일:\n${orphan.join("\n")}\n\n` +
        `__tests__/ 아래는 .test.ts 여야 vitest 가 잡는다. 브라우저가 필요하면 e2e/ 로 옮겨라.`
    ).toHaveLength(0);
  });

  it("수집 전제가 살아 있다", () => {
    // 위 검사는 테스트 파일이 하나도 없으면 자동 통과한다.
    const all = tracked();
    const vitest = all.filter((f) => /^__tests__\/.*\.test\.ts$/.test(f));
    expect(vitest.length, "vitest 대상 파일이 없다").toBeGreaterThan(100);
  });

  it("include 패턴이 바뀌면 이 가드도 같이 봐야 한다", () => {
    // 설정이 바뀌었는데 위 판정 기준이 그대로면 오판한다.
    const cfg = readFileSync(resolve(root, "vitest.config.ts"), "utf8");
    expect(cfg, "include 패턴이 바뀌었다").toMatch(
      /include:\s*\["__tests__\/\*\*\/\*\.test\.ts"\]/
    );
  });
});
