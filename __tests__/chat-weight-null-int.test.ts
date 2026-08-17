import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * `chat_weight` 의 null 의미가 모든 경로에서 살아남아야 한다. (#227)
 *
 * `null` = "지정 안 함", 숫자 = 사용자 지정이다. `#222` 에서 create 경로를
 * 고쳤지만 복사(`lib/exam-copy.ts`)와 과제(`assignment-handlers.ts`)가
 * `?? 50` 으로 접고 있었다. 그러면 "지정 안 함" 이 복사하는 순간 "50 으로
 * 지정함" 이 된다 — 나중에 기본값을 바꾸면 그 시험만 따라오지 않는다.
 *
 * 채점은 `lib/grading.ts:789` 가 `?? 50` 으로 이미 방어하므로 동작 변화는
 * 없고, 저장 형식의 의미만 보존된다.
 */
describe("chat_weight null 보존", () => {
  it("복사 경로가 null 을 50 으로 접지 않는다", () => {
    const s = read("lib/exam-copy.ts");
    expect(s).toMatch(/chat_weight: source\.chat_weight \?\? null/);
    expect(s).not.toMatch(/chat_weight: source\.chat_weight \?\? 50/);
  });

  it("과제 경로가 null 을 50 으로 접지 않는다", () => {
    const s = read("app/api/supa/handlers/assignment-handlers.ts");
    expect(s).toMatch(/chat_weight: data\.chat_weight \?\? null/);
    expect(s).not.toMatch(/chat_weight: data\.chat_weight \?\? 50/);
  });

  it("시험 생성 경로도 그대로 유지된다", () => {
    // #222 에서 고친 것. 되돌아오면 같은 버그가 재발한다.
    expect(read("app/api/supa/handlers/exam-handlers.ts")).toMatch(
      /chat_weight: data\.chat_weight \?\? null/
    );
  });

  it("채점은 여전히 ?? 50 으로 방어한다", () => {
    // 이게 없으면 null 보존이 곧 0점 채점이 된다. 반대편 증거다.
    expect(read("lib/grading.ts")).toMatch(/exam\.chat_weight \?\? 50/);
  });
});

/**
 * 정수만 받는다.
 *
 * 소수를 허용하면 `Math.round` 없는 경로에서 깨지고 `updateExam` 의 catch 가
 * 그걸 `UPDATE_EXAM_FAILED` 500 으로 뭉갠다. 입력 오류는 400 이어야 한다.
 * UI 는 `step={10}` 이라 못 만들지만 `/api/supa` 는 그대로 열려 있다.
 *
 * 그리고 `lib/prompts.ts` 가 이 값을 프롬프트에 문자열로 박으므로, 저장에
 * 성공하는 소수가 생기면 채점 지시문에 `33.333%` 가 그대로 찍힌다.
 */
describe("chat_weight 정수 강제", () => {
  const SOURCE = read("lib/validations.ts");

  it("모든 chat_weight 스키마에 int() 가 있다", () => {
    const all = SOURCE.match(/chat_weight: z\.number\(\)[^,\n]*/g) ?? [];
    expect(all.length, "스키마를 못 찾았다").toBeGreaterThan(0);
    for (const decl of all) {
      expect(decl, `int() 없는 스키마: ${decl}`).toMatch(/\.int\(\)/);
    }
  });

  it("범위도 함께 유지된다", () => {
    const all = SOURCE.match(/chat_weight: z\.number\(\)[^,\n]*/g) ?? [];
    for (const decl of all) {
      expect(decl).toMatch(/\.min\(0\)/);
      expect(decl).toMatch(/\.max\(100\)/);
      // null 은 계속 허용해야 한다 — "지정 안 함" 이 사라지면 안 된다.
      expect(decl).toMatch(/\.nullable\(\)/);
    }
  });
});

describe("미사용 select 제거", () => {
  it("chat 라우트가 쓰지 않는 컬럼을 읽지 않는다", () => {
    // 읽고 안 쓰면 다음 사람이 여기서 쓰는 줄 알고 잘못된 결론을 낸다.
    expect(read("app/api/chat/route.ts")).not.toMatch(/chat_weight/);
  });
});
