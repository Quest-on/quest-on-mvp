import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * instructor 영역의 오류색은 시맨틱 토큰만 쓴다 (#203 T2-b)
 *
 * 저장소 UI/UX 규칙은 색에 의미를 고정한다 — 적=오류. 그런데 raw palette
 * (`text-red-500`, `bg-red-50` …)를 직접 쓰면 다크모드 대비를 각 사용처가
 * 따로 책임져야 하고, 실제로 `dark:` 변형이 붙은 곳과 안 붙은 곳이 섞여 있었다.
 *
 * `destructive` 토큰은 라이트·다크 양쪽에 정의돼 있어 한 번만 쓰면 된다.
 * 연한 배경은 `bg-destructive/10` 처럼 투명도로 톤을 유지한다.
 *
 * 이 파일은 red/rose 원색이 다시 들어오는 것만 막는다. 나머지 색
 * (green/amber/blue …)은 `success`/`warning`/`info` 토큰이 아직 없어서
 * 별도 단계에서 다룬다 — 이슈 #203 의 분할안 참조.
 */

const TARGET_DIRS = ["components/instructor", "app/(app)/instructor"];

/** 원색 오류 클래스. Tailwind 의 red/rose 계열 전부. */
const RAW_ERROR_COLOR =
  /(bg|text|border|ring|from|to|via|divide|outline|shadow)-(red|rose)-(50|[1-9]00|950)/g;

function targetFiles(): string[] {
  const out = execSync(
    `git ls-files ${TARGET_DIRS.map((d) => `"${d}"`).join(" ")}`,
    { encoding: "utf8", cwd: process.cwd() }
  );
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.tsx?$/.test(f));
}

describe("instructor 영역은 오류색에 원색을 쓰지 않는다", () => {
  it("red/rose 원색 클래스가 없다", () => {
    const offenders: string[] = [];

    for (const file of targetFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      source.split("\n").forEach((line, i) => {
        // 파일 타입 아이콘 색은 오류가 아니다 — PDF=빨강, PPT=주황처럼
        // 확장자를 구분하는 관례색이라 destructive 로 바꾸면 의미가 왜곡된다.
        if (/getFileIcon|iconClass/.test(line)) return;
        const found = line.match(RAW_ERROR_COLOR);
        if (found) offenders.push(`${file}:${i + 1} — ${found.join(", ")}`);
      });
    }

    // 실패 시 어디를 고쳐야 하는지 바로 보이도록 목록을 그대로 노출한다.
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("destructive 토큰이 실제로 쓰이고 있다", () => {
    // 위 테스트는 "red 를 안 쓴다"만 보장한다. 오류 표시 자체가 사라져도
    // 통과하므로, 토큰으로 옮겨갔다는 반대편 증거를 함께 둔다.
    const used = targetFiles().some((file) => {
      try {
        return /-destructive(\/\d+)?\b/.test(readFileSync(file, "utf8"));
      } catch {
        return false;
      }
    });

    expect(used).toBe(true);
  });
});

describe("destructive 토큰이 라이트·다크 양쪽에 정의돼 있다", () => {
  it("globals.css 에 두 번 이상 나온다", () => {
    // 한쪽만 있으면 다른 테마에서 대비가 깨진다. 투명도 변형도 이 정의를 따른다.
    const css = readFileSync("app/globals.css", "utf8");
    const defs = css.match(/--destructive:\s*[^;]+;/g) ?? [];

    expect(defs.length).toBeGreaterThanOrEqual(2);
  });
});
