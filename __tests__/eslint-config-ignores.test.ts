import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `eslint.config.mjs` 의 ignores 계약.
 *
 * `.gjc/` 는 에이전트 런타임 디렉터리다. gitignore 대상이라 CI 는 볼 일이 없지만,
 * 로컬 워킹트리에는 세션 산출물이 쌓인다. flat config 는 `.gitignore` 를 읽지
 * 않으므로 여기서 빼지 않으면 `npm run lint` 가 그 파일들까지 본다.
 *
 * 단순한 노이즈 문제가 아니다. `.cjs` 파일 하나만 생겨도 lint 전체가 죽는다 —
 * `eslint-config-next` 의 react 플러그인 블록이 `**\/*.{js,jsx,mjs,ts,tsx,mts,cts}`
 * 에만 적용되는데 `.cjs` 가 그 목록에 없고, 아래 rules 블록은 files 제한이 없어
 * `react/no-unescaped-entities` 를 모든 파일에 걸기 때문이다. 결과는 lint 실패:
 *
 *   A configuration object specifies rule "react/no-unescaped-entities",
 *   but could not find plugin "react".
 */
describe("eslint.config.mjs ignores", () => {
  const SOURCE = readFileSync(resolve(process.cwd(), "eslint.config.mjs"), "utf8");

  it("에이전트 런타임 디렉터리를 lint 대상에서 뺀다", () => {
    expect(SOURCE).toMatch(/["']\.gjc\/\*\*["']/);
  });

  it("빼는 이유를 적어둔다", () => {
    // 이유 없이 지워지면 같은 함정을 다시 밟는다.
    const ignoresBlock = SOURCE.slice(0, SOURCE.indexOf("...nextCoreWebVitals"));
    expect(ignoresBlock).toMatch(/\.cjs/);
  });

  it("빌드 산출물과 별도 러너가 보는 경로도 계속 뺀다", () => {
    // e2e 와 __tests__ 는 vitest/playwright 가 각자 본다. 여기서 빠지면
    // 두 러너가 같은 파일을 다른 규칙으로 검사한다.
    for (const pattern of [
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "e2e/**",
      "__tests__/**",
    ]) {
      expect(SOURCE, `${pattern} 가 ignores 에서 빠졌다`).toContain(pattern);
    }
  });
});
