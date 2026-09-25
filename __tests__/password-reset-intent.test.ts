/**
 * 비밀번호 재설정 의도 쿠키와 복구 세션 판별 (이슈 #456).
 *
 * `/reset-password` 는 복구 링크를 타고 온 사람에게만 열려야 한다. 그런데
 * 복구 링크는 세션을 만들기 때문에 "로그인했는가" 로는 구분이 안 된다.
 * 처음엔 콜백이 받은 `?next=/reset-password` 를 근거로 삼았는데, 그건
 * **사용자가 붙일 수 있는 값**이라 평범한 OAuth 로그인으로 동의 게이트를
 * 건너뛸 수 있었다.
 */

import { describe, it, expect } from "vitest";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_PATH,
  PASSWORD_RESET_COOKIE_MAX_AGE,
  isRecoverySession,
  passwordResetIntentCookie,
  clearPasswordResetIntentCookie,
  hasPasswordResetIntent,
} from "../lib/password-reset-intent";

/** amr 클레임만 담은 가짜 access token. 서명은 보지 않는다. */
function token(claims: unknown): string {
  const payload = Buffer.from(JSON.stringify(claims))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

describe("isRecoverySession", () => {
  it("복구 세션(amr: otp)을 알아본다", () => {
    expect(isRecoverySession(token({ amr: [{ method: "otp" }] }))).toBe(true);
  });

  it("비밀번호 로그인·OAuth 는 복구가 아니다", () => {
    // 이 둘을 복구로 보면 아무나 재설정 화면을 연다.
    expect(isRecoverySession(token({ amr: [{ method: "password" }] }))).toBe(
      false
    );
    expect(isRecoverySession(token({ amr: [{ method: "oauth" }] }))).toBe(false);
  });

  it("여러 수단 중 하나라도 otp 면 복구로 본다", () => {
    expect(
      isRecoverySession(token({ amr: [{ method: "password" }, { method: "otp" }] }))
    ).toBe(true);
  });

  it("읽을 수 없는 토큰은 복구가 아니다", () => {
    // 모를 때 열어주면 그게 구멍이다.
    for (const bad of [
      null,
      undefined,
      "",
      "not-a-jwt",
      "a.b",
      "a.!!!.c",
      token({}),
      token({ amr: "otp" }),
      token({ amr: [] }),
      token({ amr: [null] }),
      token({ amr: ["otp"] }),
    ]) {
      expect(isRecoverySession(bad as string | null | undefined)).toBe(false);
    }
  });
});

describe("의도 쿠키", () => {
  it("HttpOnly 이고 재설정 경로에만 실린다", () => {
    const c = passwordResetIntentCookie(true);
    expect(c.name).toBe(PASSWORD_RESET_COOKIE);
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.secure).toBe(true);
    expect(c.options.sameSite).toBe("lax");
    // 다른 요청에는 아예 실리지 않는다.
    expect(c.options.path).toBe(PASSWORD_RESET_PATH);
    expect(c.options.maxAge).toBe(PASSWORD_RESET_COOKIE_MAX_AGE);
  });

  it("TTL 이 짧다 — 잊힌 의도가 오래 남지 않는다", () => {
    expect(PASSWORD_RESET_COOKIE_MAX_AGE).toBeLessThanOrEqual(900);
  });

  it("지우는 쿠키는 발급과 같은 정의에서 나온다", () => {
    // 이름·Path 가 어긋나면 브라우저가 덮어쓰지 않아 삭제가 조용히 실패한다.
    const issued = passwordResetIntentCookie(false);
    const cleared = clearPasswordResetIntentCookie(false);
    expect(cleared.name).toBe(issued.name);
    expect(cleared.options.path).toBe(issued.options.path);
    expect(cleared.options.maxAge).toBe(0);
  });

  it("값이 정확히 맞아야 의도로 친다", () => {
    expect(hasPasswordResetIntent(passwordResetIntentCookie(true).value)).toBe(
      true
    );
    for (const bad of [null, undefined, "", "0", "true", "yes"]) {
      expect(hasPasswordResetIntent(bad)).toBe(false);
    }
  });
});
