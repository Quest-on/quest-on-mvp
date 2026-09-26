/**
 * 비밀번호 재설정 의도 (이슈 #456 · #318).
 *
 * `/reset-password` 는 **복구 링크로 만들어진 바로 그 세션에게만** 열려야 한다.
 * 이전 설계들이 새던 자리를 그대로 시험한다:
 *
 *   1. `?next=/reset-password` — 사용자가 붙일 수 있는 값이었다.
 *   2. `amr: otp` — 매직링크 세션과 구분되지 않았다.
 *   3. 값이 `"1"` 인 쿠키 — 사용자·세션에 묶이지 않아 같은 브라우저의 다른
 *      계정에도 화면이 열렸다.
 *
 * 지금 값은 `(user_id, session_id, 만료)` 에 서버 키로 HMAC 을 붙인 것이다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_COOKIE_MAX_AGE,
  bindingFromClaims,
  clearPasswordResetIntentCookie,
  decodeTrustedAccessToken,
  isPasswordResetIntentKeyConfigured,
  issuePasswordResetIntent,
  matchesPasswordResetBinding,
  passwordResetIntentCookie,
  readPasswordResetIntent,
} from "../lib/password-reset-intent";

const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "44444444-4444-4444-8444-444444444444";
const BINDING = { userId: USER, sessionId: SESSION };

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

function token(claims: unknown): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

beforeEach(() => {
  vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", KEY_A);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("발급과 확인", () => {
  it("발급한 값은 같은 대상으로 읽힌다", () => {
    const value = issuePasswordResetIntent(BINDING, NOW);
    expect(value).not.toBeNull();
    expect(readPasswordResetIntent(value, NOW)).toEqual(BINDING);
  });

  it("키가 없거나 짧으면 발급도 확인도 실패한다 — 모를 때 열지 않는다", () => {
    const issued = issuePasswordResetIntent(BINDING, NOW);

    for (const bad of ["", "   ", Buffer.alloc(16, 1).toString("base64")]) {
      vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", bad);
      expect(isPasswordResetIntentKeyConfigured()).toBe(false);
      expect(issuePasswordResetIntent(BINDING, NOW)).toBeNull();
      expect(readPasswordResetIntent(issued, NOW)).toBeNull();
    }
  });

  it("다른 키로 서명된 값은 거절한다", () => {
    const issued = issuePasswordResetIntent(BINDING, NOW);
    vi.stubEnv("PASSWORD_RESET_INTENT_SECRET", KEY_B);
    expect(readPasswordResetIntent(issued, NOW)).toBeNull();
  });

  it("대상을 바꿔 적으면 서명이 맞지 않는다", () => {
    const issued = issuePasswordResetIntent(BINDING, NOW)!;
    const [v, , , exp, sig] = issued.split(".");

    // 같은 브라우저의 다른 계정으로 옮겨 쓰는 경우.
    expect(readPasswordResetIntent([v, OTHER_USER, SESSION, exp, sig].join("."), NOW)).toBeNull();
    // 같은 사용자의 다른 세션(평범한 로그인)으로 옮겨 쓰는 경우.
    expect(readPasswordResetIntent([v, USER, OTHER_SESSION, exp, sig].join("."), NOW)).toBeNull();
    // 만료를 늘리는 경우.
    expect(
      readPasswordResetIntent([v, USER, SESSION, String(Number(exp) + 60), sig].join("."), NOW)
    ).toBeNull();
  });

  it("10분이 지나면 서명이 맞아도 거절한다", () => {
    const issued = issuePasswordResetIntent(BINDING, NOW);
    const justBefore = NOW + (PASSWORD_RESET_COOKIE_MAX_AGE - 1) * 1000;
    const atExpiry = NOW + PASSWORD_RESET_COOKIE_MAX_AGE * 1000;

    expect(readPasswordResetIntent(issued, justBefore)).toEqual(BINDING);
    expect(readPasswordResetIntent(issued, atExpiry)).toBeNull();
  });

  it("발급 창보다 먼 미래의 만료도 거절한다 — 키가 새도 수명을 못 늘린다", () => {
    const fromFuture = issuePasswordResetIntent(BINDING, NOW + 3600 * 1000);
    expect(readPasswordResetIntent(fromFuture, NOW)).toBeNull();
  });

  it("형식이 틀린 값은 읽지 않는다", () => {
    const issued = issuePasswordResetIntent(BINDING, NOW)!;
    for (const bad of [
      null,
      undefined,
      "",
      "1",
      "true",
      issued.replace(/^v1\./, "v2."),
      `${issued}.extra`,
      issued.split(".").slice(0, 4).join("."),
      "x".repeat(600),
    ]) {
      expect(readPasswordResetIntent(bad, NOW)).toBeNull();
    }
  });

  it("구분자가 섞일 수 있는 식별자로는 발급하지 않는다", () => {
    expect(issuePasswordResetIntent({ userId: "a.b", sessionId: SESSION }, NOW)).toBeNull();
    expect(issuePasswordResetIntent({ userId: USER, sessionId: "" }, NOW)).toBeNull();
  });
});

describe("세션과의 대조", () => {
  it("검증된 클레임에서 sub·session_id 를 꺼낸다", () => {
    expect(bindingFromClaims({ sub: USER, session_id: SESSION, amr: [] })).toEqual(BINDING);
  });

  it("둘 중 하나라도 없거나 형식이 틀리면 대상이 없다", () => {
    for (const bad of [
      null,
      undefined,
      {},
      { sub: USER },
      { session_id: SESSION },
      { sub: USER, session_id: 42 },
      { sub: "a.b", session_id: SESSION },
    ]) {
      expect(bindingFromClaims(bad as Record<string, unknown> | null)).toBeNull();
    }
  });

  it("사용자와 세션이 모두 같아야 참이다", () => {
    expect(matchesPasswordResetBinding(BINDING, { ...BINDING })).toBe(true);
    // 같은 사람이 평범하게 로그인한 다른 세션 — 옛 비밀번호 없이 바꾸면 안 된다.
    expect(matchesPasswordResetBinding(BINDING, { userId: USER, sessionId: OTHER_SESSION })).toBe(false);
    expect(matchesPasswordResetBinding(BINDING, { userId: OTHER_USER, sessionId: SESSION })).toBe(false);
    expect(matchesPasswordResetBinding(null, BINDING)).toBe(false);
    expect(matchesPasswordResetBinding(BINDING, null)).toBe(false);
  });

  it("verify 가 받은 토큰의 payload 를 읽는다", () => {
    expect(decodeTrustedAccessToken(token({ sub: USER, session_id: SESSION }))).toEqual({
      sub: USER,
      session_id: SESSION,
    });
    for (const bad of [null, undefined, "", "a.b", "a.!!!.c", token("str"), token(null)]) {
      expect(decodeTrustedAccessToken(bad as string | null)).toBeNull();
    }
  });
});

describe("의도 쿠키", () => {
  it("HttpOnly · SameSite=Strict · 짧은 수명", () => {
    const c = passwordResetIntentCookie("value", true);
    expect(c.name).toBe(PASSWORD_RESET_COOKIE);
    expect(c.value).toBe("value");
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.secure).toBe(true);
    // 다른 사이트에서 시작된 요청에는 실리지 않는다.
    expect(c.options.sameSite).toBe("strict");
    // 화면과 완료 API 두 곳이 읽는다.
    expect(c.options.path).toBe("/");
    expect(c.options.maxAge).toBe(PASSWORD_RESET_COOKIE_MAX_AGE);
    expect(PASSWORD_RESET_COOKIE_MAX_AGE).toBeLessThanOrEqual(900);
  });

  it("지우는 쿠키는 발급과 같은 정의에서 나온다", () => {
    // 이름·Path 가 어긋나면 브라우저가 덮어쓰지 않아 삭제가 조용히 실패한다.
    const issued = passwordResetIntentCookie("value", false);
    const cleared = clearPasswordResetIntentCookie(false);
    expect(cleared.name).toBe(issued.name);
    expect(cleared.options.path).toBe(issued.options.path);
    expect(cleared.options.sameSite).toBe(issued.options.sameSite);
    expect(cleared.value).toBe("");
    expect(cleared.options.maxAge).toBe(0);
  });
});
