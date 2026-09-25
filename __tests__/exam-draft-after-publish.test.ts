import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftToSave } from "@/hooks/useExamDraftAutoSave";

/**
 * 이슈 #498 — 출제를 끝낸 시험이 "저장되지 않은 이전 작업" 으로 복원을 권했다.
 *
 * 출제에 성공하면 clearDraft() 로 초안을 지운다. 그런데 성공 다이얼로그가 떠 있는
 * 동안 폼 상태는 그대로라, 5초 주기 자동 저장이 방금 출제한 시험을 다시 초안으로
 * 써 넣었다. staging 실측: 3JSN15 출제·응시·채점까지 끝난 뒤 /instructor/new 에서
 * "제목: 회귀 QA 2026-09-25 (#438) / 저장 시각 오후 02:16" 복원 다이얼로그.
 */

const filled = {
  title: "회귀 QA",
  duration: 30,
  code: "3JSN15",
  questions: [{ id: "q1", text: "스택과 큐" }] as never[],
  chatWeight: null,
  scoreWeights: null,
  adjustHistory: new Map(),
};
const now = new Date("2026-09-25T05:16:30Z");

describe("출제로 확정된 뒤에는 자동 저장하지 않는다 (#498)", () => {
  it("작성 중이면 저장한다", () => {
    const draft = draftToSave(filled, { committed: false }, now);
    expect(draft?.title).toBe("회귀 QA");
    expect(draft?.savedAt).toBe(now.toISOString());
  });

  it("출제로 확정됐으면 폼이 채워져 있어도 저장하지 않는다", () => {
    expect(draftToSave(filled, { committed: true }, now)).toBeNull();
  });

  it("저장할 내용이 없으면 저장하지 않는다 (기존 동작)", () => {
    expect(
      draftToSave({ ...filled, title: " ", questions: [] }, { committed: false }, now),
    ).toBeNull();
  });

  it("clearDraft 가 확정을 걸고, 자동 저장이 그 확정을 본다", () => {
    const src = readFileSync(join(process.cwd(), "hooks/useExamDraftAutoSave.ts"), "utf8");
    const clearBody = src.slice(src.indexOf("const clearDraft"), src.indexOf("return {", src.indexOf("const clearDraft")));
    expect(clearBody).toMatch(/committedRef\.current = true/);
    const saveBody = src.slice(src.indexOf("const saveDraft"), src.indexOf("// Auto-save interval"));
    expect(saveBody).toMatch(/\{ committed: committedRef\.current \}/);
  });

  it("새로 시작(discardDraft)은 편집을 이어 가므로 확정을 걸지 않는다", () => {
    const src = readFileSync(join(process.cwd(), "hooks/useExamDraftAutoSave.ts"), "utf8");
    const discardBody = src.slice(src.indexOf("const discardDraft"), src.indexOf("const clearDraft"));
    expect(discardBody).not.toMatch(/committedRef/);
  });
});
