import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 온보딩 intake 카피 (#211)
 *
 * 이 화면은 과목 하나만 묻는다. JTBD 1번(평가 대상)은 의도적으로 빼놨는데
 * (`app/(app)/onboarding/page.tsx` 주석 참조) 카피가 따라가지 않아
 * "두 가지만 알려주시면" 이라고 **사실과 다른 말**을 하고 있었다.
 *
 * 선택지를 다시 늘리면 카피도 같이 고치게 강제한다.
 */

const ko = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "ko", "onboarding.json"), "utf8")
) as { page: Record<string, string> };

const en = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "en", "onboarding.json"), "utf8")
) as { page: Record<string, string> };

const PAGE_SOURCE = readFileSync(
  path.join(process.cwd(), "app", "(app)", "onboarding", "page.tsx"),
  "utf8"
);

describe("intake 카피는 묻는 항목 수를 속이지 않는다", () => {
  it("묻지 않는 개수를 주장하는 문구가 없다", () => {
    const all = [...Object.values(ko.page), ...Object.values(en.page)].join(" ");
    expect(all).not.toMatch(/두 가지|두가지|2가지/);
    expect(all).not.toMatch(/two questions/i);
  });

  it("제목이 곧 질문이라 설명·중복 라벨을 두지 않는다", () => {
    // 제목·설명·라벨 3층이 같은 말을 하면 읽는 비용만 늘어난다.
    expect(ko.page.intakeDesc).toBeUndefined();
    expect(en.page.intakeDesc).toBeUndefined();
    expect(ko.page.intakeSubjectLabel).toBeUndefined();
    expect(PAGE_SOURCE).not.toMatch(/intakeDesc|intakeSubjectLabel/);
  });

  it("제목이 질문형이다", () => {
    expect(ko.page.intakeTitle).toMatch(/\?$/);
    expect(en.page.intakeTitle).toMatch(/\?$/);
  });
});

describe("intake 카피는 번역투가 아니다", () => {
  it("진행 상황만 알리는 문구를 쓰지 않는다", () => {
    // "거의 다 됐습니다" = "Almost there/done" 직역. 아무 일도 하지 않는다.
    expect(ko.page.intakeTitle).not.toMatch(/거의 다/);
    expect(en.page.intakeTitle).not.toMatch(/almost/i);
  });

  it("이 화면의 높임이 해요체로 통일돼 있다", () => {
    // 한 화면에서 합쇼체·해요체가 섞이면 말투가 흔들린다.
    const screen = [
      ko.page.intakeTitle,
      ko.page.intakeSubmitBtn,
      ko.page.intakeSkipBtn,
      ko.page.intakeCreating,
    ].join(" ");
    expect(screen).not.toMatch(/습니다|입니다/);
  });
});

describe("선택지는 그대로 유지한다", () => {
  it("과목 5종이 ko/en 양쪽에 있다", () => {
    for (const key of [
      "intakeSubject_humanities",
      "intakeSubject_business",
      "intakeSubject_engineering",
      "intakeSubject_health",
      "intakeSubject_general",
    ]) {
      expect(ko.page[key], `ko.${key}`).toBeTruthy();
      expect(en.page[key], `en.${key}`).toBeTruthy();
    }
  });

  it("제출·건너뛰기 버튼이 남아 있다", () => {
    expect(ko.page.intakeSubmitBtn).toBeTruthy();
    expect(ko.page.intakeSkipBtn).toBeTruthy();
  });
});
