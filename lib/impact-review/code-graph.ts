import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * 경량 코드 그래프 (codegraph).
 * import 관계로 역방향 의존 그래프를 만들어 변경 파일의 *전이* importer(blast radius)를 구한다.
 * diff만 보지 않고, 변경이 실제로 번지는 파일들을 결정적으로 계산해 리뷰 에이전트에 seed로 준다.
 *
 * - 벡터 RAG 대신 AST/import 기반(2026 합의: 코드엔 결정적 그래프가 멀티홉 정확).
 * - 순수 코어(buildImportGraph/transitiveImporters)는 파일맵 주입으로 단위테스트한다.
 */

const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_EXTS = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

export interface ImportGraph {
  /** importedPath -> 그 파일을 import 하는 파일들의 집합 (역방향 엣지). */
  importers: Map<string, Set<string>>;
  files: Set<string>;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

export function extractImportSpecifiers(content: string): string[] {
  const out: string[] = [];
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(content))) {
    const spec = m[1] || m[2] || m[3];
    if (spec) out.push(spec);
  }
  return out;
}

/** import 지정자를 레포 내 실제 파일 경로로 해석. 외부 패키지는 null. */
export function resolveImport(
  spec: string,
  fromFile: string,
  fileSet: Set<string>,
  aliasPrefix = "@/"
): string | null {
  let base: string | null = null;
  if (spec.startsWith(aliasPrefix)) {
    base = spec.slice(aliasPrefix.length); // "@/lib/x" -> "lib/x"
  } else if (spec.startsWith(".")) {
    base = joinPath(dirname(fromFile), spec);
  } else {
    return null; // 외부 패키지
  }
  for (const ext of RESOLVE_EXTS) {
    const cand = base + ext;
    if (fileSet.has(cand)) return cand;
  }
  for (const idx of INDEX_EXTS) {
    const cand = base + idx;
    if (fileSet.has(cand)) return cand;
  }
  return null;
}

export function buildImportGraph(
  paths: string[],
  readFile: (p: string) => string,
  aliasPrefix = "@/"
): ImportGraph {
  const fileSet = new Set(paths.filter((p) => SRC_RE.test(p)));
  const importers = new Map<string, Set<string>>();
  for (const file of fileSet) {
    let content: string;
    try {
      content = readFile(file);
    } catch {
      continue;
    }
    for (const spec of extractImportSpecifiers(content)) {
      const target = resolveImport(spec, file, fileSet, aliasPrefix);
      if (!target || target === file) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(file);
    }
  }
  return { importers, files: fileSet };
}

export interface BlastNode {
  path: string;
  hops: number;
}

/** 변경 파일들의 전이 importer (BFS, maxHops/maxNodes 제한). */
export function transitiveImporters(
  changedPaths: string[],
  graph: ImportGraph,
  opts: { maxHops?: number; maxNodes?: number } = {}
): BlastNode[] {
  const maxHops = opts.maxHops ?? 2;
  const maxNodes = opts.maxNodes ?? 40;
  const seen = new Set(changedPaths);
  const out: BlastNode[] = [];
  let frontier = changedPaths.filter((p) => SRC_RE.test(p));

  for (let hop = 1; hop <= maxHops && out.length < maxNodes; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const callers = graph.importers.get(node);
      if (!callers) continue;
      for (const caller of callers) {
        if (seen.has(caller)) continue;
        seen.add(caller);
        out.push({ path: caller, hops: hop });
        next.push(caller);
        if (out.length >= maxNodes) break;
      }
      if (out.length >= maxNodes) break;
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return out;
}

// ─── CI 어댑터 (git working tree에서 그래프 구축) ────────────────────────────

export function buildRepoGraph(): ImportGraph {
  let paths: string[] = [];
  try {
    paths = execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return { importers: new Map(), files: new Set() };
  }
  return buildImportGraph(paths, (p) => readFileSync(p, "utf8"));
}

// ─── 내부 path 유틸 (posix 기준; git 경로는 항상 '/' 구분) ────────────────────

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function joinPath(dir: string, rel: string): string {
  const parts = (dir ? dir.split("/") : []).concat(rel.split("/"));
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}
