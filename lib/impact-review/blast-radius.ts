import { execFileSync } from "node:child_process";
import type { BlastRadiusEntry, ChangedSymbol, DiffFile, RuleCatalog } from "./types";

/**
 * diff-scoped blast radius.
 * - 거울 쌍 sibling은 import 그래프가 아니라 *규칙*에서 패킷에 진입한다
 *   (복붙 거울은 import edge가 없으므로).
 * - 그 외에는 변경 심볼/모듈을 git-tracked 소스에서 grep해 importer/caller를 찾는다
 *   (영구 인덱스가 아니라 per-run, diff 항으로 bound된 질의).
 */
export function computeBlastRadius(
  files: DiffFile[],
  symbols: ChangedSymbol[],
  catalog: RuleCatalog,
  opts: { scan?: boolean } = {}
): BlastRadiusEntry[] {
  const entries: BlastRadiusEntry[] = [];
  const changedPaths = new Set(files.map((f) => f.path));

  // 1) 규칙 기반 거울 sibling.
  for (const rule of catalog.rules) {
    if (rule.kind !== "mirror") continue;
    const { create, edit } = rule.sides;
    if (changedPaths.has(create) && !changedPaths.has(edit)) {
      entries.push({
        changedSymbol: create,
        sourcePath: create,
        dependents: [{ path: edit, reason: "mirror_pair", ruleId: rule.id }],
      });
    } else if (changedPaths.has(edit) && !changedPaths.has(create)) {
      entries.push({
        changedSymbol: edit,
        sourcePath: edit,
        dependents: [{ path: create, reason: "mirror_pair", ruleId: rule.id }],
      });
    }
  }

  // 2) 변경 심볼 importer/caller 스캔 (옵션, 러너 환경).
  if (opts.scan) {
    const tracked = listTrackedSources();
    for (const sym of symbols.slice(0, 50)) {
      const deps = scanCallers(sym.name, tracked, changedPaths).slice(0, 30);
      if (deps.length) {
        entries.push({
          changedSymbol: sym.name,
          sourcePath: sym.path,
          dependents: deps.map((p) => ({ path: p, reason: "caller" as const })),
        });
      }
    }
  }
  return entries;
}

function listTrackedSources(): string[] {
  try {
    return execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.js", "*.jsx"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function scanCallers(symbol: string, files: string[], exclude: Set<string>): string[] {
  if (!/^[A-Za-z_$][\w$]*$/.test(symbol)) return [];
  const out: string[] = [];
  let needle: RegExp;
  try {
    needle = new RegExp(`\\b${symbol}\\s*\\(`);
  } catch {
    return [];
  }
  for (const f of files) {
    if (exclude.has(f)) continue;
    try {
      const src = execFileSync("git", ["show", `HEAD:${f}`], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (needle.test(src)) out.push(f);
    } catch {
      /* ignore unreadable */
    }
    if (out.length >= 30) break;
  }
  return out;
}
