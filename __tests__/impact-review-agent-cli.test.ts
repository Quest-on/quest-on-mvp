import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadRules } from "@/lib/impact-review/rules";
import { runReview } from "@/lib/impact-review/run";
import {
  reviewWithAgentCli,
  buildAgentPrompt,
  type AgentRunner,
} from "@/lib/impact-review/agent-cli";
import type { Finding, RuleCatalog } from "@/lib/impact-review/types";

const ROOT = path.resolve(__dirname, "..");
const FX = (name: string) =>
  readFileSync(path.join(ROOT, "__tests__/fixtures/impact-review", name), "utf8");

let catalog: RuleCatalog;
beforeAll(() => {
  catalog = loadRules(path.join(ROOT, ".github/impact-review/rules.md"));
});

const ok =
  (stdout: string): AgentRunner =>
  async () => ({ stdout, stderr: "", code: 0 });

describe("buildAgentPrompt", () => {
  it("embeds the change brief and invites repo exploration + JSON-only output", () => {
    const p = buildAgentPrompt({ hello: "world" });
    expect(p).toContain("CHANGE BRIEF");
    expect(p).toContain('"hello":"world"');
    expect(p).toMatch(/Explore the repository/i);
    expect(p).toMatch(/return ONLY the JSON object/i);
  });
});

describe("reviewWithAgentCli (opencode headless)", () => {
  it("parses findings from the agent stdout (even with surrounding prose)", async () => {
    const runner = ok(
      'Here is my review:\n{"findings":[{"severity":"Warning","confidence":88,"message":"x"}]}\nDone.'
    );
    const r = await reviewWithAgentCli({ test: 1 }, { command: "opencode", runner });
    expect(r.skipped).toBe(false);
    expect(r.provider).toBe("opencode");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].confidence).toBe(88);
  });

  it("marks skipped on non-zero exit (deterministic must survive)", async () => {
    const runner: AgentRunner = async () => ({ stdout: "", stderr: "boom", code: 1 });
    const r = await reviewWithAgentCli({ test: 1 }, { command: "opencode", runner });
    expect(r.skipped).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("marks skipped when the runner throws", async () => {
    const runner: AgentRunner = async () => {
      throw new Error("spawn opencode ENOENT");
    };
    const r = await reviewWithAgentCli({ test: 1 }, { command: "opencode", runner });
    expect(r.skipped).toBe(true);
  });
});

describe("runReview via provider=opencode", () => {
  const criticalRuleIds = (f: Finding[]) =>
    f.filter((x) => x.severity === "Critical").flatMap((x) => x.ruleIds);

  it("keeps deterministic mirror Critical and folds in agent findings", async () => {
    const runner = ok('{"findings":[{"severity":"Suggestion","confidence":90,"message":"nit"}]}');
    const r = await runReview({
      diffText: FX("mirror-only-exam-new.diff"),
      catalog,
      provider: "opencode",
      agentOptions: { command: "opencode", runner },
    });
    expect(r.provider.provider).toBe("opencode");
    expect(r.provider.skipped).toBe(false);
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
    expect(r.shouldFail).toBe(true); // deterministic Critical
  });

  it("still flags deterministic Critical when the agent is unavailable", async () => {
    const runner: AgentRunner = async () => ({ stdout: "", stderr: "not found", code: 127 });
    const r = await runReview({
      diffText: FX("mirror-only-exam-new.diff"),
      catalog,
      provider: "opencode",
      agentOptions: { command: "opencode", runner },
    });
    expect(r.provider.skipped).toBe(true);
    expect(criticalRuleIds(r.deterministicFindings)).toContain("MIRROR-EXAM-AUTHORING-FORMS");
    expect(r.shouldFail).toBe(true);
  });
});
