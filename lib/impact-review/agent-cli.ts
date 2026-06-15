import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { ProviderResult } from "./types";
import { parseModelFindings } from "./model";
import { redactForLog } from "./redact";

/**
 * 화이트리스트 코딩 에이전트 CLI(예: opencode)를 헤드리스로 돌려 모델 2차 리뷰를 수행한다.
 *
 * 왜 raw API가 아니라 CLI인가:
 *  - Kimi/GLM "for coding" 구독 키는 raw API 호출(curl/SDK/CI 스크립트)을 거부하고
 *    화이트리스트 코딩 에이전트(opencode/claude/cline/...)에서만 동작한다.
 *  - 따라서 구독 키를 합법적으로 쓰려면 *진짜 화이트리스트 CLI*를 클라이언트로 써야 한다.
 *    (User-Agent 위조는 ToS 위반 → 금지.) coding 엔드포인트/키는 CLI 설정(opencode.json + env)에
 *    두고, 엔진은 그 CLI를 실행만 한다.
 */

export interface AgentCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type AgentRunner = (prompt: string) => Promise<AgentCliResult>;

export interface AgentCliOptions {
  /** 실행 바이너리 (기본 opencode 또는 IMPACT_REVIEW_AGENT_CMD). */
  command?: string;
  /** 서브커맨드 (기본 ["run"]). */
  subcommand?: string[];
  /** 모델 id (예: "zai-coding/glm-4.7"). 없으면 CLI 기본/설정에 위임. */
  model?: string;
  timeoutMs?: number;
  /** lane별 system 프롬프트 override (없으면 회귀(regression) 프롬프트). */
  systemPrompt?: string;
  /** 테스트 주입용. 없으면 실제 spawn. */
  runner?: AgentRunner;
}

/**
 * 에이전트 탐색 프롬프트. diff를 통째로 stuffing하지 않고, 변경 요약(brief)을 주고
 * opencode가 레포를 *직접 읽어가며* blast radius/회귀 위험을 조사하게 한다.
 */
const AGENT_SYSTEM_PROMPT =
  "You are a change-impact code reviewer operating INSIDE this repository's working tree. " +
  "You can read any file with your tools. Investigate regression and cross-file impact of the change " +
  "described below: read the changed files, their direct importers/callers (see blast_radius), mirror siblings, " +
  "and directly-affected tests — only what THIS change actually needs; do NOT read unrelated files. " +
  "Also apply the convention checks documented in .github/impact-review/rules.md (read it): " +
  "qIdx deep-link/array-position assumptions; MCQ/OX scoring must use raw answers + correctOptionIndex (not ai_summary/grade rows); " +
  "score_weights kept in sync with question types; and — ONLY if this change touches DB queries, tables, columns, or migrations — assess DB/migration impact by READING the relevant database/NNN_*.sql and prisma/schema.prisma (NEVER a live database). " +
  "Also flag if the impact-review runner/workflow itself adds Supabase/DB/.env access (it must stay read-only). " +
  "Report ONLY net-new risks that the deterministic layer has NOT already reported " +
  "(do not repeat entries in deterministic_findings). Do NOT modify any file — read-only review. " +
  "Do NOT report style-only issues. " +
  "Work efficiently and finish within a few minutes: prefer targeted reads over exhaustive scanning, and once you have enough evidence STOP and emit the JSON. " +
  "Write every \"message\" and \"evidence\" string in natural Korean (한국어); keep code identifiers, paths, and ruleIds verbatim. " +
  'When done, output ONLY a JSON object on its own line: {"findings":[{"severity":"Critical|Warning|Suggestion",' +
  '"confidence":0-100,"message":string,"location":{"path":string,"line":number?},"ruleIds":string[]?,"evidence":string[]?}]}';

/**
 * 상위(아키텍처/방향성) 리뷰 프롬프트. 국소 회귀가 아니라 *큰 그림*을 본다:
 * 기존 아키텍처/컨벤션과의 정합성, 레이어/도메인 경계 위반, 기존 서브시스템 중복,
 * 더 단순/정합적인 접근 여부, 과도한 범위 등.
 */
export const ARCH_SYSTEM_PROMPT =
  "You are a senior software ARCHITECT reviewing a change INSIDE this repository's working tree. " +
  "First read the project's architecture ground truth: ARCHITECTURE.md, the root and nested CLAUDE.md, " +
  "AGENTS.md, and docs/ (e.g. docs/API_CONVENTIONS.md, docs/SECURITY.md). Then read the changed files and " +
  "their context. Assess the change at the BIG-PICTURE level, not line nits: does it fit the intended " +
  "architecture and conventions? Does it violate layering or domain boundaries? Does it duplicate an existing " +
  "subsystem/utility instead of reusing it? Is there a materially simpler or more aligned approach? Is the scope " +
  "creeping? Use severity Critical only for genuine architectural violations; otherwise Warning/Suggestion for " +
  "design-direction feedback. Do NOT modify files — read-only. Do NOT report style-only nits. " +
  "Write every \"message\" and \"evidence\" string in natural Korean (한국어); keep code identifiers, paths, and ruleIds verbatim. " +
  'When done, output ONLY a JSON object on its own line: {"findings":[{"severity":"Critical|Warning|Suggestion",' +
  '"confidence":0-100,"message":string,"location":{"path":string,"line":number?},"ruleIds":string[]?,"evidence":string[]?}]}';

export function buildAgentPrompt(promptInput: unknown, systemPrompt = AGENT_SYSTEM_PROMPT): string {
  return (
    `${systemPrompt}\n\n` +
    `CHANGE BRIEF (JSON):\n${JSON.stringify(promptInput)}\n\n` +
    `Explore the repository as needed, then return ONLY the JSON object. No prose, no code fences.`
  );
}

export function buildAgentFilePrompt(
  briefRelPath: string,
  systemPrompt = AGENT_SYSTEM_PROMPT
): string {
  return (
    `${systemPrompt}\n\n` +
    `The CHANGE BRIEF (JSON) is in this repository at \`${briefRelPath}\`. ` +
    `Read that file first, then explore the repository (architecture docs, changed files, importers in ` +
    `blast_radius, mirror siblings, shared modules, tests) as needed, and return ONLY the JSON object. No prose, no code fences.`
  );
}

/** 동시 레인 실행 시 brief 파일명 충돌 방지용 프로세스-내 카운터. */
let briefSeq = 0;

export async function reviewWithAgentCli(
  promptInput: unknown,
  opts: AgentCliOptions = {}
): Promise<ProviderResult> {
  const command = opts.command || process.env.IMPACT_REVIEW_AGENT_CMD || "opencode";
  const model = opts.model || process.env.IMPACT_REVIEW_AGENT_MODEL || null;
  const systemPrompt = opts.systemPrompt;

  // 테스트(주입 runner)에서는 brief를 inline 프롬프트로(argv 한도 신경 안 씀).
  if (opts.runner) {
    return runAndParse(opts.runner, buildAgentPrompt(promptInput, systemPrompt), command, model);
  }

  // 실제 실행: brief를 레포 임시파일로 쓰고, opencode에는 그 파일을 읽으라는 *작은* 프롬프트만 전달.
  // (Linux argv 단일 인자 한도 128KB(MAX_ARG_STRLEN) 회피 — 큰 변경에서도 안전.)
  const briefRel = `.impact-review-brief.${process.pid}-${briefSeq++}.json`;
  const briefAbs = path.join(process.cwd(), briefRel);
  const runner = defaultSpawnRunner(
    command,
    opts.subcommand ?? ["run"],
    model,
    opts.timeoutMs ?? (Number(process.env.IMPACT_REVIEW_AGENT_TIMEOUT_MS) || 600_000)
  );
  try {
    writeFileSync(briefAbs, JSON.stringify(promptInput));
    return await runAndParse(runner, buildAgentFilePrompt(briefRel, systemPrompt), command, model);
  } catch (err) {
    console.error(`[impact-review] agent-cli (${command}) failed: ${redactForLog(err)}`);
    return skipped(command, model, "agent-cli error");
  } finally {
    try {
      unlinkSync(briefAbs);
    } catch {
      /* best-effort cleanup */
    }
  }
}

async function runAndParse(
  runner: AgentRunner,
  prompt: string,
  command: string,
  model: string | null
): Promise<ProviderResult> {
  try {
    const { stdout, code } = await runner(prompt);
    if (code !== 0) return skipped(command, model, `agent exited ${code}`);
    return { provider: command, model, skipped: false, findings: parseModelFindings(stdout) };
  } catch (err) {
    console.error(`[impact-review] agent-cli (${command}) failed: ${redactForLog(err)}`);
    return skipped(command, model, "agent-cli error");
  }
}

function skipped(provider: string, model: string | null, reason: string): ProviderResult {
  return { provider, model, skipped: true, skippedReason: reason, findings: [] };
}

function defaultSpawnRunner(
  command: string,
  subcommand: string[],
  model: string | null,
  timeoutMs: number
): AgentRunner {
  return (prompt: string) =>
    new Promise<AgentCliResult>((resolve) => {
      const args = [...subcommand];
      if (model) args.push("--model", model);
      args.push(prompt);
      const child = spawn(command, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ stdout, stderr: stderr + "\n[timeout]", code: 124 });
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: stderr + redactForLog(e), code: 127 });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    });
}
