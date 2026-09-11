/**
 * 역할 불변 계약의 안내와 충돌 처리 (에픽 #79 P1).
 *
 * 두 가지가 틀려 있었다.
 *
 * 1. 확인창이 "역할 선택 후에도 프로필 설정에서 변경할 수 있습니다"라고 말했다.
 *    실제 계약은 최초 1회 claim 이고 `PATCH /api/user/profile` 은 role 을
 *    아예 거부한다(#124). 사용자가 **되돌릴 수 없는 선택을 되돌릴 수 있다고
 *    믿고** 하게 만드는 안내다.
 *
 * 2. role claim 의 409 를 무조건 삼켰다. 다른 탭이 반대 역할을 먼저 확정한
 *    경우에도 화면에서 고른 역할로 하위 프로필을 계속 만들어, `profiles.role`
 *    과 `student_profiles`/`instructor_profiles` 가 갈라진다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("확인창이 불변 계약을 정확히 말한다", () => {
  const ko = JSON.parse(read("messages/ko/onboarding.json"));
  const en = JSON.parse(read("messages/en/onboarding.json"));

  it("나중에 바꿀 수 있다고 말하지 않는다", () => {
    // 이 문구가 되살아나면 사용자는 되돌릴 수 없는 선택을 가볍게 한다.
    expect(ko.page.confirmDescSuffix).not.toMatch(/변경할 수 있|바꿀 수 있|변경 가능/);
    expect(en.page.confirmDescSuffix).not.toMatch(/can change|change this later/i);
  });

  it("한 번만 정할 수 있다고 명시한다", () => {
    expect(ko.page.confirmDescSuffix).toMatch(/한 번만|바꿀 수 없/);
    expect(en.page.confirmDescSuffix).toMatch(/once|cannot be changed/i);
  });

  it("ko·en 이 같은 사실을 말한다", () => {
    // 한쪽만 고치면 다른 로케일 사용자는 계속 거짓 안내를 받는다.
    const koSaysImmutable = /한 번만|바꿀 수 없/.test(ko.page.confirmDescSuffix);
    const enSaysImmutable = /once|cannot be changed/i.test(en.page.confirmDescSuffix);
    expect(koSaysImmutable).toBe(enSaysImmutable);
  });
});

describe("409 에서 확정 역할을 확인한다", () => {
  const source = read("app/(app)/onboarding/page.tsx");

  it("서버가 돌려준 확정 역할을 읽는다", () => {
    expect(source).toMatch(/details\?\.role/);
  });

  it("다른 역할이면 하위 프로필 쓰기를 중단한다", () => {
    // 이게 없으면 profiles.role 과 역할별 프로필이 갈라진 계정이 생긴다.
    const block = source.slice(
      source.indexOf("if (roleRes.status === 409)"),
      source.indexOf("2. profiles 테이블에")
    );
    expect(block).toMatch(/settledRole !== role/);
    expect(block).toMatch(/return;/);
  });

  it("같은 역할 409 는 성공으로 넘어간다 — 재시도·중복 클릭이 막히면 안 된다", () => {
    const block = source.slice(
      source.indexOf("if (roleRes.status === 409)"),
      source.indexOf("2. profiles 테이블에")
    );
    // 409 자체를 throw 하면 새로고침 후 재시도가 영영 막힌다.
    expect(block).not.toMatch(/throw new Error\("Role claim failed"\)[\s\S]{0,40}409/);
  });

  it("409 가 아닌 실패는 여전히 오류다", () => {
    expect(source).toMatch(/else if \(!roleRes\.ok\) \{[\s\S]*?throw new Error/);
  });

  it("충돌 안내 문구가 next-intl 에 있다", () => {
    const ko = JSON.parse(read("messages/ko/onboarding.json"));
    const en = JSON.parse(read("messages/en/onboarding.json"));
    expect(ko.page.roleAlreadyDifferent).toBeTruthy();
    expect(en.page.roleAlreadyDifferent).toBeTruthy();
    expect(source).toMatch(/t\("roleAlreadyDifferent"\)/);
  });
});
