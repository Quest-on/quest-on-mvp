import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ONBOARDING = read("app/(app)/onboarding/page.tsx");

/**
 * 역할은 최초 1회 불변이다. 잘못 굳으면 되돌릴 수 없다.
 *
 * `#174` 3번·4번. 둘 다 같은 화면에서 같은 손해를 낸다.
 */
describe("역할 오선택 방지 (#174-3)", () => {
  it("고르기 전에는 아무것도 선택돼 있지 않다", () => {
    // role 기본값이 "student" 라서, OAuth 역할 쿠키가 만료돼 역할 단계로
    // 떨어진 사람은 학생이 이미 선택된 화면을 본다. 교수로 시작했더라도
    // 그대로 확인하면 학생으로 굳는다.
    expect(ONBOARDING, "라디오가 role 을 그대로 표시한다").not.toMatch(
      /value=\{role\}\s*\n\s*onValueChange/
    );
    expect(ONBOARDING, "선택 여부로 표시를 가르지 않는다").toMatch(
      /value=\{roleChosen \? role : ""\}/
    );
  });

  it("고르기 전에는 진행할 수 없다", () => {
    // 아무것도 선택 안 된 채로 계속하기가 눌리면 role 기본값이 그대로 확정된다.
    expect(ONBOARDING, "계속하기가 선택 없이 열려 있다").toMatch(
      /disabled=\{!roleChosen\}[\s\S]{0,80}setShowConfirm\(true\)/
    );
  });

  it("고르면 선택 사실이 기록된다", () => {
    expect(ONBOARDING).toMatch(/setRoleChosen\(true\)/);
  });
});

describe("역할 불변 고지 (#174-4)", () => {
  it("역할이 복원되면 그 사실을 표시한다", () => {
    // 복원 경로는 역할 단계를 통째로 건너뛰어 확인 다이얼로그가 안 뜬다.
    expect(ONBOARDING, "복원 여부를 기록하지 않는다").toMatch(
      /setRole\(resolved\);\s*\n\s*setRoleRestored\(true\);/
    );
  });

  it("복원된 경우 프로필 완료 전에 불변 고지를 보여준다", () => {
    // "처음 한 번만 정할 수 있고 나중에 바꿀 수 없습니다" 를 한 번도 못 본 채
    // 완료로 역할이 영구 확정되면 안 된다.
    expect(ONBOARDING, "복원 경로에 고지가 없다").toMatch(
      /\{roleRestored && \([\s\S]{0,400}confirmDescSuffix/
    );
  });

  it("고지 문구가 역할에 맞게 갈린다", () => {
    const block = /\{roleRestored && \([\s\S]{0,500}?\)\}/.exec(ONBOARDING);
    expect(block, "고지 블록을 찾지 못했다").toBeTruthy();
    expect(block![0]).toMatch(/confirmDescInstructor/);
    expect(block![0]).toMatch(/confirmDescStudent/);
  });

  it.each(["ko", "en"])("%s 에 불변 문구가 있다", (locale) => {
    const msg = JSON.parse(read(`messages/${locale}/onboarding.json`));
    expect(msg.page?.confirmDescSuffix).toBeTruthy();
    expect(msg.page?.confirmDescInstructor).toBeTruthy();
    expect(msg.page?.confirmDescStudent).toBeTruthy();
  });
});
