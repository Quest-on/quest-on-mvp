#!/usr/bin/env node
/**
 * 시각·기능 검증용 dev 서버.
 *
 * `AGENTS.md` 는 검증 명령에 `.env.local` 을 로드하지 말라고 한다. 그런데
 * `next dev` 는 무조건 `.env.local` 을 읽는다. 내가 인라인으로 넘긴 값은
 * 이기지만(Next 는 기존 `process.env` 를 덮지 않는다), **내가 설정하지 않은
 * 키는 그대로 주입된다.**
 *
 * 실제로 겪었다 — 검증 서버 로그에 `- Environments: .env.local` 이 찍히고
 * `VERCEL_OIDC_TOKEN`(1193자) 이 주입됐다. 그 값은 배포 자격증명이다.
 *
 * 기억으로 막을 일이 아니다. 이 스크립트는 `.env.local` 을 잠깐 옆으로
 * 치우고 서버를 띄운 뒤, 종료할 때 반드시 되돌린다.
 *
 * 사용: node scripts/dev-verify.mjs [-- next 인자...]
 *   PORT 로 포트 지정. 기본 3100 (일반 dev 3000 과 겹치지 않게).
 */
import { spawn } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const ENV_LOCAL = resolve(process.cwd(), ".env.local");
const PARKED = resolve(process.cwd(), ".env.local.verify-parked");

let parked = false;

function park() {
  if (!existsSync(ENV_LOCAL)) return;
  if (existsSync(PARKED)) {
    // 이전 실행이 비정상 종료했다. 덮어쓰면 원본을 잃는다.
    throw new Error(
      `${PARKED} 가 이미 있다. 이전 실행이 비정상 종료했을 수 있다. 손으로 확인하고 되돌린 뒤 다시 실행하라.`
    );
  }
  renameSync(ENV_LOCAL, PARKED);
  parked = true;
  process.stdout.write(".env.local 을 잠시 치웠다 (검증 격리)\n");
}

function restore() {
  if (!parked) return;
  parked = false;
  if (existsSync(PARKED)) {
    renameSync(PARKED, ENV_LOCAL);
    process.stdout.write("\n.env.local 을 되돌렸다\n");
  }
}

// 어떤 경로로 죽어도 되돌린다.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sig, () => {
    restore();
    process.exit(130);
  });
}
process.on("exit", restore);
process.on("uncaughtException", (err) => {
  restore();
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});

park();

const port = process.env.PORT ?? "3100";
const extra = process.argv.slice(2);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", port, ...extra],
  { stdio: "inherit", env: process.env }
);

child.on("exit", (code, signal) => {
  restore();
  process.exit(signal ? 130 : (code ?? 0));
});
