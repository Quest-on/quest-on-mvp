import { parseUnifiedDiff, getDiffForRange } from "./diff";
import { loadRules } from "./rules";
import { runPrechecks } from "./prechecks";
import { extractChangedSymbols } from "./symbols";
import { computeBlastRadius } from "./blast-radius";
import { reviewWithModel, type ReviewModelOptions } from "./model";
import {
  reviewWithAgentCli,
  ARCH_SYSTEM_PROMPT,
  type AgentCliOptions,
} from "./agent-cli";
import { mergeFindings, computeShouldFail } from "./findings";
import type { ModelFinding, ProviderResult, ReviewExitPolicy, ReviewResult, RuleCatalog } from "./types";

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
  /** 모델에 보낼 최대 변경 파일 수 / 변경 라인 수 (초과 시 모델 skip). */
  maxModelFiles?: number;
  maxModelLines?: number;
  /** agent 모드 리뷰 레인. 기본 ["regression","architecture"]. */
  lanes?: Array<"regression" | "architecture">;
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

  // 4) 심볼 + blast radius(거울 seed). importer 추적은 AI 에이전트가 직접 grep.
  const symbols = extractChangedSymbols(files);
  const blastRadius = computeBlastRadius(files, catalog);

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
  const isAgent = mode === "agent-cli" || mode === "opencode";

  // raw-API 모델은 파일을 못 읽으므로 거대 diff는 skip(프롬프트 폭발/비용 방지).
  // 에이전트(opencode) 경로는 *brief만 주입*하고 레포를 직접 읽으므로 캡을 적용하지 않는다.
  const maxFiles = opts.maxModelFiles ?? 60;
  const totalChangedLines = files.reduce(
    (n, f) => n + f.hunks.reduce((h, hk) => h + hk.changedText.split("\n").length, 0),
    0
  );
  const maxLines = opts.maxModelLines ?? 4000;
  const tooLargeForRawApi =
    !isAgent && (files.length > maxFiles || totalChangedLines > maxLines);

  let provider;
  if (mode === "none") {
    provider = {
      provider: "none" as const,
      model: null,
      skipped: true,
      skippedReason: "provider=none",
      findings: [],
    };
  } else if (tooLargeForRawApi) {
    provider = {
      provider: "none" as const,
      model: null,
      skipped: true,
      skippedReason: `diff too large for raw-API model review (${files.length} files, ~${totalChangedLines} changed lines); use provider=opencode for agentic review`,
      findings: [],
    };
  } else if (isAgent) {
    // coding 구독 키: 화이트리스트 CLI(opencode) 헤드리스 에이전트가 레포를 직접 탐색.
    // 두 레인을 돌린다: regression(국소 회귀/cross-file) + architecture(큰 방향성).
    const lanes = opts.lanes ?? ["regression", "architecture"];
    provider = await runAgentLanes(packet, lanes, opts.agentOptions);
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

/**
 * agent 리뷰 레인을 병렬 실행해 하나의 ProviderResult로 병합한다.
 * - regression: 국소 회귀/cross-file 위험.
 * - architecture: 큰 방향성(아키텍처/경계/중복/단순화). 결과는 ruleId "ARCHITECTURE"로 태깅.
 * 레인은 *병렬* 실행한다(벽시계 시간 = 합 → 최댓값). 각 reviewWithAgentCli는 고유 brief
 * 파일을 쓰므로 동시 실행이 안전하다.
 */
async function runAgentLanes(
  packet: unknown,
  lanes: Array<"regression" | "architecture">,
  agentOptions?: AgentCliOptions
): Promise<ProviderResult> {
  const settled = await Promise.all(
    lanes.map(async (lane) => {
      const systemPrompt = lane === "architecture" ? ARCH_SYSTEM_PROMPT : undefined;
      const t0 = Date.now();
      const res = await reviewWithAgentCli(packet, { ...agentOptions, systemPrompt });
      const secs = Math.round((Date.now() - t0) / 1000);
      const outcome = res.skipped ? `skipped(${res.skippedReason})` : `${res.findings.length} findings`;
      console.error(`[impact-review] lane ${lane}: ${outcome} in ${secs}s`);
      const tagged =
        lane === "architecture"
          ? res.findings.map((f) => ({
              ...f,
              ruleIds: [...new Set(["ARCHITECTURE", ...f.ruleIds])],
            }))
          : res.findings;
      return { res, tagged };
    })
  );
  const results = settled.map((s) => s.res);
  const allFindings: ModelFinding[] = settled.flatMap((s) => s.tagged);
  const ran = results.find((r) => !r.skipped);
  return {
    provider: results[0]?.provider ?? "opencode",
    model: ran?.model ?? results[0]?.model ?? null,
    skipped: !ran,
    skippedReason: ran ? undefined : results[0]?.skippedReason,
    findings: allFindings,
  };
}
