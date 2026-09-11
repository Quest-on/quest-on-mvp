import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * subject_ref 파생 계약.
 *
 * 이 모듈이 Option C 의 심장이다. 파생이 흔들리면 원장이 둘로 갈라지고,
 * 키가 새면 탈퇴자 재식별이 가능해진다.
 */

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

describe("deriveSubjectRef", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, CONSENT_SUBJECT_HMAC_KEY_V1: VALID_KEY };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function load() {
    return await import("@/lib/consent-subject-ref");
  }

  it("같은 user_id 는 항상 같은 subject_ref 를 만든다", async () => {
    const { deriveSubjectRef } = await load();
    const a = deriveSubjectRef("user-alpha");
    const b = deriveSubjectRef("user-alpha");
    expect(a).toBe(b);
  });

  it("다른 user_id 는 다른 subject_ref 를 만든다", async () => {
    const { deriveSubjectRef } = await load();
    expect(deriveSubjectRef("user-alpha")).not.toBe(deriveSubjectRef("user-beta"));
  });

  it("결과에 원 user_id 가 남지 않는다", async () => {
    const { deriveSubjectRef } = await load();
    const ref = deriveSubjectRef("user-alpha");
    expect(ref).not.toContain("user-alpha");
  });

  it("v1: + 64자리 소문자 hex 형태다", async () => {
    const { deriveSubjectRef, isValidSubjectRef } = await load();
    const ref = deriveSubjectRef("user-alpha");
    expect(ref).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(isValidSubjectRef(ref)).toBe(true);
  });

  it("키가 바뀌면 파생값도 바뀐다", async () => {
    const { deriveSubjectRef } = await load();
    const withFirstKey = deriveSubjectRef("user-alpha");

    vi.resetModules();
    process.env.CONSENT_SUBJECT_HMAC_KEY_V1 = Buffer.alloc(32, 9).toString("base64");
    const { deriveSubjectRef: derive2 } = await import("@/lib/consent-subject-ref");

    expect(derive2("user-alpha")).not.toBe(withFirstKey);
  });

  it("키가 없으면 fail-closed 로 throw 한다", async () => {
    vi.resetModules();
    delete process.env.CONSENT_SUBJECT_HMAC_KEY_V1;
    const { deriveSubjectRef } = await import("@/lib/consent-subject-ref");
    expect(() => deriveSubjectRef("user-alpha")).toThrow(/CONSENT_SUBJECT_HMAC_KEY_V1/);
  });

  it("키가 32바이트 미만이면 throw 하고 키 값을 노출하지 않는다", async () => {
    vi.resetModules();
    const shortKey = Buffer.alloc(8, 1).toString("base64");
    process.env.CONSENT_SUBJECT_HMAC_KEY_V1 = shortKey;
    const { deriveSubjectRef } = await import("@/lib/consent-subject-ref");

    try {
      deriveSubjectRef("user-alpha");
      throw new Error("throw 했어야 한다");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("8 bytes");
      expect(message).not.toContain(shortKey);
    }
  });

  it("빈 user_id 는 거절한다", async () => {
    const { deriveSubjectRef } = await load();
    expect(() => deriveSubjectRef("")).toThrow();
    expect(() => deriveSubjectRef("   ")).toThrow();
  });

  it("잘못된 형태는 isValidSubjectRef 가 거른다", async () => {
    const { isValidSubjectRef } = await load();
    expect(isValidSubjectRef("v2:" + "a".repeat(64))).toBe(false);
    expect(isValidSubjectRef("v1:" + "A".repeat(64))).toBe(false);
    expect(isValidSubjectRef("v1:short")).toBe(false);
    expect(isValidSubjectRef("user-alpha")).toBe(false);
  });
});
