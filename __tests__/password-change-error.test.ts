/**
 * 비밀번호 변경 실패를 사용자 문구로 옮긴다 (이슈 #447).
 *
 * Supabase 의 "Secure password change"(`security_update_password_require_reauthentication`)
 * 를 켜면, 세션이 만들어진 지 24시간이 지난 상태의 `updateUser({ password })` 는
 * `reauthentication_needed` 로 거절된다. 설정 화면은 비밀번호 보유 계정이면 먼저
 * `signInWithPassword` 로 새 세션을 만들어 걸리지 않지만, **소셜 전용 계정의
 * 비밀번호 설정**은 재로그인 없이 바로 부르므로 걸린다.
 *
 * 예전에는 `updateError.message` 를 그대로 띄워 영문 원문이 나왔다. 설정을 켜기
 * 전에 문구부터 맞춘다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { passwordUpdateErrorKey } from "@/lib/password-policy";

describe("passwordUpdateErrorKey (#447)", () => {
  it("재인증 요구는 다시 로그인하라는 안내로 옮긴다", () => {
    expect(passwordUpdateErrorKey("reauthentication_needed")).toBe("reauthRequired");
  });

  it("서버 비밀번호 정책 위반은 길이 안내로 옮긴다 — 서버 하한이 8이다 (#461)", () => {
    expect(passwordUpdateErrorKey("weak_password")).toBe("newPasswordTooShort");
  });

  it("모르는 코드와 코드 없음은 일반 실패 문구다 — 원문을 띄우지 않는다", () => {
    expect(passwordUpdateErrorKey("something_else")).toBe("updateFailed");
    expect(passwordUpdateErrorKey(undefined)).toBe("updateFailed");
  });

  it("설정 화면이 이 매핑을 쓰고 SDK 원문을 띄우지 않는다", () => {
    const src = readFileSync("components/settings/ChangePasswordForm.tsx", "utf8");
    expect(src).toMatch(/passwordUpdateErrorKey\(updateError\.code\)/);
    expect(src).not.toMatch(/toast\.error\(updateError\.message/);
  });

  it("두 로케일 모두 안내 문구가 있다", () => {
    for (const locale of ["ko", "en"]) {
      const messages = JSON.parse(readFileSync(`messages/${locale}/auth.json`, "utf8"));
      expect(messages.changePassword.reauthRequired, locale).toBeTruthy();
    }
  });
});
