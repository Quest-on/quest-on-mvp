import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const SETTINGS = read("app/(app)/settings/page.tsx");
// 주석에 든 경로 예시를 코드로 착각하지 않는다.
const CODE = SETTINGS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const ONBOARDING = read("app/(app)/onboarding/page.tsx");

/**
 * 온보딩을 다시 볼 방법이 있어야 한다.
 *
 * 예전에는 진입로가 `!consentQuery.data?.complete` 안에만 있었다. 동의를
 * 끝내는 순간 버튼이 통째로 사라져서, 온보딩을 한 번 지나면 두 번 다시
 * 볼 수 없었다.
 */
describe("온보딩 재진입", () => {
  it("동의를 마쳐도 진입로가 남는다", () => {
    // 진입 링크가 조건부 렌더 블록 안에 갇히면 안 된다. 예전에는
    // {!consentQuery.data?.complete && (...)} 안에만 있어서 동의를 끝내는
    // 순간 사라졌다. 지금은 삼항으로 목적지만 바꾸고 버튼은 항상 남는다.
    const guarded = /\{!consentQuery\.data\?\.complete && \([\s\S]*?\/onboarding/.test(CODE);
    expect(guarded, "온보딩 진입이 동의 미완료 조건 안에 갇혀 있다").toBe(false);
    expect(CODE, "온보딩 진입 링크가 없다").toMatch(/href=\{/);
    expect(CODE).toMatch(/"\/onboarding"/);
  });

  it("다시 보기는 redirect 없이 전체 흐름으로 보낸다", () => {
    // redirect 를 붙이면 프로필 저장 직후 되돌아와서 JTBD 도 데모도 안 거친다.
    // "다시 보기"인데 아무것도 안 보이는 셈이라 목적지를 갈라야 한다.
    expect(CODE, "완료 상태에서도 redirect 를 붙여 되돌린다").toMatch(
      /complete\s*\?\s*"\/onboarding"\s*:\s*"\/onboarding\?redirect=\/settings"/
    );
  });

  it("동의 미완료일 때는 설정으로 되돌아온다", () => {
    // 그 사람은 동의를 고치러 온 것이지 온보딩을 다시 걷고 싶은 게 아니다.
    expect(CODE).toMatch(/"\/onboarding\?redirect=\/settings"/);
  });

  it("같은 곳으로 가는 버튼이 두 개가 되지 않는다", () => {
    // 삼항 하나 안에 두 목적지 = 링크 문자열 2개. 그보다 많으면 버튼이 늘어난 것이다.
    const links = (CODE.match(/"\/onboarding(\?redirect=\/settings)?"/g) || []).length;
    expect(links, ).toBe(2);
  });

  describe("redirect 가 없을 때 전체 흐름이 실제로 이어진다", () => {
    it("교수자는 프로필 다음 intake 로 간다", () => {
      expect(ONBOARDING).toMatch(
        /if \(redirectTarget\)[\s\S]{0,120}else if \(role === "instructor"\)[\s\S]{0,60}setStep\("intake"\)/
      );
    });

    it("데모 생성이 멱등이라 재실행이 안전하다", () => {
      // 다시 보기를 눌러도 데모가 새로 쌓이면 안 된다.
      const route = read("app/api/onboarding/demo/route.ts");
      expect(route, "기존 데모를 먼저 찾지 않는다").toMatch(/const \{ data: existing/);
      expect(route, "기존 데모를 그대로 돌려주지 않는다").toMatch(
        /if \(existing\)[\s\S]{0,200}examId: existing\.id/
      );
    });
  });

  it.each(["ko", "en"])("%s 문구가 있다", (locale) => {
    const msg = JSON.parse(read(`messages/${locale}/auth.json`));
    expect(
      msg.settings?.reopenOnboarding,
      `${locale}/auth.json 의 settings.reopenOnboarding 이 없다`
    ).toBeTruthy();
  });
});
