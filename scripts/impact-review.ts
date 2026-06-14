#!/usr/bin/env tsx
/**
 * Impact-review CLI. CI(GitHub Action)와 로컬 검수 패스가 공유하는 thin runner.
 *
 * 로컬:
 *   npm run impact-review -- --range origin/main...HEAD --threshold 80 --no-post
 *   npm run impact-review -- --diff-file <fixture.diff> --provider none --ci
 * CI:
 *   npm run impact-review -- --event github --post-github-comment --ci
 *
 * read-only: Supabase/DB/.env.local 접근 없음.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { runReview } from "../lib/impact-review/run";
import { formatComment, formatJson, formatSummary } from "../lib/impact-review/format";
import {
  createGitHubClientFromEnv,
  upsertPrComment,
  upsertPushComment,
} from "../lib/impact-review/github-comments";
import { redactForLog } from "../lib/impact-review/redact";

interface Args {
  range?: string;
  diffFile?: string;
  provider?: "none" | "auto" | "agent-cli" | "opencode";
  threshold: number;
  ci: boolean;
  event?: "github";
  post: boolean;
  json?: string;
  markdown?: string;
  failOnAiCritical: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { threshold: 80, ci: false, post: false, failOnAiCritical: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--range") a.range = next();
    else if (k === "--diff-file") a.diffFile = next();
    else if (k === "--provider") a.provider = next() as Args["provider"];
    else if (k === "--threshold") a.threshold = Number(next());
    else if (k === "--ci") a.ci = true;
    else if (k === "--event") a.event = next() as Args["event"];
    else if (k === "--post-github-comment") a.post = true;
    else if (k === "--no-post") a.post = false;
    else if (k === "--json") a.json = next();
    else if (k === "--markdown") a.markdown = next();
    else if (k === "--fail-on-ai-critical") a.failOnAiCritical = true;
  }
  if (a.threshold === undefined || Number.isNaN(a.threshold)) a.threshold = 80;
  return a;
}

interface GithubEvent {
  eventName: string;
  range: string | null;
  prNumber?: number;
  sha?: string;
  commentKind: "pr" | "push" | null;
}

function resolveGithubEvent(): GithubEvent {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let payload: Record<string, unknown> = {};
  if (eventPath) {
    try {
      payload = JSON.parse(readFileSync(eventPath, "utf8"));
    } catch {
      /* ignore */
    }
  }
  if (eventName === "pull_request") {
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    const base = (pr?.base as Record<string, unknown>)?.sha as string | undefined;
    const head = (pr?.head as Record<string, unknown>)?.sha as string | undefined;
    return {
      eventName,
      range: base && head ? `${base}...${head}` : null,
      prNumber: pr?.number as number | undefined,
      commentKind: "pr",
    };
  }
  if (eventName === "push") {
    const before = payload.before as string | undefined;
    const after = (payload.after as string | undefined) || process.env.GITHUB_SHA;
    return {
      eventName,
      range: before && after ? `${before}...${after}` : null,
      sha: after,
      commentKind: "push",
    };
  }
  return { eventName, range: null, commentKind: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let range = args.range ?? null;
  let gh: GithubEvent | null = null;
  if (args.event === "github") {
    gh = resolveGithubEvent();
    range = range ?? gh.range;
  }

  const diffText = args.diffFile ? readFileSync(args.diffFile, "utf8") : undefined;

  const result = await runReview({
    diffText,
    range,
    confidenceThreshold: args.threshold,
    provider: args.provider,
    scanBlastRadius: !args.diffFile, // fixture 모드에선 repo 스캔 안 함.
    policy: { failOnDeterministicCritical: true, failOnAiCritical: args.failOnAiCritical },
  });

  const commentKind = gh?.commentKind ?? "pr";
  const markdown = formatComment(result, commentKind);
  console.log(formatSummary(result));
  console.log(markdown);

  if (args.json) writeFileSafe(args.json, formatJson(result));
  if (args.markdown) writeFileSafe(args.markdown, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSafe(process.env.GITHUB_STEP_SUMMARY, `${formatSummary(result)}\n\n${markdown}\n`, true);
  }

  if (args.post && gh) {
    try {
      const client = createGitHubClientFromEnv();
      if (!client) {
        console.error("[impact-review] no GITHUB_TOKEN/REPOSITORY — skipping comment post");
      } else if (gh.commentKind === "pr" && gh.prNumber) {
        const r = await upsertPrComment(client, gh.prNumber, markdown);
        console.log(`[impact-review] PR comment ${r.action}`);
      } else if (gh.commentKind === "push" && gh.sha) {
        const r = await upsertPushComment(client, gh.sha, markdown);
        console.log(`[impact-review] commit comment ${r.action}`);
      }
    } catch (err) {
      console.error(`[impact-review] comment post failed: ${redactForLog(err)}`);
    }
  }

  if (args.ci && result.shouldFail) {
    console.error("[impact-review] deterministic Critical findings — failing the check.");
    process.exit(1);
  }
}

function writeFileSafe(path: string, content: string, append = false) {
  if (append) appendFileSync(path, content);
  else writeFileSync(path, content);
}

main().catch((err) => {
  console.error(`[impact-review] fatal: ${redactForLog(err)}`);
  process.exit(1);
});
