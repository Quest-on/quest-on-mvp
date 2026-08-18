import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * 전역 하드코딩 색 재발 방지. (#204 T3)
 *
 * `#228`~`#237` 이 instructor 를, `#251`~`#255` 가 exam·auth·landing·ui 의
 * `dark:` 와 `bg-white` 를 닫았다. 그런데 **raw palette 자체는 아직 남아 있다.**
 *
 * 한 번에 다 치환하면 47개 파일을 건드려 리뷰가 불가능하다. 그래서 지금
 * 수치를 **상한으로 고정**한다 — 줄이는 건 자유고, 늘리는 건 실패한다.
 * 새 하드코딩 색이 들어오면 CI 가 막는다.
 *
 * 상한을 내리는 것도 이 파일 한 줄 수정이다. 치환 PR 이 그 줄을 같이 낮춘다.
 */
const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone";
const RAW_RE = new RegExp(`\\b(bg|text|border|ring|divide|from|via|to)-(${PALETTE})-\\d{2,3}\\b`, "g");

/**
 * 브라우저 크롬을 그린 일러스트. 가짜 주소창·탭을 축소해 그린 것이라
 * 토큰으로 바꾸면 그림이 깨진다.
 */
const MOCK_FILES = [
  "components/landing/HeroSection.tsx",
  "components/landing/DemoExperienceSection.tsx",
  "components/landing/FeatureSection.tsx",
];

/**
 * 파일 타입 아이콘의 관례색. PDF=빨강, XLS=초록처럼 널리 통용되는 매핑이라
 * 상태 토큰으로 바꾸면 PDF 가 "오류" 로 읽힌다.
 */
const CONVENTION_FILES = ["components/instructor/FileTypeIcon.tsx"];

const targetFiles = () =>
  execSync("git ls-files components app", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.tsx$/.test(f))
    .filter((f) => !MOCK_FILES.includes(f));

function countRaw(files: string[]): { total: number; byFile: Array<[string, number]> } {
  const byFile: Array<[string, number]> = [];
  let total = 0;
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const n = (source.match(RAW_RE) ?? []).length;
    if (n) byFile.push([file, n]);
    total += n;
  }
  return { total, byFile };
}

/**
 * 현재 실측치. 이 숫자를 **올리는 변경은 거부된다.**
 * 치환 작업이 진행되면 이 값을 함께 낮춘다.
 */
const RAW_CEILING = 80;

describe("전역 하드코딩 색 상한", () => {
  it(`raw palette 사용이 ${RAW_CEILING}건을 넘지 않는다`, () => {
    const { total, byFile } = countRaw(targetFiles());
    const top = byFile
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([f, n]) => `${n.toString().padStart(4)}  ${f}`)
      .join("\n");
    expect(total, `상한 ${RAW_CEILING} 초과. 상위 파일:\n${top}`).toBeLessThanOrEqual(RAW_CEILING);
  });

  it("하드코딩 흰 배경이 없다", () => {
    // 다크모드에서 그대로 흰색이라 대비가 깨진다. #255 에서 0 으로 만들었다.
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\bbg-white\b/.test(line)) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("의미 토큰이 널리 쓰이고 있다", () => {
    // 상한만 있으면 색을 통째로 지워도 통과한다. 반대편 증거를 둔다.
    const used = targetFiles().filter((f) => {
      try {
        return /-(destructive|success|warning|info|muted|primary|accent|border|foreground|background)\b/.test(
          readFileSync(f, "utf8")
        );
      } catch {
        return false;
      }
    });
    expect(used.length).toBeGreaterThan(60);
  });

  it("예외 목록이 실제로 필요한 상태로 남아 있다", () => {
    // 예외를 지우면 목업·관례색 파일이 위반으로 잡힌다. 그걸 막으려고
    // 예외 자체를 없애는 걸 방지한다.
    for (const file of [...MOCK_FILES, ...CONVENTION_FILES]) {
      const n = (readFileSync(file, "utf8").match(RAW_RE) ?? []).length;
      expect(n, `${file} 에 raw palette 가 없다 — 예외가 불필요해졌으면 목록에서 지운다`).toBeGreaterThan(0);
    }
  });
});

/**
 * 양쪽 값이 같은 isDark 삼항은 남기지 않는다.
 *
 * 토큰으로 옮기다 보면 
 * 같은 잔재가 생긴다. 토큰이 이미 두 모드를 갖는데 런타임에 고르는 척만 하는
 * 코드다. 읽는 사람은 두 값이 다른 줄 알고 한쪽만 고치게 된다.
 */
describe("무의미한 테마 분기", () => {
  it("양쪽이 같은 isDark 삼항이 없다", () => {
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        const m = line.match(/isDark \? "([^"]*)" : "([^"]*)"/);
        if (m && m[1] === m[2]) offenders.push(file + ":" + (i + 1) + " — " + m[1]);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
