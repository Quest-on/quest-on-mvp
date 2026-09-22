import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync("app/(app)/onboarding/page.tsx", "utf8");
const sourceWithoutComments = onboardingSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("consent onboarding UI structure", () => {
  it("renders exactly two required consent checkboxes without preselection", () => {
    expect((onboardingSource.match(/<Checkbox\b/g) ?? []).length).toBe(2);
    expect(onboardingSource).not.toContain("defaultChecked");
    expect(onboardingSource).toContain("useState(false)");
  });

  it("does not include an all-consent button", () => {
    expect(sourceWithoutComments).not.toMatch(/전체\s*동의|all\s*consent/i);
  });

  it("posts only the required consent decisions", () => {
    // GET(상태 조회)과 POST(기록)가 같은 경로를 쓰므로 method 로 좁힌다.
    const consentPost =
      onboardingSource.match(
        /fetch\("\/api\/consents\/onboarding",\s*\{[\s\S]*?\}\);/,
      )?.[0] ?? "";
    expect(consentPost).toContain('method: "POST"');
    // 보내는 키는 정확히 둘이다. 서버가 소유한 값(user_id·policy_version 등)을
    // 클라이언트가 끼워 넣지 못하게 하는 것이 이 테스트의 요지다.
    //
    // 예전에는 `JSON.stringify({ ageOver14: true, terms: true })` 를 통째로
    // 고정했는데, 그러면 **리터럴로 보내는 것까지 함께 고정**된다. 동의 기록이
    // 사용자 입력과 분리되는 것을 테스트가 지켜주던 셈이었다(이슈 #445).
    // 값이 아니라 키 집합을 본다.
    const payload = consentPost.match(/JSON\.stringify\(\{([^}]*)\}\)/)?.[1] ?? "";
    const keys = payload
      .split(",")
      .map((p) => p.split(":")[0].trim())
      .filter(Boolean);
    expect(keys.sort()).toEqual(["ageOver14", "terms"]);
    expect(consentPost).not.toMatch(/user_id|controller_type|policy_version/);
  });

  it("gates the consent UI and the POST on the server-reported collecting flag", () => {
    // off/shadow 로 배포된 단계에서 UI 가 앞서 나가 동의를 받아버리면
    // 롤아웃을 되돌려도 이미 기록된 행이 남는다. 서버가 정한 값을 따라야 한다.
    expect(onboardingSource).toContain("consentCollecting");
    // 체크박스 fieldset 이 조건부로만 렌더된다.
    expect(onboardingSource).toMatch(/consentCollecting === true &&\s*\(\s*<fieldset/);
    // 수집이 켜졌을 때만 POST 한다.
    expect(onboardingSource).toMatch(/if \(consentCollecting === true\) \{/);
    // 아직 모르는 상태(null)에서는 제출을 막는다.
    expect(onboardingSource).toContain("consentCollecting === null ||");
  });

  it("off/shadow 에서 프로필만으로 온보딩을 끝낼 수 있다", () => {
    // disabled prop 만 고치고 submit 핸들러의 검사를 그대로 두면,
    // 체크박스가 렌더되지도 않는 off/shadow 에서 아무도 온보딩을
    // 끝내지 못한다. 핸들러도 collecting 을 봐야 한다.
    expect(onboardingSource).toMatch(
      /if \(consentCollecting && \(!ageOver14 \|\| !terms\)\) \{/,
    );
    // 수집 여부를 모르는 동안에는 판단을 미룬다.
    expect(onboardingSource).toMatch(/if \(consentCollecting === null\) \{/);
    // 무조건 거부하는 옛 검사가 남아 있으면 안 된다.
    expect(onboardingSource).not.toMatch(/^\s*if \(!ageOver14 \|\| !terms\) \{/m);
  });

  it("has no user-visible hardcoded Korean text", () => {
    expect(sourceWithoutComments).not.toMatch(/[\uac00-\ud7a3]/);
  });

  it("keeps consent UI out of sign-up and the preflight disclosure visible", () => {
    expect(readFileSync("components/auth/CustomSignUp.tsx", "utf8")).not.toMatch(/consent|동의/i);
    expect(readFileSync("components/exam/PreflightModal.tsx", "utf8")).toContain(
      't("preflight.aiDisclosureVisible")',
    );
  });
});
