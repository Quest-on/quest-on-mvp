import { readFileSync } from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { Rule, RuleCatalog, MirrorRule } from "./types";

const DEFAULT_RULES_PATH = ".github/impact-review/rules.md";

/** rules.md에서 ```yaml impact-review-rules``` 블록을 추출해 파싱·검증한다. */
export function loadRules(rulesPath: string = DEFAULT_RULES_PATH): RuleCatalog {
  const abs = path.isAbsolute(rulesPath) ? rulesPath : path.join(process.cwd(), rulesPath);
  const md = readFileSync(abs, "utf8");
  return parseRulesMarkdown(md);
}

export function parseRulesMarkdown(md: string): RuleCatalog {
  const m = md.match(/```yaml impact-review-rules\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error("rules.md: missing ```yaml impact-review-rules``` block");
  const doc = yamlLoad(m[1]) as unknown;
  return validateCatalog(doc);
}

function validateCatalog(doc: unknown): RuleCatalog {
  if (!doc || typeof doc !== "object") throw new Error("rules: not an object");
  const d = doc as Record<string, unknown>;
  if (!Array.isArray(d.rules)) throw new Error("rules: `rules` must be an array");
  const rules = d.rules.map(validateRule);
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`rules: duplicate id ${r.id}`);
    ids.add(r.id);
  }
  return { version: typeof d.version === "number" ? d.version : 1, rules };
}

function validateRule(raw: unknown): Rule {
  if (!raw || typeof raw !== "object") throw new Error("rule: not an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") throw new Error("rule: missing id");
  if (r.kind === "mirror") {
    const sides = r.sides as Record<string, unknown> | undefined;
    if (!sides || typeof sides.create !== "string" || typeof sides.edit !== "string")
      throw new Error(`rule ${r.id}: mirror needs sides.create/edit`);
    if (!Array.isArray(r.watch) || r.watch.length === 0)
      throw new Error(`rule ${r.id}: mirror needs non-empty watch[]`);
    const mirror: MirrorRule = {
      id: r.id,
      kind: "mirror",
      severity: (r.severity as MirrorRule["severity"]) ?? "Critical",
      sides: { create: sides.create as string, edit: sides.edit as string },
      reviewContextModules: asStringArray(r.reviewContextModules),
      watch: r.watch as string[],
      exemptions: Array.isArray(r.exemptions)
        ? r.exemptions.map((e) => {
            const ex = e as Record<string, unknown>;
            return {
              dimension: String(ex.dimension ?? ""),
              helper: String(ex.helper ?? ""),
              mirrorWatch: asStringArray(ex.mirrorWatch),
              helperHunk: asStringArray(ex.helperHunk),
            };
          })
        : [],
    };
    return mirror;
  }
  throw new Error(`rule ${r.id}: unknown kind ${String(r.kind)}`);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
