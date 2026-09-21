import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const KO_DIR = resolve(__dirname, "..", "messages", "ko");

/**
 * 해요체 종결.
 *
 * 절 경계까지 본다. 예전에는 `$` 로 문자열 끝만 물어서, 해요체 뒤에 쉼표·이름·
 * 이모지가 붙으면 그냥 통과했다 — 실제로 학생 대시보드 인사말 두 건이 가드를
 * 빠져나가고 있었다. UI 문구는 마침표 없이 끝나는 경우가 많아서 문장 분할에만
 * 기대면 못 본다.
 *
 * 단어 중간의 '어요' 는 여전히 잡지 않는다 — 뒤에 경계 문자가 와야 한다.
 */
const POLITE_CASUAL = /(어요|아요|해요|예요|에요)[.!?]?(?=[\s,)\]"'…]|$)/;

/**
 * 의도적으로 해요체로 둔 것. **사유를 적어야 들어올 수 있다.**
 *
 * 통째로 금지하면 "친근해야 맞는 자리"까지 격식체로 밀려난다. 통째로 허용하면
 * 우연히 섞이는 걸 못 막는다. 그래서 예외를 목록으로 두고, 새 항목은 사유와
 * 함께 사람이 판단해 넣게 한다.
 */
const DELIBERATE: Record<string, string> = {
  "common.json::analytics.heading":
    "동의를 청하는 질문이다. '주시겠습니까?' 는 같은 뜻이지만 부탁을 딱딱하게 만든다.",
  "exam.json::chat.promptsTitle":
    "학생에게 AI 한테 물어보라고 권하는 힌트다. 질문을 망설이지 않게 하는 게 목적이라 친근한 톤이 맞다.",
  "student.json::dashboard.greeting.morning":
    "시간대별 인사말 세 개(아침·오후·저녁)가 모두 이모지와 함께 따뜻한 톤으로 묶여 있다. 사람을 맞이하는 자리라 격식체로 밀면 오히려 튄다.",
  "student.json::dashboard.greeting.evening":
    "같은 인사말 묶음이다. 하루를 마친 학생에게 건네는 말이라 '수고하셨습니다' 보다 이쪽이 맞다.",
};

/** 중첩된 메시지 객체를 `a.b.c` → 문자열 목록으로 편다. */
function flatten(obj: unknown, prefix: string, out: Array<[string, string]>): void {
  if (typeof obj === "string") {
    out.push([prefix, obj]);
    return;
  }
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function politeCasualEntries(file: string): Array<[string, string]> {
  const json = JSON.parse(readFileSync(resolve(KO_DIR, file), "utf8"));
  const entries: Array<[string, string]> = [];
  flatten(json, "", entries);
  return entries
    .filter(([, value]) => POLITE_CASUAL.test(value))
    .filter(([key]) => !(`${file}::${key}` in DELIBERATE));
}

/**
 * 한 제품은 한 어체로 말한다 (이슈 #418).
 *
 * 어체 선택 자체는 제품의 자유다. 하지만 **한 화면에서 섞지 않는 것**은 선택이
 * 아니다 — 같은 카드에서 설명은 격식체, 오류는 친근체면 오류만 톤이 튄다.
 *
 * 실제로 그랬다. 계정 연결 작업이 들어오면서 `auth.json` 의 계정 연결·비밀번호
 * 영역에 해요체가 생겼는데, 같은 설정 화면의 카드 설명은 합니다체였다.
 * ko 메시지 전체에서 합니다체가 476건으로 사실상의 규약이다.
 *
 * 이 테스트는 **우연히 섞이는 것**만 막는다. 친근한 톤이 맞는 자리는 위
 * `DELIBERATE` 에 사유와 함께 적어 둔다.
 */
describe("한국어 메시지가 한 어체로 말한다", () => {
  const files = readdirSync(KO_DIR).filter((f) => f.endsWith(".json"));

  it("메시지 파일을 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} — 우연히 섞인 해요체가 없다`, () => {
      expect(
        politeCasualEntries(file).map(([k, v]) => `${k}: ${v}`),
        "합니다체가 제품의 어체다. 친근한 톤이 맞는 자리면 DELIBERATE 에 사유와 함께 넣는다"
      ).toEqual([]);
    });
  }

  it("예외 목록이 실제로 존재하고 아직 해요체인 키만 담는다", () => {
    // 문구가 바뀌어 예외가 필요 없어졌는데 목록에 남아 있으면, 다음에 그 자리에
    // 우연히 해요체가 들어와도 통과한다.
    for (const entry of Object.keys(DELIBERATE)) {
      const [file, key] = entry.split("::");
      const json = JSON.parse(readFileSync(resolve(KO_DIR, file), "utf8"));
      const value = key
        .split(".")
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], json);

      expect(typeof value, `${entry} 가 메시지에 없다`).toBe("string");
      expect(
        POLITE_CASUAL.test(String(value).trim()),
        `${entry} 는 더 이상 해요체가 아니다 — 목록에서 뺀다`
      ).toBe(true);
    }
  });

  it("예외마다 사유가 적혀 있다", () => {
    for (const [k, why] of Object.entries(DELIBERATE)) {
      expect(why.length, `${k} 에 사유가 없다`).toBeGreaterThan(20);
    }
  });
});
