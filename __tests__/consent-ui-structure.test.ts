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
    expect(consentPost).toContain("JSON.stringify({ ageOver14: true, terms: true })");
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
