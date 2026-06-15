import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * impact-review brief 아티팩트 누수 가드.
 *
 * 실제 사고: impact-review AI 레인이 PR #47에서 자기 자신의 버그를 잡았다 —
 * agent-cli가 `.impact-review-brief.<pid>.json`을 레포 루트에 쓰고 finally에서
 * best-effort로만 지운다. 프로세스가 SIGKILL/OOM/러너 eviction으로 죽으면 파일이
 * 워킹트리에 남고, .gitignore에 없으면 실수로 커밋될 수 있다.
 *
 * 봇이 찾은 실재 리스크라 확률적 AI 리뷰가 아니라 *결정적 테스트*로 박는다:
 *   (1) agent-cli가 쓰는 파일명 모양과
 *   (2) .gitignore의 무시 패턴이 항상 일치해야 한다.
 */
const ROOT = path.resolve(__dirname, "..");

describe("impact-review brief artifact never leaks into git (real incident PR #47)", () => {
  it("agent-cli writes the brief as .impact-review-brief.<pid>.json at repo root", () => {
    const src = readFileSync(path.join(ROOT, "lib/impact-review/agent-cli.ts"), "utf8");
    // `.impact-review-brief.${process.pid}.json` 형태를 유지하는지 (글롭 커버리지 전제).
    expect(src).toMatch(/`\.impact-review-brief\.\$\{process\.pid\}\.json`/);
  });

  it(".gitignore ignores the brief artifact pattern", () => {
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    const hasPattern = ignore
      .split("\n")
      .map((l) => l.trim())
      .includes(".impact-review-brief.*.json");
    expect(hasPattern, ".gitignore must contain `.impact-review-brief.*.json`").toBe(true);
  });
});
