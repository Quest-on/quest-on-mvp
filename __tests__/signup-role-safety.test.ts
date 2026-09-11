import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * 회원가입에서 역할을 미리 골라 두지 않는다.
 *
 * `useState<"instructor" | "student">("student")` 였다. 화면은 "계정 유형을
 * 선택해주세요" 라고 하면서 학생 카드에 이미 파란 테두리가 있었고, 그 값이
 * 그대로 나간다.
 *
 *   options: { data: { role } }   → auth user_metadata.role
 *
 * `lib/supabase-auth.ts` 가 그 메타데이터로 프로필 역할을 **최초 1회 확정**한다.
 * 주석이 직접 말한다 — "여기서 추측하면 잘못된 역할로 계정이 굳는다".
 *
 * 즉 교수자가 "강사" 를 안 누르면 영구히 학생이 되고, 바꿀 화면이 없다.
 */
describe("회원가입 역할 선택", () => {
  const src = read("components/auth/CustomSignUp.tsx");

  it("역할 기본값을 두지 않는다", () => {
    expect(src, "student 가 기본 선택이다").not.toMatch(
      /useState<[^>]*>\(\s*["']student["']\s*\)/
    );
  });

  it("고르지 않았다는 상태를 따로 갖는다", () => {
    // role 은 여러 곳에서 문자열로 쓰이므로 nullable 로 바꾸면 파급이 크다.
    // 온보딩(#287)과 같은 방식으로 선택 여부를 별도 상태로 둔다.
    expect(src).toMatch(/roleChosen/);
  });

  it("고르기 전에는 어느 카드도 선택 표시가 안 된다", () => {
    // `role === "student"` 만 보면 기본값이 그대로 칠해진다.
    expect(src, "선택 여부를 안 보고 칠한다").toMatch(
      /roleChosen && role === "student"/
    );
    expect(src).toMatch(/roleChosen && role === "instructor"/);
  });

  it("고르기 전에는 가입을 막는다", () => {
    // 막지 않으면 기본값으로 계정이 굳는다.
    expect(src, "제출 버튼이 선택 여부를 안 본다").toMatch(
      /disabled=\{[^}]*!roleChosen/
    );
  });
});

describe("코드 입력 화면", () => {
  it("코드 칸에 자동으로 커서가 간다", () => {
    // 이 페이지의 유일한 행동이다. 학생이 필드를 한 번 더 눌러야 하면 안 된다.
    const src = read("app/(app)/join/page.tsx");
    expect(src, "autoFocus 가 없다").toMatch(/autoFocus/);
  });
});

describe("인증 폼 자동완성", () => {
  // autocomplete 이 없으면 비밀번호 관리자와 브라우저 자동완성이 안 붙는다.
  // 교수자는 학기마다 한 번 들어오는 사람이라 더 크게 걸린다.
  it("로그인 폼", () => {
    const src = read("components/auth/CustomSignIn.tsx");
    expect(src).toMatch(/autoComplete="email"/);
    expect(src).toMatch(/autoComplete="current-password"/);
  });

  it("회원가입 폼", () => {
    const src = read("components/auth/CustomSignUp.tsx");
    expect(src).toMatch(/autoComplete="email"/);
    expect(src).toMatch(/autoComplete="new-password"/);
  });
});
