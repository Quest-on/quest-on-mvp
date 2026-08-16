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

/**
 * 파일 타입 아이콘 팔레트 파일.
 *
 * 확장자별 관례색(PDF=빨강, PPT=주황, XLS=초록 …)이라 상태색이 아니다.
 * 토큰으로 바꾸면 PDF 가 '오류'로, XLS 가 '성공'으로 읽힌다.
 *
 * 예전에는 줄 단위로 판별했다(변수명 iconClass / case pdf). 팔레트가 이
 * 파일 하나로 모이면서 그 방식이 무의미해졌고, 실제로 CI 에서 걸렸다 —
 * `pdf: { Icon: FileText, className: text-red-500 }` 줄에는 case 문이 없다.
 *
 * 파일 단위로 제외하고, 그 안의 색은 아래 전용 describe 가 따로 지킨다.
 * 즉 이 파일만 원색을 쓸 수 있고, 그 값이 맞는지는 별도로 검증된다.
 */
const FILE_TYPE_ICON_MODULE = "components/instructor/FileTypeIcon.tsx";

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
      // 파일 타입 아이콘 팔레트만 예외다. 그 안의 색은 아래 전용 describe 가
      // 따로 지키므로 여기서 빠져도 무방비가 되지 않는다.
      if (file === FILE_TYPE_ICON_MODULE) continue;

      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      source.split("\n").forEach((line, i) => {
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

/**
 * 중립색도 토큰만 쓴다 (#203 T2-d 일부)
 *
 * gray/slate 계열은 success/warning/info 와 달리 **토큰이 이미 있다** —
 * muted, muted-foreground, border, secondary, secondary-foreground.
 * 그래서 색값 결정 없이 바로 옮길 수 있었다.
 *
 * 매핑 규칙:
 *   bg-gray-50        -> bg-muted            (면 배경)
 *   bg-gray-100/200   -> bg-secondary        (중립 배지)
 *   border-gray-*     -> border-border
 *   text-gray-400~600 -> text-muted-foreground
 *   text-gray-700~900 -> text-foreground
 */
describe("instructor 영역은 중립색에 원색을 쓰지 않는다", () => {
  it("gray/slate/zinc/neutral/stone 원색 클래스가 없다", () => {
    const NEUTRAL =
      /(bg|text|border|ring|divide|from|to|via|outline)-(gray|slate|zinc|neutral|stone)-(50|[1-9]00|950)/g;
    const offenders: string[] = [];

    for (const file of targetFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        const found = line.match(NEUTRAL);
        if (found) offenders.push(`${file}:${i + 1} — ${found.join(", ")}`);
      });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("중립 토큰이 실제로 쓰이고 있다", () => {
    const used = targetFiles().some((file) => {
      try {
        return /-(muted|secondary|border)(-foreground)?\b/.test(readFileSync(file, "utf8"));
      } catch {
        return false;
      }
    });
    expect(used).toBe(true);
  });
});

/**
 * 파일 타입 아이콘 팔레트 (#203 후속)
 *
 * 확장자별 관례색이라 상태색 토큰으로 바꾸면 안 된다. PDF 를 destructive 로
 * 바꾸면 '오류' 로 읽히고, 두 화면이 갈리면 같은 파일이 화면마다 다른 색이 된다.
 *
 * 실제로 #228 이 edit 화면만 잘못 바꿔 new/edit 의 PDF 색이 갈렸었다. 그때
 * 가드가 변수명(iconClass)에만 의존해서 cls 를 쓰는 쪽을 놓쳤다.
 */
describe("파일 타입 아이콘은 관례색을 유지한다", () => {
  // 팔레트가 components/instructor/FileTypeIcon.tsx 한 곳으로 모였다.
  // 예전에는 new/edit 두 화면이 각자 구현을 들고 있어서, #228 이 한쪽만
  // 잘못 바꿔 같은 PDF 가 화면마다 다른 색이 됐다. 이제 구조적으로 갈릴 수 없다.
  const SOURCE_PATH = "components/instructor/FileTypeIcon.tsx";

  it("팔레트가 한 곳에만 정의된다", () => {
    // 페이지가 자기 팔레트를 되살리면 다시 갈린다.
    for (const page of [
      "app/(app)/instructor/new/page.tsx",
      "app/(app)/instructor/[examId]/edit/page.tsx",
    ]) {
      const src = readFileSync(page, "utf8");
      expect(src, `${page} 가 자체 팔레트를 갖고 있다`).not.toMatch(
        /case "(pdf|ppt|xls|hwp)"/
      );
      expect(src).toMatch(/FileTypeIcon/);
    }
  });

  it("파일 종류 색이 상태색 토큰으로 바뀌지 않았다", () => {
    // PDF 를 destructive 로 바꾸면 '오류', XLS 를 success 로 바꾸면 '성공'으로
    // 읽힌다. 확장자를 구분하는 관례색이지 상태가 아니다.
    const src = readFileSync(SOURCE_PATH, "utf8");

    for (const [ext, expected] of [
      ["pdf", "text-red-500"],
      ["ppt", "text-orange-500"],
      ["doc", "text-blue-500"],
      ["xls", "text-green-500"],
      ["hwp", "text-sky-500"],
      ["jpg", "text-purple-500"],
    ] as const) {
      const m = src.match(new RegExp(`\\b${ext}: \\{[^}]*className: "([^"]+)"`));
      expect(m, `${ext} 항목을 못 찾았다`).toBeTruthy();
      expect(m![1], `${ext} 아이콘 색`).toBe(expected);
    }
  });

  it("알 수 없는 확장자만 시맨틱 토큰을 쓴다", () => {
    // '종류 없음'은 중립 상태라 muted 가 맞다.
    const src = readFileSync(SOURCE_PATH, "utf8");
    expect(src).toMatch(/UNKNOWN[\s\S]{0,120}text-muted-foreground/);
  });
});
