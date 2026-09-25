/**
 * 동의 제출이 **사용자가 체크한 값**을 보내는지 (이슈 #445).
 *
 * 서버가 `z.literal(true)` 로 false 를 거부하는 것은 이미
 * `consent-route.test.ts` 가 덮는다. 여기서 막는 건 그 반대편이다 —
 * 클라이언트가 리터럴 `true` 를 보내면 서버의 거부 경로는 **한 번도 실행되지
 * 않는다.** 통과할 값만 보내니까. 그 상태에서는 두 테스트가 모두 초록인데
 * 실제로 검증되는 것은 아무것도 없다.
 *
 * 동의 기록은 법적 산출물이다. "이 사용자가 만 14세 이상임을 확인했다" 는
 * 기록이 나중에 근거로 쓰인다. 그 값이 사용자 입력과 분리돼 있으면, 기록이
 * 사실인지를 코드가 아니라 "제출 가드가 아직 제자리에 있는가" 로 확인해야 한다.
 *
 * 렌더러가 없는 저장소라 소스를 읽는다. 대신 "리터럴을 안 쓴다"는 부정형이
 * 아니라 **"state 이름을 보낸다"는 긍정형**까지 함께 고정해, 값을 상수로
 * 빼돌리는 우회도 걸리게 한다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ONBOARDING = "app/(app)/onboarding/page.tsx";

function source(): string {
  return readFileSync(join(process.cwd(), ONBOARDING), "utf8");
}

/** 동의 POST 의 body 인자만 뽑는다. */
function consentPostBody(src: string): string {
  const at = src.indexOf('"/api/consents/onboarding"', src.indexOf("POST"));
  const from = src.lastIndexOf("fetch(", at === -1 ? src.length : at);
  expect(from, "동의 POST fetch 를 찾지 못했다").toBeGreaterThan(-1);
  const bodyAt = src.indexOf("body:", from);
  expect(bodyAt, "동의 POST 에 body 가 없다").toBeGreaterThan(-1);
  return src.slice(bodyAt, src.indexOf("\n", src.indexOf("})", bodyAt)));
}

describe("#445 — 동의 제출 값", () => {
  it("체크박스 state 를 그대로 보낸다", () => {
    const body = consentPostBody(source());
    expect(body).toMatch(/\bageOver14\b/);
    expect(body).toMatch(/\bterms\b/);
  });

  it("리터럴 true 를 보내지 않는다", () => {
    const body = consentPostBody(source());
    // `ageOver14: true` / `terms: true` 형태가 되살아나는 걸 막는다.
    expect(body).not.toMatch(/ageOver14\s*:\s*true/);
    expect(body).not.toMatch(/terms\s*:\s*true/);
  });

  it("체크박스 state 가 실제로 존재한다 — 이름만 맞추는 걸 막는다", () => {
    const src = source();
    expect(src).toMatch(/const\s*\[\s*ageOver14\s*,\s*setAgeOver14\s*\]\s*=\s*useState/);
    expect(src).toMatch(/const\s*\[\s*terms\s*,\s*setTerms\s*\]\s*=\s*useState/);
  });

  it("제출 가드는 그대로 둔다 — 서버 거부에만 기대지 않는다", () => {
    // 클라이언트 가드를 없애고 서버 400 에 맡기면 사용자는 이유 없는
    // 실패 화면을 본다. 두 겹 다 필요하다.
    const src = source();
    expect(src).toMatch(/!ageOver14\s*\|\|\s*!terms/);
  });
});
