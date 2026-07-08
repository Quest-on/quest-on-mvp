import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 채점 라우트 UUID parseInt 문항 매핑 회귀 가드.
 *
 * 버그: grade 라우트가 채팅 메시지를 q_idx 로 저장한 뒤, "backward compatibility" 로
 * question.id 를 `Math.abs(parseInt(String(q.id)) % 2147483647)` 로 정수화해 q_idx 와
 * 매칭하고 messagesByQuestion[questionIndex] 에 messageData 를 한 번 더 push 했다.
 * question.id 는 crypto.randomUUID() 라 UUID 앞자리 숫자가 우연히 다른 q_idx 와 충돌하면
 * (실측 ~27%) A 문항 대화가 B 문항에 복제되어 강사가 엉뚱한 대화를 보고 채점했다.
 *
 * 이 불변식은 데이터 오염을 유발한 적 있어 결정적 테스트로 박는다.
 */
const ROUTE = "app/api/session/[sessionId]/grade/route.ts";

function readRoute(): string {
  return readFileSync(path.join(path.resolve(__dirname, ".."), ROUTE), "utf8");
}

/** 위험한 parseInt 기반 매핑 시그니처가 소스에 남아있는가. */
export function hasUuidParseIntMapping(src: string): boolean {
  const parseIntConvert = /parseInt\s*\(\s*String\s*\(\s*q\.id\s*\)\s*\)\s*%\s*2147483647/.test(src);
  const pollutesByQuestionIndex = /messagesByQuestion\[\s*questionIndex\s*\]/.test(src);
  return parseIntConvert || pollutesByQuestionIndex;
}

describe("grade route — UUID parseInt 문항 매핑 제거 가드", () => {
  it("현재 라우트에는 parseInt 기반 매핑이 없다", () => {
    expect(hasUuidParseIntMapping(readRoute())).toBe(false);
  });

  it("여전히 q_idx(배열 위치)로 메시지를 저장한다", () => {
    const src = readRoute();
    expect(/messagesByQuestion\[qIdx\]/.test(src)).toBe(true);
  });

  it("버그 형태(parseInt 매핑)를 가드가 true 로 잡는다", () => {
    const buggy = `
      const convertedId = Math.abs(parseInt(String(q.id)) % 2147483647);
      messagesByQuestion[questionIndex].push(messageData);
    `;
    expect(hasUuidParseIntMapping(buggy)).toBe(true);
  });
});
