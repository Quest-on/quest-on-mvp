import type { BlastRadiusEntry, Finding, ProviderResult, ReviewResult } from "./types";
import { visibleFindings } from "./findings";

const PR_MARKER = "<!-- impact-review:pr -->";
const PUSH_MARKER = "<!-- impact-review:push -->";

export function markerFor(event: "pr" | "push"): string {
  return event === "pr" ? PR_MARKER : PUSH_MARKER;
}

const ICON: Record<string, string> = { Critical: "🔴", Warning: "🟡", Suggestion: "🔵" };

/** PR/커밋 코멘트용 Markdown. 결정적 섹션 먼저, 모델 섹션 다음. 간결 유지. */
export function formatComment(result: ReviewResult, event: "pr" | "push"): string {
  const visible = visibleFindings(result.findings);
  const det = visible.filter((f) => f.source === "deterministic");
  const isArch = (f: Finding) => f.ruleIds.includes("ARCHITECTURE");
  const model = visible.filter((f) => f.source === "model" && !isArch(f));
  const arch = visible.filter((f) => f.source === "model" && isArch(f));

  const lines: string[] = [markerFor(event), "## 🧭 Impact Review"];
  lines.push(
    `_range: \`${result.range ?? "n/a"}\` · files: ${result.changedFiles.length} · ` +
      `provider: ${providerLabel(result.provider)}_`
  );

  if (visible.length === 0) {
    lines.push("", "✅ No blocking impact findings.");
    return lines.join("\n");
  }

  if (det.length) {
    lines.push("", "### Deterministic (non-vetoable)");
    for (const f of det) lines.push(renderFinding(f));
  }
  if (model.length) {
    lines.push("", "### Model review (regression / cross-file)");
    for (const f of model) lines.push(renderFinding(f));
  }
  if (arch.length) {
    lines.push("", "### Architecture / direction");
    for (const f of arch) lines.push(renderFinding(f));
  }

  if (result.blastRadius.length) {
    lines.push("", "### Blast radius", ...renderBlast(result.blastRadius));
  }
  return lines.join("\n");
}

function renderFinding(f: Finding): string {
  const loc = f.location?.path
    ? ` \`${f.location.path}${f.location.line ? `:${f.location.line}` : ""}\``
    : "";
  const conf = f.source === "model" ? ` (conf ${f.confidence})` : "";
  const rules = f.ruleIds.length ? ` [${f.ruleIds.join(", ")}]` : "";
  return `- ${ICON[f.severity] ?? ""} **${f.severity}**${conf}${rules}${loc} — ${f.message}`;
}

function renderBlast(entries: BlastRadiusEntry[]): string[] {
  return entries.slice(0, 20).map((e) => {
    const deps = e.dependents
      .slice(0, 10)
      .map((d) => `\`${d.path}\`(${d.reason}${d.ruleId ? `:${d.ruleId}` : ""})`)
      .join(", ");
    return `- \`${e.changedSymbol}\` → ${deps || "(no dependents found)"}`;
  });
}

function providerLabel(p: ProviderResult): string {
  if (p.skipped) return `none (${p.skippedReason ?? "skipped"})`;
  return `${p.provider}${p.model ? `/${p.model}` : ""}`;
}

/** GitHub Step Summary / 콘솔용 한 줄 요약. */
export function formatSummary(result: ReviewResult): string {
  const counts = { Critical: 0, Warning: 0, Suggestion: 0 } as Record<string, number>;
  for (const f of visibleFindings(result.findings)) counts[f.severity]++;
  return (
    `impact-review: ${counts.Critical} Critical, ${counts.Warning} Warning, ` +
    `${counts.Suggestion} Suggestion · provider ${providerLabel(result.provider)} · ` +
    `shouldFail=${result.shouldFail}`
  );
}

/** 기계 판독용 JSON 아티팩트 (suppressed 모델 포함). */
export function formatJson(result: ReviewResult): string {
  return JSON.stringify(
    {
      range: result.range,
      changedFiles: result.changedFiles.map((f) => ({ path: f.path, status: f.status })),
      changedSymbols: result.changedSymbols,
      blastRadius: result.blastRadius,
      findings: result.findings,
      provider: { provider: result.provider.provider, model: result.provider.model, skipped: result.provider.skipped },
      shouldFail: result.shouldFail,
    },
    null,
    2
  );
}
