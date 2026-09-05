import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

/**
 * 이탈 문구가 실제 목적지와 맞아야 한다. (#174 · 8-2)
 *
 * 데모 응시 중 이탈하면 `/instructor/{demoExamId}` 로 간다. 그런데 문구는
 * "학생 대시보드로 이동합니다" 였다. 방금 온보딩을 마친 사람에게 다음 화면을
 * 잘못 예고하면 그 화면에서 뭘 해야 할지 알 수 없다.
 */
describe("이탈 문구와 목적지 일치", () => {
  it("데모용 문구가 ko/en 모두 있다", () => {
    for (const lang of ["ko", "en"]) {
      const m = json(`messages/${lang}/exam.json`);
      expect(m.dialogs?.exitDescriptionDemo, `${lang} 누락`).toBeTruthy();
      expect(m.dialogs?.exitDescription, `${lang} 기본 문구 누락`).toBeTruthy();
    }
  });

  it("두 문구가 서로 다른 목적지를 말한다", () => {
    const ko = json("messages/ko/exam.json").dialogs;
    expect(ko.exitDescriptionDemo).not.toBe(ko.exitDescription);
    expect(ko.exitDescription).toMatch(/학생/);
    expect(ko.exitDescriptionDemo).not.toMatch(/학생 대시보드/);
  });

  it("다이얼로그가 목적지에 따라 문구를 고른다", () => {
    const s = read("components/exam/ExamDialogs.tsx");
    expect(s).toMatch(/exitToDemoDetail \? "dialogs\.exitDescriptionDemo" : "dialogs\.exitDescription"/);
  });

  it("호출부가 실제 목적지 조건과 같은 값을 넘긴다", () => {
    // 문구 조건과 router.push 조건이 갈리면 또 어긋난다.
    const s = read("app/(app)/exam/[code]/page.tsx");
    expect(s).toMatch(/exitDestination[\s\S]{0,120}session\.demoPreview && session\.demoExamId/);
    expect(s).toMatch(/exitToDemoDetail=\{Boolean\(session\.demoPreview && session\.demoExamId\)\}/);
  });
});

/**
 * `demo_answered` 마일스톤이 실제로 기록돼야 한다. (#174 · 8-3)
 *
 * 상수와 퍼널 정의에만 있고 기록 호출부가 저장소 전체에 0개였다. 선언만
 * 있으면 퍼널에 그 단계가 영원히 0 으로 남는다.
 */
describe("demo_answered 마일스톤", () => {
  const SOURCE = read("app/api/supa/handlers/session-handlers.ts");

  it("제출 경계에서 기록한다", () => {
    expect(SOURCE).toMatch(/ONBOARDING_EVENTS\.DEMO_ANSWERED/);
    expect(SOURCE).toMatch(/recordOnboardingEvent\(/);
  });

  it("데모 소유자일 때만 센다", () => {
    // 일반 학생 제출까지 세면 지표가 부풀고, #167 이 고친 오염이 재발한다.
    expect(SOURCE).toMatch(/isDemoPreview\(/);
    expect(SOURCE).toMatch(/answeredPreview === true/);
  });

  it("판정 불능(null)이면 기록하지 않는다", () => {
    // `=== true` 여야 한다. truthy 검사면 null 이 걸러지지만 의도가 흐려지고,
    // 부정 검사(`!== false`)면 null 이 통과해 오염이 시작된다.
    expect(SOURCE).not.toMatch(/answeredPreview !== false/);
  });

  it("role 을 instructor 로 기록한다", () => {
    // 데모 소유자는 교수자다. student 로 박으면 #167 과 같은 오염이 난다.
    const idx = SOURCE.indexOf("ONBOARDING_EVENTS.DEMO_ANSWERED");
    expect(SOURCE.slice(Math.max(0, idx - 400), idx)).toMatch(/role: "instructor"/);
  });

  it("퍼널 정의에 그 단계가 있다", () => {
    // 기록만 하고 퍼널에 없으면 화면에 안 나온다.
    expect(read("lib/onboarding-funnel.ts")).toMatch(/DEMO_ANSWERED/);
  });
});
