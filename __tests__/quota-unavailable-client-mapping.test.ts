/**
 * `QUOTA_CHECK_UNAVAILABLE` 을 **모든 소비 지점**이 알아보는가 (이슈 #326).
 *
 * 서버가 이 코드를 따로 만든 이유는 하나다 — "정원이 찼다(403)" 와 "지금은
 * 판정할 수 없다(503)" 를 학생이 구분하게 하려고. 전자는 다시 시도할 이유가
 * 없고 후자는 잠시 뒤 누르면 된다.
 *
 * 그런데 코드를 새로 만들면 **소비자가 따라오지 않는 일**이 생긴다. 실제로
 * `useExamSession` · `join` 만 매핑됐고 `useAssignmentSession` · `useExamChat`
 * · `useExamSubmission` 은 빠져 있었다. 과제 학생은 "세션 초기화 실패" 를,
 * 제출 화면은 **영문 서버 원문**을 봤다.
 *
 * 그래서 "서버가 이 코드를 내는 곳" 과 "클라이언트가 이 코드를 아는 곳" 을
 * 함께 고정한다. 한쪽만 늘어나면 깨진다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUOTA_UNAVAILABLE_CODE } from "../lib/quota-admission";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 이 코드를 503 으로 내보내는 서버 경로. */
const EMITTERS = [
  "app/api/supa/handlers/session-handlers.ts",
  "app/api/chat/route.ts",
  "app/api/feedback/route.ts",
];

/** 그 응답을 사용자에게 보여주는 클라이언트 경로. */
const CONSUMERS = [
  "hooks/useExamSession.ts",
  "hooks/useAssignmentSession.ts",
  "hooks/useExamChat.ts",
  "hooks/useExamSubmission.ts",
  "app/(app)/join/page.tsx",
];

describe("QUOTA_CHECK_UNAVAILABLE 매핑", () => {
  it("코드 문자열이 한 곳에서 정의된다", () => {
    expect(QUOTA_UNAVAILABLE_CODE).toBe("QUOTA_CHECK_UNAVAILABLE");
  });

  it.each(EMITTERS)("%s 가 이 코드를 낸다", (path) => {
    // 내보내는 쪽이 사라지면 아래 소비자 검사가 의미를 잃는다.
    expect(read(path)).toContain("QUOTA_UNAVAILABLE_CODE");
  });

  it.each(CONSUMERS)("%s 가 이 코드를 알아본다", (path) => {
    const src = read(path);
    const known =
      src.includes("QUOTA_CHECK_UNAVAILABLE") || src.includes("quota_unavailable");
    expect(
      known,
      `${path} 가 QUOTA_CHECK_UNAVAILABLE 을 모른다 — 학생이 일반 오류나 영문 원문을 본다`
    ).toBe(true);
  });

  it("제출 경로가 서버 원문보다 우리 문구를 먼저 쓴다", () => {
    // `data.message` 를 그대로 돌려주면 한국어 화면에 영문이 뜬다.
    //
    // 주석은 걷어낸다 — 이 파일의 주석이 `data.message` 를 설명하므로
    // 원문을 그대로 훑으면 코드가 아니라 설명의 위치를 재게 된다.
    const src = read("hooks/useExamSubmission.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const mapAt = src.indexOf("QUOTA_CHECK_UNAVAILABLE");
    const rawAt = src.indexOf("data.message");
    expect(mapAt).toBeGreaterThan(-1);
    expect(rawAt).toBeGreaterThan(-1);
    expect(mapAt).toBeLessThan(rawAt);
  });
});
