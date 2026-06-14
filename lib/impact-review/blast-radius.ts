import type { BlastRadiusEntry, DiffFile, RuleCatalog } from "./types";

/**
 * 거울(mirror) seed만 결정적으로 제공한다.
 * - 복붙 거울(new↔edit)은 import edge가 없어 grep으로 못 찾으므로 *규칙*에서 주입해야 한다.
 * - 그 외 importer/caller 추적은 AI 에이전트가 레포를 직접 grep/read 하도록 위임(전이 import 그래프 제거).
 */
export function computeBlastRadius(files: DiffFile[], catalog: RuleCatalog): BlastRadiusEntry[] {
  const entries: BlastRadiusEntry[] = [];
  const changedPaths = new Set(files.map((f) => f.path));

  for (const rule of catalog.rules) {
    if (rule.kind !== "mirror") continue;
    const { create, edit } = rule.sides;
    if (changedPaths.has(create) && !changedPaths.has(edit)) {
      entries.push(mirrorEntry(create, edit, rule.id));
    } else if (changedPaths.has(edit) && !changedPaths.has(create)) {
      entries.push(mirrorEntry(edit, create, rule.id));
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
