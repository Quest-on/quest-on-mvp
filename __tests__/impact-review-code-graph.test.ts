import { describe, expect, it } from "vitest";
import {
  extractImportSpecifiers,
  resolveImport,
  buildImportGraph,
  transitiveImporters,
} from "@/lib/impact-review/code-graph";

describe("extractImportSpecifiers", () => {
  it("picks up import/from, dynamic import(), and require()", () => {
    const src = [
      "import { a } from '@/lib/a';",
      "import b from './b';",
      "export { c } from '../c';",
      "const d = await import('@/lib/d');",
      "const e = require('@/lib/e');",
      "import 'side-effect';",
    ].join("\n");
    const specs = extractImportSpecifiers(src);
    expect(specs).toContain("@/lib/a");
    expect(specs).toContain("./b");
    expect(specs).toContain("../c");
    expect(specs).toContain("@/lib/d");
    expect(specs).toContain("@/lib/e");
  });
});

describe("resolveImport", () => {
  const files = new Set([
    "lib/a.ts",
    "lib/sub/b.tsx",
    "lib/c/index.ts",
    "app/page.tsx",
  ]);
  it("resolves @/ alias with extension guessing", () => {
    expect(resolveImport("@/lib/a", "app/page.tsx", files)).toBe("lib/a.ts");
  });
  it("resolves relative imports", () => {
    expect(resolveImport("./b", "lib/sub/x.ts", files)).toBe("lib/sub/b.tsx");
  });
  it("resolves directory index files", () => {
    expect(resolveImport("@/lib/c", "app/page.tsx", files)).toBe("lib/c/index.ts");
  });
  it("returns null for external packages", () => {
    expect(resolveImport("react", "app/page.tsx", files)).toBeNull();
  });
});

describe("buildImportGraph + transitiveImporters", () => {
  // a <- b <- c  (c imports b, b imports a)
  const fileMap: Record<string, string> = {
    "lib/a.ts": "export const a = 1;",
    "lib/b.ts": "import { a } from '@/lib/a'; export const b = a + 1;",
    "lib/c.ts": "import { b } from '@/lib/b'; export const c = b + 1;",
    "lib/unrelated.ts": "export const u = 0;",
  };
  const paths = Object.keys(fileMap);
  const graph = buildImportGraph(paths, (p) => fileMap[p]);

  it("records reverse import edges", () => {
    expect([...(graph.importers.get("lib/a.ts") ?? [])]).toContain("lib/b.ts");
    expect([...(graph.importers.get("lib/b.ts") ?? [])]).toContain("lib/c.ts");
  });

  it("computes transitive importers up to maxHops", () => {
    const r = transitiveImporters(["lib/a.ts"], graph, { maxHops: 2 });
    const paths2 = r.map((n) => n.path);
    expect(paths2).toContain("lib/b.ts"); // 1 hop
    expect(paths2).toContain("lib/c.ts"); // 2 hops (transitive)
    expect(paths2).not.toContain("lib/unrelated.ts");
  });

  it("respects maxHops=1 (no transitive)", () => {
    const r = transitiveImporters(["lib/a.ts"], graph, { maxHops: 1 });
    const paths1 = r.map((n) => n.path);
    expect(paths1).toContain("lib/b.ts");
    expect(paths1).not.toContain("lib/c.ts");
  });

  it("caps node count", () => {
    const r = transitiveImporters(["lib/a.ts"], graph, { maxHops: 5, maxNodes: 1 });
    expect(r.length).toBe(1);
  });
});
