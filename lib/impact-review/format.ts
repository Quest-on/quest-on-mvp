import type { BlastRadiusEntry, Finding, ProviderResult, ReviewResult } from "./types";
import { visibleFindings } from "./findings";

const PR_MARKER = "<!-- impact-review:pr -->";
const PUSH_MARKER = "<!-- impact-review:push -->";

export function markerFor(event: "pr" | "push"): string {
  return event === "pr" ? PR_MARKER : PUSH_MARKER;
}

const ICON: Record<string, string> = { Critical: "🍓", Warning: "🍋", Suggestion: "🫐" };
const SEV_KO: Record<string, string> = { Critical: "치명", Warning: "경고", Suggestion: "제안" };
const BOT_NAME = "Yeongjun Code Review Bot";

/** 헤더 브랜드에 박을 짧은 모델 뱃지. opencode "zai-coding/glm-5.2" → "glm-5.2". */
function modelBadge(p: ProviderResult): string {
  if (p.skipped || !p.model) return "결정적 전용";
  return p.model.split("/").pop() ?? p.model;
}

/**
 * 모델/에이전트 레인이 안 돌았으면 그 사실을 코멘트 본문에 박는다.
 *
 * 레인이 죽어도 job 은 초록으로 끝난다(결정적 검사만 통과시키는 설계). 그런데
 * 그때 "차단할 이슈가 없어요" 만 보이면 읽는 쪽은 AI 리뷰를 통과했다고 믿는다.
 * 초록의 의미가 조용히 바뀌는 것이 이 봇에서 가장 위험한 실패다.
 */
function degradedNotice(p: ProviderResult): string | null {
  if (!p.skipped) return null;
  return (
    `> ⚠️ **AI 리뷰가 실행되지 않았습니다** — \`${p.skippedReason ?? "skipped"}\`\n` +
    `> 아래는 결정적 검사 결과뿐이고 회귀·아키텍처 레인은 비어 있습니다. ` +
    `이 코멘트가 초록이어도 AI 검토를 받은 것이 아닙니다.`
  );
}

/** PR/커밋 코멘트용 Markdown(한국어). 결정적 섹션 먼저, 모델 섹션 다음. 간결 유지. */
export function formatComment(result: ReviewResult, event: "pr" | "push"): string {
  const visible = visibleFindings(result.findings);
  const det = visible.filter((f) => f.source === "deterministic");
  const isArch = (f: Finding) => f.ruleIds.includes("ARCHITECTURE");
  const model = visible.filter((f) => f.source === "model" && !isArch(f));
  const arch = visible.filter((f) => f.source === "model" && isArch(f));

  const lines: string[] = [markerFor(event), `## 🐥 ${BOT_NAME} · ${modelBadge(result.provider)}`];
  lines.push(
    `_모델 \`${providerLabel(result.provider)}\` · 범위 \`${result.range ?? "n/a"}\` · ` +
      `변경 파일 ${result.changedFiles.length}개_`
  );

  const degraded = degradedNotice(result.provider);
  if (degraded) lines.push("", degraded);

  if (visible.length === 0) {
    lines.push(
      "",
      degraded
        ? "결정적 검사에서는 차단할 이슈가 없습니다. **AI 리뷰는 돌지 않았습니다.**"
        : "🌸 차단할 영향/회귀 이슈가 없어요!"
    );
    lines.push("", `<sub>🐥 ${BOT_NAME} — 변경 영향·거울 드리프트 자동 리뷰</sub>`);
    return lines.join("\n");
  }

  if (det.length) {
    lines.push("", "### 🧷 결정적 검사 (거부 불가)");
    for (const f of det) lines.push(renderFinding(f));
  }
  if (model.length) {
    lines.push("", "### 🌀 회귀 / 교차 영향");
    for (const f of model) lines.push(renderFinding(f));
  }
  if (arch.length) {
    lines.push("", "### 🧩 아키텍처 / 방향성");
    for (const f of arch) lines.push(renderFinding(f));
  }

  if (result.blastRadius.length) {
    lines.push("", "### 🌊 영향 반경 (blast radius)", ...renderBlast(result.blastRadius));
  }
  lines.push("", `<sub>🐥 ${BOT_NAME} — 변경 영향·거울 드리프트 자동 리뷰</sub>`);
  return lines.join("\n");
}

function renderFinding(f: Finding): string {
  const loc = f.location?.path
    ? ` \`${f.location.path}${f.location.line ? `:${f.location.line}` : ""}\``
    : "";
  const conf = f.source === "model" ? ` (신뢰도 ${f.confidence})` : "";
  const rules = f.ruleIds.length ? ` [${f.ruleIds.join(", ")}]` : "";
  return `- ${ICON[f.severity] ?? ""} **${SEV_KO[f.severity] ?? f.severity}**${conf}${rules}${loc} — ${f.message}`;
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
    `${BOT_NAME}: 치명 ${counts.Critical} · 경고 ${counts.Warning} · ` +
    `제안 ${counts.Suggestion} · 모델 ${providerLabel(result.provider)} · ` +
    `실패=${result.shouldFail}`
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
