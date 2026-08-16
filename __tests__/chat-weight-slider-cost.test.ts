import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 대화 비중 슬라이더 — 구조 가드 (행동 검증 아님)
 *
 * 이 파일이 증명하는 것은 딱 하나다: **제거한 클릭 게이트가 되돌아오지 않는 것.**
 * 슬라이더가 실제로 동작하는지, 값이 저장되는지는 여기서 증명할 수 없다 —
 * 이 저장소의 vitest 는 `environment: "node"` 이고 React 렌더 인프라가 없다.
 * 행동 검증은 `e2e/browser/instructor-chat-weight.spec.ts` 가 담당한다.
 *
 * 이 경계를 지키는 이유는 레드팀이 증명했다. 이전 버전은 소스 문자열을 정밀
 * 매칭해서 "동작을 검증한다"고 주장했는데,
 *   - 슬라이더 콜백을 `onChatWeightChange(100)` 으로 망가뜨려도 10개 전부 통과했고
 *   - `className` 위치만 바꾸는 무해한 리팩터링에는 거짓 실패했다.
 * 그래서 동작 주장은 전부 E2E 로 옮기고, 여기서는 식별자와 메시지 키만 본다.
 * 식별자 존재/부재는 문자열 매칭으로도 신뢰할 수 있는 몇 안 되는 사실이다.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), "components", "instructor", "SimpleExamAuthoringForm.tsx"),
  "utf8"
);

/** 주석 제외 — 설명문에 옛 식별자가 나와 자기 자신에 걸린다. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const ko = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "ko", "authoring.json"), "utf8")
) as { simpleExamAuthoringForm: Record<string, string> };

const en = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "en", "authoring.json"), "utf8")
) as { simpleExamAuthoringForm: Record<string, string> };

describe("제거한 클릭 게이트가 되돌아오지 않는다", () => {
  it("펼침 상태가 없다", () => {
    // showAdvancedGrading 이 부활하면 슬라이더 앞에 클릭이 한 번 붙는다.
    expect(CODE).not.toMatch(/showAdvancedGrading/);
  });

  it("사용자 지정 스위치가 없다", () => {
    // 스위치는 chatWeight 의 null/숫자 표현을 사용자에게 그대로 시키던 것이다.
    expect(CODE).not.toMatch(/simple-custom-weight/);
  });

  it("게이트 문구가 ko/en 양쪽에서 제거됐다", () => {
    for (const [name, msgs] of [
      ["ko", ko.simpleExamAuthoringForm],
      ["en", en.simpleExamAuthoringForm],
    ] as const) {
      expect(msgs.buttonAdjust, `${name}.buttonAdjust`).toBeUndefined();
      expect(msgs.switchCustomWeight, `${name}.switchCustomWeight`).toBeUndefined();
    }
  });
});

describe("기본값 복귀 문구가 양쪽 로케일에 있다", () => {
  it("ko/en 에 buttonResetWeight 가 있다", () => {
    // 한쪽만 있으면 다른 로케일에서 키가 그대로 노출된다.
    expect(ko.simpleExamAuthoringForm.buttonResetWeight).toBeTruthy();
    expect(en.simpleExamAuthoringForm.buttonResetWeight).toBeTruthy();
  });

  it("헬퍼 문구가 빈 상태를 안내하지 않는다", () => {
    // 슬라이더가 항상 보이므로 "비워두면" 같은 안내는 불가능한 동작을 시킨다.
    expect(ko.simpleExamAuthoringForm.fieldChatWeightHelper).not.toMatch(/비워두면/);
    expect(en.simpleExamAuthoringForm.fieldChatWeightHelper).not.toMatch(/left blank/i);
  });
});

describe("기본값 판정 기준이 유지된다", () => {
  it("null 을 기본값으로 본다", () => {
    // 숫자 50 과 null 은 다른 상태다. 50 을 기본값으로 취급하면
    // 교수자가 의도적으로 고른 50 이 사라진다.
    expect(CODE).toMatch(/chatWeight !== null/);
    expect(CODE).toMatch(/chatWeight \?\? 50/);
  });
});
