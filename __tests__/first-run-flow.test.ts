import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync("components/instructor/InstructorHomeClient.tsx", "utf8");
const onboardingSource = readFileSync("app/(app)/onboarding/page.tsx", "utf8");
const koInstructor = JSON.parse(readFileSync("messages/ko/instructor.json", "utf8"));
const enInstructor = JSON.parse(readFileSync("messages/en/instructor.json", "utf8"));

describe("첫 사용 교수자 흐름", () => {
  it("데모 안내 한국어 문구에 부정적 권유 표현이 없다", () => {
    expect(koInstructor.home.nextStepDemo).not.toContain("겪어");
  });

  it("데모 완주 전후 안내를 두 언어로 제공한다", () => {
    for (const messages of [koInstructor, enInstructor]) {
      expect(messages.home.nextStepDemo).toBeTruthy();
      expect(messages.home.nextStepDemoCta).toBeTruthy();
      expect(messages.home.nextStepAfterDemo).toBeTruthy();
      expect(messages.home.nextStepAfterDemoCta).toBeTruthy();
    }
  });

  it("데모 상태의 completed 값으로 다음 행동을 분기한다", () => {
    expect(source).toMatch(/completed:\s*boolean/);
    expect(source).toContain("const isDemoCompleted = demoStatus?.completed === true");
    expect(source).toContain('isDemoCompleted ? "/instructor/new"');
  });

  it("데모만 있을 때 드라이브 기본 빈 상태와 다른 안내를 쓴다", () => {
    expect(source).toContain('t("home.demoOnlyEmpty")');
    expect(source).toContain('t("home.demoOnlyEmptyHint")');
    expect(koInstructor.home.demoOnlyEmpty).toBeTruthy();
    expect(enInstructor.home.demoOnlyEmpty).toBeTruthy();
  });

  it("intake 과목을 미선택 상태로 시작하고 선택 전 생성하지 않는다", () => {
    expect(onboardingSource).not.toContain('useState("general")');
    expect(onboardingSource).toMatch(/>\(null\);/);
    expect(onboardingSource).toContain("disabled={isSubmitting || !subject}");
  });

  it("복원된 역할에서는 역할 선택으로 돌아가는 버튼을 숨긴다", () => {
    expect(onboardingSource).toContain("{!roleRestored && (");
    expect(onboardingSource).toContain('className={roleRestored ? "w-full" : "flex-1"}');
  });
});
