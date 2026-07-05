import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveChatQIdx } from "@/lib/chat-qidx";

/**
 * /api/chat q_idx 매핑 회귀 가드 (UUID parseInt 문항 오염 클래스).
 *
 * 버그: questionIdx 가 없을 때 questionId(UUID)를 parseInt % 2147483647 로 q_idx 화해,
 * UUID 앞자리 숫자 충돌로 A 문항 대화가 B 문항 q_idx 에 저장될 수 있었다(grade 라우트와
 * 동일 클래스). q_idx 는 검증된 questionIdx 만 사용하도록 바꾼다.
 */
describe("resolveChatQIdx — 검증된 questionIdx만 사용", () => {
  it("유효한 인덱스는 그대로 반환한다", () => {
    expect(resolveChatQIdx(0)).toBe(0);
    expect(resolveChatQIdx(5)).toBe(5);
    expect(resolveChatQIdx("3")).toBe(3);
  });

  it("음수/NaN 은 0 으로 폴백한다", () => {
    expect(resolveChatQIdx(-1)).toBe(0);
    expect(resolveChatQIdx("abc")).toBe(0);
  });

  it("questionIdx 가 없으면 0 (UUID 로부터 q_idx 를 유도하지 않는다)", () => {
    expect(resolveChatQIdx(undefined)).toBe(0);
    expect(resolveChatQIdx(null)).toBe(0);
  });

  it("함수 시그니처상 questionId(UUID)는 q_idx 입력이 아니다", () => {
    // resolveChatQIdx 는 questionIdx 하나만 받는다 — UUID 를 넘길 인자가 없어
    // 과거의 parseInt(UUID) 오염 경로가 구조적으로 불가능하다.
    expect(resolveChatQIdx.length).toBe(1);
  });
});

describe("/api/chat 소스: UUID parseInt 폴백 제거 가드", () => {
  it("route.ts 에 parseInt(questionId) % 2147483647 패턴이 없다", () => {
    const src = readFileSync(
      path.join(path.resolve(__dirname, ".."), "app/api/chat/route.ts"),
      "utf8"
    );
    expect(/parseInt\s*\(\s*String\s*\(\s*questionId\s*\)\s*\)/.test(src)).toBe(false);
    expect(/%\s*2147483647/.test(src)).toBe(false);
  });
});
