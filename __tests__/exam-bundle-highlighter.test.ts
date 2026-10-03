/**
 * 응시 화면 첫 로딩에 코드 하이라이터가 들어가지 않게 막는 소스 검사 (#564 9번)
 *
 * #562 에서 `ExamChatSidebar` 가 `AnalysisTurnBlock` 을 정적으로 불러오고, 그 블록이 react-syntax-highlighter 의 전체
 * Prism(refractor 언어 정의 수백 개)을 정적으로 불러왔다. 그래서 분석 문항이 없는 시험까지 응시 화면 첫 로딩 JS 가
 * 1,913KB 에서 2,584KB 로 늘었다(운영 측정, 늘어난 청크 하나가 brotli 236KB).
 *
 * 지키는 것:
 *   1. 응시 화면 경로(레이아웃, 페이지, loading, error)에서 정적 import 만 따라간 모듈 그래프에 react-syntax-highlighter
 *      와 refractor 가 없다. 동적 `import()` 와 `next/dynamic` 은 따로 받는 청크라 따라가지 않는다.
 *   2. 셀 코드의 문법 강조는 코드 보기를 펼칠 때 동적으로 받는 `AnalysisCodeHighlighter` 에만 있고, 그 모듈은 전체 Prism
 *      대신 PrismLight 에 python 하나만 등록한다(패키지 루트는 전체 Prism 과 highlight.js 를 함께 내보낸다).
 *
 * 정적 그래프는 서버 컴포넌트 모듈까지 넓게 잡는다(브라우저 번들보다 크다). 넓게 잡아도 여기에 하이라이터가 있으면 안 된다.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const EXAM_ROUTE_ENTRIES = [
  "app/layout.tsx",
  "app/(app)/layout.tsx",
  "app/(app)/exam/[code]/page.tsx",
  "app/(app)/exam/[code]/loading.tsx",
  "app/(app)/exam/[code]/error.tsx",
];

/** 하이라이터 패키지. 정적 그래프에 있으면 첫 로딩에 들어간다. */
const HIGHLIGHTER_PACKAGE_RE = /^(?:react-syntax-highlighter|refractor)(?:\/|$)/;

/**
 * 줄 맨 앞에서 시작하는 정적 import 와 re-export 의 모듈 이름. 타입만 가져오는 것(`import type`, `export type`)은
 * 지워지므로 뺀다. 동적 `import("...")` 는 줄 맨 앞이 아니고 `import` 바로 뒤가 괄호라 걸리지 않는다. 주석 속 예시
 * (`// import ...`, ` * import ...`)도 줄 맨 앞이 import 가 아니라 걸리지 않는다.
 */
const STATIC_IMPORT_RE = /^[ \t]*(?:import|export)\s+(?!type\s)(?:[\w*${}\s,]+?\s+from\s+)?["']([^"']+)["']/gm;

function staticSpecifiers(source: string): string[] {
  return [...source.matchAll(STATIC_IMPORT_RE)].map((m) => m[1]);
}

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** 진입 파일들에서 정적 import 만 따라간 로컬 모듈과, 그 모듈들이 불러온 패키지(불러온 파일 포함). */
function staticGraph(entries: string[]) {
  const visited = new Set<string>();
  const packages: Array<{ specifier: string; from: string }> = [];
  const queue = entries.map((entry) => join(ROOT, entry));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(file)) continue;
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const local = resolveLocal(specifier, file);
      if (local) queue.push(local);
      else if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
        packages.push({ specifier, from: relative(ROOT, file).replace(/\\/g, "/") });
      }
    }
  }
  return { files: [...visited].map((f) => relative(ROOT, f).replace(/\\/g, "/")), packages };
}

describe("정적 import 추출기", () => {
  it("값 import 와 re-export 는 잡고, 타입 import 와 동적 import 는 잡지 않는다", () => {
    const source = [
      'import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";',
      'import type { SyntaxHighlighterProps } from "react-syntax-highlighter";',
      "import {",
      "  A,",
      "  B,",
      '} from "@/components/x";',
      'export { default as Y } from "./y";',
      'import "./side-effect.css";',
      'const Lazy = dynamic(() => import("@/components/chat/AIMessageRenderer"));',
      'const mod = await import("./lazy");',
      '// import { Prism } from "react-syntax-highlighter/dist/esm/prism";',
    ].join("\n");
    expect(staticSpecifiers(source)).toEqual(["react-syntax-highlighter", "@/components/x", "./y", "./side-effect.css"]);
  });
});

describe("응시 화면 첫 로딩에 코드 하이라이터가 없다 (#564)", () => {
  const graph = staticGraph(EXAM_ROUTE_ENTRIES);

  it("응시 화면의 정적 그래프를 실제로 따라갔다 (채팅 사이드바와 분석 셀 블록 포함)", () => {
    expect(graph.files).toContain("components/exam/ExamChatSidebar.tsx");
    expect(graph.files).toContain("components/chat/AnalysisTurnBlock.tsx");
    expect(graph.files.length).toBeGreaterThan(50);
  });

  it("정적 그래프에 react-syntax-highlighter 와 refractor 가 없다", () => {
    const offenders = graph.packages
      .filter(({ specifier }) => HIGHLIGHTER_PACKAGE_RE.test(specifier))
      .map(({ specifier, from }) => `${from} -> ${specifier}`);
    expect(offenders).toEqual([]);
  });

  it("문법 강조 모듈은 정적 그래프 밖에 있고, 셀 블록이 동적으로만 불러온다", () => {
    expect(graph.files).not.toContain("components/chat/AnalysisCodeHighlighter.tsx");
    const block = readFileSync(join(ROOT, "components/chat/AnalysisTurnBlock.tsx"), "utf8");
    expect(block).toContain('import("@/components/chat/AnalysisCodeHighlighter")');
  });
});

describe("문법 강조 모듈은 PrismLight 에 python 만 등록한다 (#564)", () => {
  it("하이라이터는 패키지 루트나 전체 Prism 이 아니라 prism-light, python, 테마 파일에서만 가져온다", () => {
    const source = readFileSync(join(ROOT, "components/chat/AnalysisCodeHighlighter.tsx"), "utf8");
    const highlighterImports = staticSpecifiers(source).filter((s) => HIGHLIGHTER_PACKAGE_RE.test(s));
    expect(highlighterImports.sort()).toEqual([
      "react-syntax-highlighter/dist/esm/languages/prism/python",
      "react-syntax-highlighter/dist/esm/prism-light",
      "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus",
    ]);
    expect(source).toContain('registerLanguage("python", python)');
  });
});
