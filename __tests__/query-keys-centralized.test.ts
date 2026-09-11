import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(__dirname, "..");

/**
 * 쿼리 키는 `lib/query-keys.ts` 의 `qk` 에서 가져온다.
 *
 * `AGENTS.md` 의 규칙인데 19곳이 문자열을 직접 들고 있었다. 흩어진 키는
 * invalidate 대상을 놓치기 쉽다 — 한쪽은 `["student-profile", id]` 로 캐시하고
 * 다른 쪽은 `["student-profile"]` 로 무효화하면 화면이 안 바뀐다.
 */
describe("쿼리 키 중앙화", () => {
  it("컴포넌트가 쿼리 키 문자열을 직접 들지 않는다", () => {
    const files = execSync("git ls-files components app hooks", {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => /\.tsx?$/.test(f));

    const offenders: string[] = [];
    for (const f of files) {
      const lines = readFileSync(resolve(root, f), "utf8").split("\n");
      lines.forEach((l, i) => {
        // queryKey: ["..."] 처럼 배열 리터럴을 직접 넘기는 형태만 잡는다.
        if (/queryKey:\s*\[\s*["'`]/.test(l)) {
          offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`);
        }
      });
    }

    expect(
      offenders,
      `쿼리 키를 하드코딩했다. lib/query-keys.ts 의 qk 에 추가하고 거기서 가져와라:\n${offenders.join("\n")}`
    ).toHaveLength(0);
  });

  it("qk 가 실제로 쓰이고 있다", () => {
    // 위 검사는 "아무도 useQuery 를 안 쓰면" 자동 통과한다. 전제를 고정한다.
    const used = execSync('git grep -l "qk\\." -- components app hooks', {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    expect(used.length, "qk 를 쓰는 파일이 없다").toBeGreaterThan(10);
  });
});
