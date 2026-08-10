/**
 * `PreflightModal` 의 AI 고지 게이팅 배선 회귀 (PR #90 리뷰 P2).
 *
 * 왜 소스 검사인가: 이 저장소에는 React 렌더 테스트 인프라가 없다
 * (`@testing-library/*`, `jsdom` 미설치). 모달은 next-intl 훅과 Radix Dialog 에
 * 묶여 있어 `react-dom/server` 만으로도 프로바이더 없이는 렌더되지 않는다.
 * 그래서 렌더 결과 대신 **게이팅이 붙어 있는지**를 고정한다 — 리뷰가 지적한
 * 회귀(고지 블록이 무조건 렌더되는 상태)는 이 검사로 잡힌다.
 *
 * 한계를 분명히 한다: 이 테스트는 "조건이 걸려 있다"를 증명하지, "렌더 결과가
 * 비어 있다"를 증명하지 않는다. 후자는 브라우저 E2E 의 몫이다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync("components/exam/PreflightModal.tsx", "utf8");

/** 지정한 게이트 블록 안에 특정 키가 있는지. */
function isGated(
  translationKey: string,
  text = source,
  gate = "{examHasEssay && ("
): boolean {
  const idx = text.indexOf(translationKey);
  if (idx === -1) return false;
  const before = text.slice(0, idx);
  const lastGate = before.lastIndexOf(gate);
  if (lastGate === -1) return false;
  const gateIndent = text.slice(text.lastIndexOf("\n", lastGate) + 1, lastGate);
  const gateEnd = text.slice(lastGate).search(new RegExp(`\\n${gateIndent}\\)\\}`));
  return gateEnd > idx - lastGate && text.slice(lastGate, lastGate + gateEnd).includes(translationKey);
}

/** AI 고지 3줄은 사람 단위 1회 게이트까지 함께 걸려야 한다 (AC-15). */
const DISCLOSURE_GATE = "{examHasEssay && showAiDisclosure && (";

describe("PreflightModal AI 고지 게이팅", () => {
  it("examHasEssay 를 prop 으로 받는다", () => {
    expect(source).toMatch(/examHasEssay:\s*boolean/);
  });

  it("AI 고지 3줄이 examHasEssay + showAiDisclosure 게이트 안에 있다", () => {
    for (const key of [
      "preflight.aiDisclosureAllowed",
      "preflight.aiDisclosureGraded",
      "preflight.aiDisclosureVisible",
    ]) {
      expect(
        isGated(key, source, DISCLOSURE_GATE),
        `${key} 가 게이팅되지 않았다`
      ).toBe(true);
    }
  });

  it("showAiDisclosure 는 옵셔널이고 기본값이 '노출'이다 (AC-15)", () => {
    // 기본값을 false 로 두면 prop 을 안 넘긴 호출부에서 고지가 조용히 사라진다.
    // 중복 노출은 눈에 보이지만 누락은 아무도 못 알아챈다 — 안전한 쪽 기본값.
    expect(source).toMatch(/showAiDisclosure\?:\s*boolean/);
    expect(source).toMatch(/showAiDisclosure = true/);
  });

  it("multiline 번역 식이 바깥 게이트를 닫지 않는다", () => {
    const nestedSource = `
          {examHasEssay && (
            <div>
              {t(
                "preflight.aiDisclosureAllowed"
              )}
              {t("preflight.aiDisclosureVisible")}
            </div>
          )}`;

    expect(isGated("preflight.aiDisclosureVisible", nestedSource)).toBe(true);
  });

  it("AI 로그 동의 체크박스와 수락 조건도 함께 게이팅된다", () => {
    // 체크박스만 숨기고 조건을 안 고치면 객관식 시험에서 시작 버튼이 영원히 비활성이 된다.
    expect(source).toMatch(/const canAccept = examHasEssay/);
    expect(source).toMatch(
      /disabled=\{examHasEssay \? \(!rulesAccepted \|\| !aiLogAccepted\) : !rulesAccepted\}/
    );
    expect(isGated("ai-log")).toBe(true);
  });

  it("고지 블록이 무조건 렌더되는 형태로 되돌아가지 않는다", () => {
    // 회귀 형태: 게이트 없이 aiDisclosureTitle 을 바로 렌더
    const titleIdx = source.indexOf("preflight.aiDisclosureTitle");
    expect(titleIdx).toBeGreaterThan(-1);
    expect(isGated("preflight.aiDisclosureTitle", source, DISCLOSURE_GATE)).toBe(true);
  });
});
