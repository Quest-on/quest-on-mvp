import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * 검증용 dev 서버는 `.env.local` 을 로드하지 않는다.
 *
 * `AGENTS.md` 는 검증 명령에 `.env.local` 을 로드하지 말라고 한다. 그런데
 * `next dev` 는 무조건 그 파일을 읽는다. 인라인으로 넘긴 값은 이기지만
 * (Next 는 기존 `process.env` 를 덮지 않는다), **설정하지 않은 키는 그대로
 * 주입된다.**
 *
 * 실제로 겪었다 — 검증 서버 로그에 `- Environments: .env.local` 이 찍히고
 * `VERCEL_OIDC_TOKEN`(1193자) 이 주입됐다. 배포 자격증명이다.
 *
 * 기억으로 막을 일이 아니라 스크립트로 막는다.
 */
describe("검증 dev 서버 환경 격리", () => {
  const SCRIPT = read("scripts/dev-verify.mjs");

  it("npm script 로 등록돼 있다", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["dev:verify"]).toMatch(/dev-verify\.mjs/);
  });

  it(".env.local 을 치우고 되돌린다", () => {
    expect(SCRIPT).toMatch(/\.env\.local/);
    expect(SCRIPT).toMatch(/renameSync/);
    expect(SCRIPT).toMatch(/function restore/);
  });

  it("어떤 종료 경로에서도 복원한다", () => {
    // 하나라도 빠지면 그 경로로 죽었을 때 .env.local 이 사라진 채 남는다.
    for (const hook of ["SIGINT", "SIGTERM", "exit", "uncaughtException"]) {
      expect(SCRIPT, `${hook} 처리 없음`).toContain(hook);
    }
  });

  it("parked 파일이 있으면 덮어쓰지 않고 멈춘다", () => {
    // 덮어쓰면 원본 .env.local 을 영구히 잃는다.
    const parkFn = SCRIPT.slice(SCRIPT.indexOf("function park"));
    expect(parkFn.slice(0, parkFn.indexOf("\n}"))).toMatch(/이미 있다|throw new Error/);
  });

  it("일반 dev 포트와 겹치지 않는 기본값을 쓴다", () => {
    // 3000 을 쓰면 평소 dev 서버를 죽이거나 포트 충돌로 실패한다.
    expect(SCRIPT).toMatch(/PORT \?\? "3100"/);
  });
});

/**
 * `.env.local` 은 커밋되지 않는다.
 */
describe(".env 커밋 차단", () => {
  it("gitignore 가 .env.local 을 막는다", () => {
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/\.env/);
  });
});
