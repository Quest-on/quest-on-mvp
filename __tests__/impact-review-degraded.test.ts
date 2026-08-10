import { describe, expect, it } from "vitest";
import { formatComment } from "@/lib/impact-review/format";
import type { Finding, ProviderResult, ReviewResult } from "@/lib/impact-review/types";

/**
 * 이 봇의 가장 위험한 실패는 "초록의 의미가 조용히 바뀌는 것"이다.
 * 에이전트 레인이 죽어도 job 은 결정적 검사만으로 초록이 되는데, 그때 코멘트가
 * 평소와 똑같이 "이슈 없어요" 라고 하면 읽는 쪽은 AI 검토를 통과했다고 믿는다.
 * 실제로 2026-08-09 부터 두 레인이 exit 124 로 죽는 동안 이 코멘트가 계속 깨끗해 보였다.
 */

const base = (provider: ProviderResult, findings: Finding[] = []): ReviewResult =>
  ({
    findings,
    deterministicFindings: findings.filter((f) => f.source === "deterministic"),
    provider,
    changedFiles: [{ path: "lib/foo.ts", status: "M" }],
    blastRadius: [],
    range: "aaa...bbb",
    shouldFail: false,
  }) as unknown as ReviewResult;

const okProvider: ProviderResult = {
  provider: "opencode",
  model: "zai-coding/glm-5.2",
  skipped: false,
  findings: [],
} as unknown as ProviderResult;

const deadProvider: ProviderResult = {
  provider: "opencode",
  model: undefined,
  skipped: true,
  skippedReason: "agent exited 124",
  findings: [],
} as unknown as ProviderResult;

const critical: Finding = {
  severity: "Critical",
  confidence: 100,
  message: "거울 쌍이 어긋났다",
  ruleIds: ["MIRROR-EXAM-AUTHORING-FORMS"],
  source: "deterministic",
} as unknown as Finding;

describe("AI 레인이 죽었을 때 코멘트가 그 사실을 숨기지 않는다", () => {
  it("레인이 죽고 발견도 없으면 '이슈 없어요' 라고 말하지 않는다", () => {
    const out = formatComment(base(deadProvider), "pr");

    expect(out).toContain("AI 리뷰가 실행되지 않았습니다");
    expect(out).toContain("agent exited 124");
    expect(out).toContain("AI 리뷰는 돌지 않았습니다");
    // 정상 리뷰와 같은 인사를 쓰면 초록의 의미가 뒤바뀐다.
    expect(out).not.toContain("🌸 차단할 영향/회귀 이슈가 없어요!");
  });

  it("레인이 죽었지만 결정적 발견이 있을 때도 경고가 함께 보인다", () => {
    const out = formatComment(base(deadProvider, [critical]), "pr");

    expect(out).toContain("AI 리뷰가 실행되지 않았습니다");
    expect(out).toContain("거울 쌍이 어긋났다");
  });

  it("레인이 정상이면 경고를 붙이지 않는다", () => {
    const out = formatComment(base(okProvider), "pr");

    expect(out).not.toContain("AI 리뷰가 실행되지 않았습니다");
    expect(out).toContain("🌸 차단할 영향/회귀 이슈가 없어요!");
    expect(out).toContain("glm-5.2");
  });

  it("push 이벤트에서도 같은 경고가 나온다", () => {
    const out = formatComment(base(deadProvider), "push");

    expect(out).toContain("AI 리뷰가 실행되지 않았습니다");
  });
});
