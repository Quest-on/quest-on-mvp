import { parseUnifiedDiff, getDiffForRange } from "./diff";
import { loadRules } from "./rules";
import { runPrechecks } from "./prechecks";
import { extractChangedSymbols } from "./symbols";
import { computeBlastRadius } from "./blast-radius";
import { reviewWithModel, type ReviewModelOptions } from "./model";
import { reviewWithAgentCli, type AgentCliOptions } from "./agent-cli";
import { mergeFindings, computeShouldFail } from "./findings";
import type { ReviewExitPolicy, ReviewResult, RuleCatalog } from "./types";

export interface RunReviewOptions {
  /** diff 텍스트 직접 주입 (테스트/`--diff-file`). 우선순위 최상. */
  diffText?: string;
  /** git 범위 (러너). diffText가 없을 때 사용. */
  range?: string | null;
  rulesPath?: string;
  catalog?: RuleCatalog; // 주입 시 rulesPath 무시.
  confidenceThreshold?: number;
  policy?: Partial<ReviewExitPolicy>;
  /**
   * 모델 provider 선택:
   *  - "none": 모델 호출 끔 (deterministic-only).
   *  - "auto": OpenAI-호환 키(kimi/glm/openai)로 raw API. 키 없으면 자동 skip.
   *  - "opencode" | "agent-cli": 화이트리스트 코딩 CLI 헤드리스 실행 (coding 구독 키용).
   */
  provider?: "none" | "auto" | "agent-cli" | "opencode";
  modelOptions?: ReviewModelOptions;
  agentOptions?: AgentCliOptions;
  /** importer/caller 정적 스캔 (러너 환경에서만 true). */
  scanBlastRadius?: boolean;
  /** 모델에 보낼 최대 변경 파일 수 / 변경 라인 수 (초과 시 모델 skip). */
  maxModelFiles?: number;
  maxModelLines?: number;
}

export async function runReview(opts: RunReviewOptions): Promise<ReviewResult> {
  const threshold = opts.confidenceThreshold ?? 80;
  const policy: ReviewExitPolicy = {
    failOnDeterministicCritical: opts.policy?.failOnDeterministicCritical ?? true,
    failOnAiCritical: opts.policy?.failOnAiCritical ?? false,
  };

  // 1) diff 확보.
  let diffText = opts.diffText;
  let range = opts.range ?? null;
  if (diffText === undefined) {
    const resolved = getDiffForRange(range);
    diffText = resolved.diffText;
    range = resolved.range;
  }
  const files = parseUnifiedDiff(diffText ?? "");

  // 2) 규칙.
  const catalog = opts.catalog ?? loadRules(opts.rulesPath);

  // 3) 결정적 prechecks (모델 호출 전, 최종).
  const deterministic = runPrechecks(files, catalog);

  // 4) 심볼 + blast radius.
  const symbols = extractChangedSymbols(files);
  const blastRadius = computeBlastRadius(files, symbols, catalog, {
    scan: opts.scanBlastRadius ?? false,
  });

  // 5) 모델 2차 리뷰.
  const mode = opts.provider ?? "auto";
  const packet = {
    schema_version: 1,
    review_kind: "change-impact-regression",
    repo: "quest-on",
    range,
    changed_files: files.map((f) => ({ path: f.path, status: f.status })),
    changed_symbols: symbols,
    deterministic_findings: deterministic,
    blast_radius: blastRadius,
    confidence_threshold: threshold,
  };
  // 거대 diff는 모델에 보내지 않는다(프롬프트 폭발/E2BIG/비용 방지). 결정적 레이어는 그대로 동작.
  const maxFiles = opts.maxModelFiles ?? 60;
  const totalChangedLines = files.reduce(
    (n, f) => n + f.hunks.reduce((h, hk) => h + hk.changedText.split("\n").length, 0),
    0
  );
  const maxLines = opts.maxModelLines ?? 4000;
  const tooLarge = files.length > maxFiles || totalChangedLines > maxLines;

  let provider;
  if (mode === "none") {
    provider = {
      provider: "none" as const,
      model: null,
      skipped: true,
      skippedReason: "provider=none",
      findings: [],
    };
  } else if (tooLarge) {
    provider = {
      provider: "none" as const,
      model: null,
      skipped: true,
      skippedReason: `diff too large for model review (${files.length} files, ~${totalChangedLines} changed lines)`,
      findings: [],
    };
  } else if (mode === "agent-cli" || mode === "opencode") {
    // coding 구독 키: 화이트리스트 CLI(opencode) 헤드리스 경유.
    provider = await reviewWithAgentCli(packet, opts.agentOptions);
  } else {
    provider = await reviewWithModel(packet, opts.modelOptions);
  }

  // 6) 병합 + exit policy.
  const findings = mergeFindings(deterministic, provider.findings, threshold);
  const shouldFail = computeShouldFail(findings, policy);

  return {
    range,
    changedFiles: files,
    changedSymbols: symbols,
    blastRadius,
    deterministicFindings: deterministic,
    provider,
    findings,
    shouldFail,
  };
}
