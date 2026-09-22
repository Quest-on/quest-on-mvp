/**
 * `lib/password-policy.ts` — 비밀번호 정책이 한 곳에만 있는지 (이슈 #318).
 *
 * 이 모듈이 생긴 이유는 숫자 8 이 두 화면에 각각 놓이는 걸 막기 위해서다.
 * 그래서 값 검증뿐 아니라 **소비 지점이 실제로 이 모듈을 쓰는지**도 본다 —
 * 상수만 공용으로 빼두고 화면이 자기 숫자를 계속 쓰면 아무것도 막지 못한다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PASSWORD_MIN_LENGTH,
  validatePasswordPair,
} from "../lib/password-policy";

describe("validatePasswordPair", () => {
  it("최소 길이를 넘기면 통과한다", () => {
    const ok = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordPair(ok, ok)).toBeNull();
  });

  it("경계값 — 한 글자 모자라면 막고, 정확히 맞으면 통과한다", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validatePasswordPair(short, short)).toBe("newPasswordTooShort");

    const exact = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordPair(exact, exact)).toBeNull();
  });

  it("확인란이 다르면 막는다", () => {
    const pw = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordPair(pw, pw + "b")).toBe("passwordMismatch");
  });

  it("둘 다 틀리면 길이를 먼저 말한다", () => {
    // 불일치를 먼저 보여주면, 확인란을 고친 뒤에야 길이 문제를 알게 된다.
    expect(validatePasswordPair("short", "different")).toBe(
      "newPasswordTooShort"
    );
  });

  it("빈 값도 길이 문제로 잡는다", () => {
    expect(validatePasswordPair("", "")).toBe("newPasswordTooShort");
  });
});

describe("정책이 한 곳에만 있다", () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8");

  const consumers = [
    "components/settings/ChangePasswordForm.tsx",
    "components/auth/ResetPasswordForm.tsx",
  ];

  it.each(consumers)("%s 는 정책 모듈에서 가져온다", (file) => {
    const src = read(file);
    expect(src).toContain("@/lib/password-policy");
    expect(src).toContain("PASSWORD_MIN_LENGTH");
  });

  it.each(consumers)("%s 에 자기만의 최소 길이 숫자가 없다", (file) => {
    const src = read(file);
    // `MIN_PASSWORD_LENGTH = 8` 같은 지역 상수가 되살아나는 걸 막는다.
    expect(src).not.toMatch(/(?:MIN|min)[A-Za-z_]*(?:LENGTH|Length)\s*=\s*\d/);
  });
});
