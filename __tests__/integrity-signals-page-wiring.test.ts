/**
 * 학생별 채점 페이지가 의심 표시 토글을 배선했는지 (이슈 #514).
 *
 * 페이지는 react-query 와 인증 컨텍스트에 묶여 있어 렌더하지 않는다. 대신 소스에서
 * 배선이 사라지는 회귀만 막는다(`onboarding-page-wiring.test.ts` 와 같은 방식).
 * 한계: 실제로 클릭해서 본문이 바뀌는지는 증명하지 못한다. 스테이징 QA 의 몫이다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/(app)/instructor/[examId]/grade/[studentId]/page.tsx", "utf8");
const assignmentPage = readFileSync(
  "app/(app)/instructor/assignment/[assignmentId]/grade/[sessionId]/page.tsx",
  "utf8",
);

describe("채점 페이지 의심 표시 배선", () => {
  it("시험 id 로 설정 훅을 부른다 — 설정은 시험별이다", () => {
    expect(page).toContain('from "@/hooks/useIntegritySignalsPreference"');
    expect(page).toMatch(/useIntegritySignalsPreference\(resolvedParams\.examId\)/);
  });

  it("훅은 첫 조기 return 보다 위에서 부른다 (훅 순서)", () => {
    const hookAt = page.indexOf("useIntegritySignalsPreference(resolvedParams.examId)");
    const firstEarlyReturn = page.indexOf("if (!isLoaded) {");
    expect(hookAt).toBeGreaterThan(-1);
    expect(firstEarlyReturn).toBeGreaterThan(-1);
    expect(hookAt).toBeLessThan(firstEarlyReturn);
  });

  it("FinalAnswerCard 에 showIntegritySignals 를 내리고 토글을 같은 상태에 묶는다", () => {
    const card = page.slice(page.indexOf("<FinalAnswerCard"));
    expect(card.slice(0, 700)).toContain("showIntegritySignals={showIntegritySignals}");

    const toggle = page.slice(page.indexOf("<IntegritySignalsToggle"));
    expect(toggle.slice(0, 200)).toContain("checked={showIntegritySignals}");
    expect(toggle.slice(0, 200)).toContain("onCheckedChange={setShowIntegritySignals}");
  });

  it("토글은 FinalAnswerCard 바로 위에 붙는다 (학생 답안 근처)", () => {
    expect(page.indexOf("<IntegritySignalsToggle")).toBeGreaterThan(page.indexOf("<AIConversationsCard"));
    expect(page.indexOf("<IntegritySignalsToggle")).toBeLessThan(page.indexOf("<FinalAnswerCard"));
  });

  it("과제 채점 페이지는 건드리지 않는다 (plain text 분기라 붙여넣기 표시가 없다)", () => {
    expect(assignmentPage).not.toContain("IntegritySignals");
    expect(assignmentPage).not.toContain("showIntegritySignals");
  });
});
