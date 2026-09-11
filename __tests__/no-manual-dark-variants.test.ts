import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * 수동 `dark:` 변형과 하드코딩 흰색을 전 범위에서 막는다. (#249)
 *
 * 의미 토큰은 라이트/다크 값을 이미 갖는다. 그 위에 `dark:bg-gray-900` 같은
 * 변형을 덧붙이면 두 값이 따로 놀고, 한쪽만 고치면 다른 쪽이 어긋난다.
 * `#228`~`#237` 에서 instructor 영역을 옮길 때 `dark:` 가 통째로 사라진 게
 * 그 증거다.
 *
 * 착수 전 실측: `dark:` 133건 / 28파일, `bg-white` 31건.
 */
const MOCK_FILES = [
  // 브라우저 크롬을 그린 일러스트. 가짜 주소창·탭이라 원색이 정당하다.
  "components/landing/HeroSection.tsx",
  "components/landing/DemoExperienceSection.tsx",
  "components/landing/FeatureSection.tsx",
];

const targetFiles = () =>
  execSync("git ls-files components app", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.tsx$/.test(f))
    .filter((f) => !MOCK_FILES.includes(f));

describe("수동 dark: 변형 차단", () => {
  it("실제 UI 에 dark: 색 변형이 없다", () => {
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        const m = line.match(/dark:(bg|text|border|ring|divide)-[a-z]+-\d{2,3}/g);
        if (m) offenders.push(`${file}:${i + 1} — ${m.join(", ")}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("실제 UI 에 하드코딩 흰 배경이 없다", () => {
    // 다크모드에서 그대로 흰색이라 대비가 깨진다. bg-background 를 쓴다.
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        if (/\bbg-white\b/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("목업 파일은 예외로 남긴다", () => {
    // 예외를 지우면 일러스트가 토큰화 대상이 되어 그림이 깨진다.
    const stillRaw = MOCK_FILES.filter((f) => {
      try {
        return /\b(bg|text)-(zinc|gray|blue|green|red)-\d{2,3}\b/.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    });
    expect(stillRaw.length).toBeGreaterThan(0);
  });
});
