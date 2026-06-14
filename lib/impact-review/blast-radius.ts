import type { BlastRadiusEntry, ChangedSymbol, DiffFile, RuleCatalog } from "./types";
import { buildRepoGraph, transitiveImporters, type ImportGraph } from "./code-graph";

/**
 * diff-scoped blast radius (codegraph 기반).
 * - 거울 쌍 sibling은 import 그래프가 아니라 *규칙*에서 진입(복붙 거울은 import edge 없음).
 * - 그 외에는 변경 파일의 *전이 importer*를 import 그래프로 계산(2-hop 기본). grep 스캔보다 정확.
 */
export function computeBlastRadius(
  files: DiffFile[],
  _symbols: ChangedSymbol[],
  catalog: RuleCatalog,
  opts: { scan?: boolean; graph?: ImportGraph; maxHops?: number; maxNodes?: number } = {}
): BlastRadiusEntry[] {
  const entries: BlastRadiusEntry[] = [];
  const changedPaths = new Set(files.map((f) => f.path));

  // 1) 규칙 기반 거울 sibling (import edge 없이도 진입).
  for (const rule of catalog.rules) {
    if (rule.kind !== "mirror") continue;
    const { create, edit } = rule.sides;
    if (changedPaths.has(create) && !changedPaths.has(edit)) {
      entries.push(mirrorEntry(create, edit, rule.id));
    } else if (changedPaths.has(edit) && !changedPaths.has(create)) {
      entries.push(mirrorEntry(edit, create, rule.id));
    }
  }

  // 2) 코드그래프 전이 importer.
  if (opts.scan || opts.graph) {
    const graph = opts.graph ?? buildRepoGraph();
    const importers = transitiveImporters([...changedPaths], graph, {
      maxHops: opts.maxHops ?? 2,
      maxNodes: opts.maxNodes ?? 40,
    });
    if (importers.length) {
      entries.push({
        changedSymbol: `${files.length} changed file(s)`,
        sourcePath: files[0]?.path ?? "",
        dependents: importers.map((n) => ({
          path: n.path,
          reason: "importer" as const,
        })),
      });
    }
  }
  return entries;
}

function mirrorEntry(source: string, sibling: string, ruleId: string): BlastRadiusEntry {
  return {
    changedSymbol: source,
    sourcePath: source,
    dependents: [{ path: sibling, reason: "mirror_pair", ruleId }],
  };
}
