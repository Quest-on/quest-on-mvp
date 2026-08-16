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
 * 파일 타입 아이콘 줄.
 *
 * 확장자별 관례색(PDF=빨강, PPT=주황, XLS=초록 …)이라 상태색이 아니다.
 * 토큰으로 바꾸면 PDF 가 오류와 같은 색이 된다.
 *
 * 변수명(iconClass / cls)으로 판별하면 한쪽을 놓친다 — 실제로 #228 이
 * edit 화면만 잘못 바꿔 두 화면의 PDF 색이 갈렸다. 확장자 case 로 판별한다.
 */
const FILE_TYPE_ICON_LINE =
  /case "(pdf|ppt|pptx|doc|docx|xls|xlsx|csv|hwp|hwpx|jpg|jpeg|png|gif|webp)"|getFileIcon|iconClass/;

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
        if (FILE_TYPE_ICON_LINE.test(line)) return;
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
  const ICON_FILES = [
    "app/(app)/instructor/new/page.tsx",
    "app/(app)/instructor/[examId]/edit/page.tsx",
  ];

  it("두 화면이 같은 확장자에 같은 색을 쓴다", () => {
    const palettes = ICON_FILES.map((file) => {
      const src = readFileSync(file, "utf8");
      const start = src.indexOf("getFileIcon");
      expect(start, `${file} 에 getFileIcon 이 없다`).toBeGreaterThan(-1);
      const block = src.slice(start, start + 1400);

      const map: Record<string, string> = {};
      for (const m of block.matchAll(
        /case "(pdf|ppt|doc|xls|hwp|jpg)[a-z]*"[\s\S]{0,220}?text-([a-z]+)-\d00/g
      )) {
        map[m[1]] ??= m[2];
      }
      return map;
    });

    // 같은 확장자는 두 화면에서 같은 색이어야 한다.
    for (const ext of Object.keys(palettes[0])) {
      if (!(ext in palettes[1])) continue;
      expect(palettes[1][ext], `${ext} 색이 두 화면에서 다르다`).toBe(palettes[0][ext]);
    }
  });

  it("PDF 아이콘이 상태색 토큰으로 바뀌지 않았다", () => {
    // destructive 로 바꾸면 파일 종류가 아니라 오류로 읽힌다.
    for (const file of ICON_FILES) {
      const src = readFileSync(file, "utf8");
      const start = src.indexOf("getFileIcon");
      const block = src.slice(start, start + 1400);
      const pdf = block.match(/case "pdf"[\s\S]{0,220}?(text-[a-z-]+(?:-\d00)?)/);

      expect(pdf, `${file} 에서 pdf case 를 못 찾았다`).toBeTruthy();
      expect(pdf![1], `${file} 의 PDF 아이콘`).not.toMatch(
        /destructive|primary|muted|secondary/
      );
    }
  });
});
