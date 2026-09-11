import { describe, expect, it } from "vitest";
import {
  ONBOARDING_ROLE_COOKIE,
  isSignupRole,
  readRoleCookie,
  resolveSignupRole,
} from "@/lib/onboarding-role";

describe("isSignupRole", () => {
  it("역할 값만 통과시킨다", () => {
    expect(isSignupRole("instructor")).toBe(true);
    expect(isSignupRole("student")).toBe(true);
  });

  it("역할이 아닌 값은 전부 거부한다", () => {
    for (const v of ["admin", "", null, undefined, 0, {}, ["student"]]) {
      expect(isSignupRole(v)).toBe(false);
    }
  });
});

describe("readRoleCookie", () => {
  it("쿠키에서 역할을 읽는다", () => {
    expect(readRoleCookie(`${ONBOARDING_ROLE_COOKIE}=instructor`)).toBe("instructor");
  });

  it("다른 쿠키가 섞여 있어도 찾아낸다", () => {
    const jar = `NEXT_LOCALE=ko; ${ONBOARDING_ROLE_COOKIE}=student; sb-access-token=xyz`;
    expect(readRoleCookie(jar)).toBe("student");
  });

  it("접두사만 같은 쿠키 이름에 속지 않는다", () => {
    expect(readRoleCookie(`${ONBOARDING_ROLE_COOKIE}_backup=instructor`)).toBeNull();
    expect(readRoleCookie(`x_${ONBOARDING_ROLE_COOKIE}=instructor`)).toBeNull();
  });

  it("퍼센트 인코딩된 값을 디코드한다", () => {
    expect(readRoleCookie(`${ONBOARDING_ROLE_COOKIE}=%73tudent`)).toBe("student");
  });

  it("값이 역할이 아니면 null 이다 — 조작된 쿠키를 신뢰하지 않는다", () => {
    expect(readRoleCookie(`${ONBOARDING_ROLE_COOKIE}=admin`)).toBeNull();
    expect(readRoleCookie(`${ONBOARDING_ROLE_COOKIE}=`)).toBeNull();
  });

  it("쿠키가 없거나 비어 있으면 null 이다", () => {
    expect(readRoleCookie("")).toBeNull();
    expect(readRoleCookie(null)).toBeNull();
    expect(readRoleCookie(undefined)).toBeNull();
    expect(readRoleCookie("NEXT_LOCALE=ko")).toBeNull();
  });
});

describe("resolveSignupRole (AC-1)", () => {
  // 이메일 가입 경로: signUp({ options: { data: { role } } }) 로 metadata 에 실린다.
  it("auth metadata 의 역할을 해석한다 — 이메일 가입 경로", () => {
    expect(resolveSignupRole({ metadataRole: "instructor" })).toBe("instructor");
  });

  // OAuth 경로: signInWithOAuth 가 data 를 지원하지 않아 쿠키로 온다(#87이 기록).
  it("쿠키의 역할을 해석한다 — OAuth 경로 (AC-1a)", () => {
    expect(
      resolveSignupRole({ cookieString: `${ONBOARDING_ROLE_COOKIE}=student` })
    ).toBe("student");
  });

  it("metadata 가 쿠키보다 우선한다", () => {
    expect(
      resolveSignupRole({
        metadataRole: "instructor",
        cookieString: `${ONBOARDING_ROLE_COOKIE}=student`,
      })
    ).toBe("instructor");
  });

  // 이게 이 함수의 존재 이유다. 추측해서 건너뛰면 잘못된 역할로 계정이 굳는다.
  it("해석할 수 없으면 null 이다 — 호출부는 역할 단계를 보여줘야 한다", () => {
    expect(resolveSignupRole({})).toBeNull();
    expect(resolveSignupRole({ metadataRole: null, cookieString: "" })).toBeNull();
  });

  it("쿠키가 소실된 OAuth 사용자는 null 이다 — 기존 동작(역할 질문)으로 안전하게 폴백", () => {
    expect(resolveSignupRole({ cookieString: "NEXT_LOCALE=ko" })).toBeNull();
  });

  it("metadata 에 이상한 값이 들어와도 쿠키로 넘어가지 않고 쿠키를 본다", () => {
    expect(
      resolveSignupRole({
        metadataRole: "admin",
        cookieString: `${ONBOARDING_ROLE_COOKIE}=instructor`,
      })
    ).toBe("instructor");
  });
  // #87 에서 localStorage 폴백을 제거했다. 쿠키는 서버(`POST /api/user/role`)도
  // 읽으므로, 클라이언트만 볼 수 있는 저장소를 역할 흐름에 남겨둘 이유가 없다.
  it("localStorage 는 더 이상 해석 소스가 아니다 (#87)", () => {
    expect(
      resolveSignupRole({ localStorageRole: "instructor" } as never)
    ).toBeNull();
  });

  it("우선순위는 metadata > 쿠키 다", () => {
    expect(
      resolveSignupRole({
        metadataRole: "instructor",
        cookieString: `${ONBOARDING_ROLE_COOKIE}=student`,
      })
    ).toBe("instructor");

    expect(
      resolveSignupRole({
        cookieString: `${ONBOARDING_ROLE_COOKIE}=student`,
      })
    ).toBe("student");
  });

});
