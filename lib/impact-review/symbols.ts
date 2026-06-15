import type { ChangedSymbol, DiffFile } from "./types";

/**
 * diff-scoped 변경 심볼 추출. 무거운 전체 AST 대신 변경된(추가/삭제) 라인에서
 * 선언 식별자를 뽑는다. (importer/caller 스캔의 검색어로만 쓰이므로 충분.)
 */
const DECL_PATTERNS: Array<{ kind: ChangedSymbol["kind"]; re: RegExp }> = [
  { kind: "function", re: /\bfunction\s+([A-Za-z_$][\w$]*)/g },
  { kind: "const", re: /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*[=:]/g },
  { kind: "class", re: /\bclass\s+([A-Za-z_$][\w$]*)/g },
  { kind: "type", re: /\b(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g },
];

export function extractChangedSymbols(files: DiffFile[]): ChangedSymbol[] {
  const out: ChangedSymbol[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.path)) continue;
    for (const { kind, re } of DECL_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.changedText))) {
        const name = m[1];
        if (!isMeaningfulSymbol(name)) continue;
        const key = `${f.path}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, kind, path: f.path });
      }
    }
  }
  return out;
}

/** importer/caller 스캔 노이즈를 막기 위해 너무 흔하거나 짧은 식별자는 제외. */
const COMMON_NAMES = new Set([
  "all", "client", "read", "get", "set", "run", "main", "data", "res", "req",
  "ctx", "err", "error", "value", "result", "item", "items", "list", "map",
  "name", "type", "props", "state", "config", "options", "handler", "callback",
  "next", "prev", "index", "args", "params", "body", "headers", "supabase",
]);

function isMeaningfulSymbol(name: string): boolean {
  if (name.length < 4) return false;
  if (COMMON_NAMES.has(name)) return false;
  return true;
}
