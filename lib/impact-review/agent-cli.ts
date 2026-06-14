import { spawn } from "node:child_process";
import type { ProviderResult } from "./types";
import { SYSTEM_PROMPT, parseModelFindings } from "./model";
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
  /** 테스트 주입용. 없으면 실제 spawn. */
  runner?: AgentRunner;
}

export function buildAgentPrompt(promptInput: unknown): string {
  return (
    `${SYSTEM_PROMPT}\n\n` +
    `REVIEW PACKET (JSON):\n${JSON.stringify(promptInput)}\n\n` +
    `Return ONLY the JSON object described above. No prose, no code fences.`
  );
}

export async function reviewWithAgentCli(
  promptInput: unknown,
  opts: AgentCliOptions = {}
): Promise<ProviderResult> {
  const command = opts.command || process.env.IMPACT_REVIEW_AGENT_CMD || "opencode";
  const model = opts.model || process.env.IMPACT_REVIEW_AGENT_MODEL || null;
  const prompt = buildAgentPrompt(promptInput);
  const runner =
    opts.runner ??
    defaultSpawnRunner(command, opts.subcommand ?? ["run"], model, opts.timeoutMs ?? 120_000);

  try {
    const { stdout, code } = await runner(prompt);
    if (code !== 0) {
      return skipped(command, model, `agent exited ${code}`);
    }
    const findings = parseModelFindings(stdout);
    return { provider: command, model, skipped: false, findings };
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
