import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "@/lib/impact-review/diff";
import { loadRules } from "@/lib/impact-review/rules";
import { runReview } from "@/lib/impact-review/run";
import {
  reviewWithModel,
  parseModelFindings,
  type ChatClient,
  type ProviderConfig,
} from "@/lib/impact-review/model";
import type { Finding, RuleCatalog } from "@/lib/impact-review/types";

const ROOT = path.resolve(__dirname, "..");
const FX = (name: string) =>
  readFileSync(path.join(ROOT, "__tests__/fixtures/impact-review", name), "utf8");

let catalog: RuleCatalog;
beforeAll(() => {
  catalog = loadRules(path.join(ROOT, ".github/impact-review/rules.md"));
});

const review = (diffText: string, extra: Record<string, unknown> = {}) =>
  runReview({ diffText, catalog, provider: "none", ...extra });

const criticalRuleIds = (findings: Finding[]): string[] =>
  findings.filter((f) => f.severity === "Critical").flatMap((f) => f.ruleIds);

describe("rules loading", () => {
  it("loads the two mirror-pair rules (pattern rules moved to the AI lane)", () => {
    expect(catalog.rules.length).toBe(2);
    const ids = catalog.rules.map((r) => r.id);
    expect(ids).toContain("MIRROR-EXAM-AUTHORING-FORMS");
    expect(ids).toContain("MIRROR-ASSIGNMENT-AUTHORING-FORMS");
    expect(catalog.rules.every((r) => r.kind === "mirror")).toBe(true);
  });
});

describe("diff parsing edge cases", () => {
  it("parses empty diff to no files", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff(FX("empty.diff"))).toEqual([]);
  });
  it("parses single-file and multi-file diffs", () => {
    expect(parseUnifiedDiff(FX("mirror-only-exam-new.diff")).length).toBe(1);
    expect(parseUnifiedDiff(FX("mixed-exam-new-plus-unrelated-grade-utils.diff")).length).toBe(2);
  });
  it("captures added/removed changed text", () => {
    const [f] = parseUnifiedDiff(FX("mirror-only-exam-new.diff"));
    expect(f.path).toBe("app/(app)/instructor/new/page.tsx");
    expect(f.changedText).toContain("isObjectiveQuestionIncomplete");
  });
});

describe("deterministic mirror prechecks (acceptance #1)", () => {
  it("flags Critical when only the exam create side changes", async () => {
    const r = await review(FX("mirror-only-exam-new.diff"));
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
    expect(r.shouldFail).toBe(true);
  });

  it("flags Critical when only the assignment create side changes", async () => {
    const r = await review(FX("mirror-only-assignment-new.diff"));
    expect(criticalRuleIds(r.deterministicFindings)).toContain(
      "MIRROR-ASSIGNMENT-AUTHORING-FORMS"
    );
    expect(r.shouldFail).toBe(true);
  });
});

describe("mixed-commit guard (unrelated shared-module hunk must NOT exempt)", () => {
  it("still flags exam mirror Critical despite an unrelated grade-utils hunk", async () => {
    const r = await review(FX("mixed-exam-new-plus-unrelated-grade-utils.diff"));
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });

  it("still flags assignment mirror Critical despite an unrelated date-utils hunk", async () => {
    const r = await review(FX("mixed-assignment-new-plus-unrelated-shared-context.diff"));
    expect(criticalRuleIds(r.deterministicFindings)).toContain(
      "MIRROR-ASSIGNMENT-AUTHORING-FORMS"
    );
  });
});

describe("same-dimension exemption (legit shared-helper change suppresses mirror Critical)", () => {
  it("suppresses exam mirror Critical when the matching helper hunk covers the changed dimension", async () => {
    // create side changes question-empty dimension AND authoring-validation.ts has a matching helper hunk.
    const diff = [
      "diff --git a/app/(app)/instructor/new/page.tsx b/app/(app)/instructor/new/page.tsx",
      "--- a/app/(app)/instructor/new/page.tsx",
      "+++ b/app/(app)/instructor/new/page.tsx",
      "@@ -150,1 +150,1 @@",
      "-      questions.some((q) => !isQuestionContentEmpty(q.text))",
      "+      questions.some((q) => !isQuestionContentEmpty(q.text) && q.text.length > 0)",
      "diff --git a/lib/authoring-validation.ts b/lib/authoring-validation.ts",
      "--- a/lib/authoring-validation.ts",
      "+++ b/lib/authoring-validation.ts",
      "@@ -22,1 +22,1 @@",
      '-  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";',
      '+  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\\s+/g, " ").trim() === "";',
    ].join("\n");
    const r = await review(diff);
    expect(criticalRuleIds(r.deterministicFindings)).not.toContain(
      "MIRROR-EXAM-AUTHORING-FORMS"
    );
  });
});

describe("exemption hardening (unrelated same-helper hunk must NOT over-exempt)", () => {
  it("still flags Critical when authoring-validation has an UNRELATED hunk with only a broad token", async () => {
    const diff = [
      "diff --git a/app/(app)/instructor/new/page.tsx b/app/(app)/instructor/new/page.tsx",
      "--- a/app/(app)/instructor/new/page.tsx",
      "+++ b/app/(app)/instructor/new/page.tsx",
      "@@ -497,1 +497,1 @@",
      "-    questions.some((q) => isObjectiveQuestionIncomplete(q))",
      "+    questions.some((q) => isObjectiveQuestionIncomplete(q) || q.options?.length === 1)",
      "diff --git a/lib/authoring-validation.ts b/lib/authoring-validation.ts",
      "--- a/lib/authoring-validation.ts",
      "+++ b/lib/authoring-validation.ts",
      "@@ -40,0 +41,1 @@",
      "+export const defaultOptions: string[] = [];",
    ].join("\n");
    const r = await review(diff);
    // 헬퍼 hunk가 broad 토큰 'options' 하나만 가지므로 면제되면 안 됨 → Critical 유지.
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });
});

describe("no false positives (acceptance #2)", () => {
  it("emits zero Critical for a format-only diff", async () => {
    const r = await review(FX("format-only.diff"));
    expect(r.findings.filter((f) => f.severity === "Critical")).toHaveLength(0);
    expect(r.shouldFail).toBe(false);
  });

  it("emits nothing for an empty diff", async () => {
    const r = await review(FX("empty.diff"));
    expect(r.findings).toHaveLength(0);
    expect(r.shouldFail).toBe(false);
  });

  it("does not flag a mirror when BOTH sides change", async () => {
    const both = [
      "diff --git a/app/(app)/instructor/new/page.tsx b/app/(app)/instructor/new/page.tsx",
      "--- a/app/(app)/instructor/new/page.tsx",
      "+++ b/app/(app)/instructor/new/page.tsx",
      "@@ -497,1 +497,1 @@",
      "-    questions.some((q) => isObjectiveQuestionIncomplete(q))",
      "+    questions.some((q) => isObjectiveQuestionIncomplete(q) || false)",
      "diff --git a/app/(app)/instructor/[examId]/edit/page.tsx b/app/(app)/instructor/[examId]/edit/page.tsx",
      "--- a/app/(app)/instructor/[examId]/edit/page.tsx",
      "+++ b/app/(app)/instructor/[examId]/edit/page.tsx",
      "@@ -200,1 +200,1 @@",
      "-    questions.some((q) => isObjectiveQuestionIncomplete(q))",
      "+    questions.some((q) => isObjectiveQuestionIncomplete(q) || false)",
    ].join("\n");
    const r = await review(both);
    expect(criticalRuleIds(r.deterministicFindings)).not.toContain(
      "MIRROR-EXAM-AUTHORING-FORMS"
    );
  });
});

describe("blast radius (acceptance #6)", () => {
  it("includes the mirror sibling as a dependent (rule-based, no import edge needed)", async () => {
    const r = await review(FX("mirror-only-exam-new.diff"));
    const mirror = r.blastRadius.find((b) =>
      b.dependents.some((d) => d.reason === "mirror_pair")
    );
    expect(mirror).toBeTruthy();
    expect(mirror!.dependents[0].path).toBe("app/(app)/instructor/[examId]/edit/page.tsx");
  });
});

describe("provider behaviour (deterministic findings survive model state)", () => {
  const cfg: ProviderConfig = { name: "kimi", apiKey: "test", model: "kimi-k2.7-code" };

  it("keeps deterministic Critical when provider is skipped (no key)", async () => {
    const r = await runReview({
      diffText: FX("mirror-only-exam-new.diff"),
      catalog,
      modelOptions: { providers: [] },
    });
    expect(r.provider.skipped).toBe(true);
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });

  it("keeps deterministic Critical when provider returns empty findings", async () => {
    const emptyClient: ChatClient = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }) } },
    };
    const r = await runReview({
      diffText: FX("mirror-only-exam-new.diff"),
      catalog,
      modelOptions: { providers: [cfg], clientFactory: () => emptyClient },
    });
    expect(r.provider.skipped).toBe(false);
    expect(r.provider.findings).toHaveLength(0);
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });

  it("falls back to the next provider on a retryable failure", async () => {
    const failing: ChatClient = {
      chat: { completions: { create: async () => { throw new Error("429 rate limited"); } } },
    };
    const good: ChatClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '{"findings":[{"severity":"Warning","confidence":90,"message":"x"}]}' } }],
          }),
        },
      },
    };
    const r = await reviewWithModel(
      { test: true },
      {
        providers: [cfg, { name: "glm", apiKey: "t", model: "glm-4.6" }],
        clientFactory: (c) => (c.name === "kimi" ? failing : good),
      }
    );
    expect(r.provider).toBe("glm");
    expect(r.findings).toHaveLength(1);
  });
});

describe("confidence threshold filters model findings only (acceptance #2)", () => {
  it("suppresses below-threshold model findings from comment but keeps deterministic", async () => {
    const client: ChatClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content:
                    '{"findings":[{"severity":"Warning","confidence":40,"message":"low"},{"severity":"Warning","confidence":95,"message":"high"}]}',
                },
              },
            ],
          }),
        },
      },
    };
    const r = await runReview({
      diffText: FX("mirror-only-exam-new.diff"),
      catalog,
      confidenceThreshold: 80,
      modelOptions: { providers: [{ name: "kimi", apiKey: "t", model: "m" }], clientFactory: () => client },
    });
    const modelFindings = r.findings.filter((f) => f.source === "model");
    const low = modelFindings.find((f) => f.confidence === 40);
    const high = modelFindings.find((f) => f.confidence === 95);
    expect(low && "suppressed" in low && low.suppressed).toBe(true);
    expect(high && "suppressed" in high && high.suppressed).toBe(false);
    // deterministic Critical untouched
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });
});

describe("model output parsing", () => {
  it("ignores invalid severities and clamps confidence", () => {
    const out = parseModelFindings(
      '{"findings":[{"severity":"Nope","confidence":50,"message":"x"},{"severity":"Critical","confidence":150,"message":"y"}]}'
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(100);
  });
  it("returns [] on non-JSON", () => {
    expect(parseModelFindings("not json")).toEqual([]);
  });
});

describe("model size cap (raw-API vs agent)", () => {
  it("raw-API model is skipped when the diff exceeds the size cap (deterministic still runs)", async () => {
    const r = await runReview({
      diffText: FX("mixed-exam-new-plus-unrelated-grade-utils.diff"),
      catalog,
      provider: "auto",
      maxModelFiles: 1, // 2-file fixture exceeds → raw-API skip
      modelOptions: { providers: [] },
    });
    expect(r.provider.skipped).toBe(true);
    expect(r.provider.skippedReason).toMatch(/too large/);
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });

  it("agent (opencode) path is NOT size-capped — it explores the repo itself", async () => {
    const r = await runReview({
      diffText: FX("mixed-exam-new-plus-unrelated-grade-utils.diff"),
      catalog,
      provider: "opencode",
      maxModelFiles: 1, // would cap raw-API, but agent path ignores it
      agentOptions: {
        command: "opencode",
        runner: async () => ({
          stdout: '{"findings":[{"severity":"Suggestion","confidence":90,"message":"nit"}]}',
          stderr: "",
          code: 0,
        }),
      },
    });
    expect(r.provider.skipped).toBe(false);
    expect(r.provider.provider).toBe("opencode");
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
  });
});
